/**
 * OPTIMIST ORACLE — адаптер ответов API «Помощника Дампира».
 *
 * Приоритет источников:
 * 1) best_path из серверного JSON — сохраняем последовательность без пересчёта.
 * 2) next_cost / next_gain — показываем следующий шаг по фактическому ответу.
 * 3) Никакие игровые цены и приросты не вычисляются по приблизительным формулам.
 */
const SECTION_KEYS = ['conclave', 'levels', 'bonds', 'auras', 'presences', 'skins', 'talents', 'courtyard', 'books'];

const RESOURCE_LABELS = {
  blood: 'Кровь',
  conclave: 'Очки Конклава',
  trust: 'Доверие',
  aura: 'Предметы вдохновения',
  presence: 'Предметы веяния',
  fabric: 'Ткань',
  scripts: 'Рукописи',
  scrolls: 'Свитки',
};

const SECTION_LABELS = {
  conclave: 'Конклав',
  levels: 'Уровни смотрителей',
  bonds: 'Кровные узы',
  auras: 'Вдохновения',
  presences: 'Веяния',
  skins: 'Облики',
  talents: 'Таланты',
  courtyard: 'Сад',
  books: 'Книги',
};

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getRecordId(value) {
  return value === null || value === undefined ? '' : String(value);
}

function hasSection(root) {
  return SECTION_KEYS.some(key => root && Object.prototype.hasOwnProperty.call(root, key));
}

/**
 * Accepts a plain API response, JSON text, or a common {data}/{result} wrapper.
 * Returns the original response object; it is never mutated by Oracle.
 */
export function normalizeOracleSnapshot(input) {
  let parsed = input;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch (error) {
      throw new Error(`Некорректный JSON: ${error.message}`);
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Ожидается JSON-объект с ответами API.');
  }

  let root = parsed;
  for (let depth = 0; depth < 3 && !hasSection(root); depth++) {
    if (root.data && typeof root.data === 'object' && !Array.isArray(root.data)) root = root.data;
    else if (root.result && typeof root.result === 'object' && !Array.isArray(root.result)) root = root.result;
    else break;
  }

  if (!hasSection(root)) {
    throw new Error('Не найдены разделы API (levels, conclave, bonds, auras и другие).');
  }
  return root;
}

function addPath(paths, section, label, bestPath, entityId = null) {
  if (!bestPath || !Array.isArray(bestPath.runs) || bestPath.runs.length === 0) return;
  bestPath.runs.forEach((run, index) => {
    if (!run || run.key === null || run.key === undefined || !Number.isFinite(Number(run.to))) return;
    paths.push({
      index: paths.length + 1,
      localIndex: index + 1,
      section,
      sectionLabel: SECTION_LABELS[section] || section,
      entityId: entityId === null ? null : getRecordId(entityId),
      key: getRecordId(run.key),
      target: Number(run.to),
      label,
    });
  });
}

function makeCandidate(group, resource, available, fields) {
  const cost = numberOrNull(fields.step?.next_cost);
  const gain = numberOrNull(fields.step?.next_gain);
  const current = numberOrNull(fields.current);
  const maximum = numberOrNull(fields.maximum);
  const budget = numberOrNull(available) ?? 0;

  if (cost === null || gain === null || gain <= 0) return null;
  if (current !== null && maximum !== null && current >= maximum) return null;
  if (Array.isArray(fields.step?.next_missing) && fields.step.next_missing.length > 0) return null;
  if (cost > budget) return null;

  return {
    group,
    resource,
    resourceLabel: RESOURCE_LABELS[resource] || resource,
    label: fields.label || 'Следующее улучшение',
    entityId: fields.entityId === null || fields.entityId === undefined ? null : getRecordId(fields.entityId),
    detail: fields.detail || '',
    current,
    maximum,
    cost,
    gain,
    efficiency: cost > 0 ? gain / cost : null,
    free: cost === 0,
  };
}

function addCandidateGroup(groups, candidate) {
  if (!candidate) return;
  (groups[candidate.resource] ||= []).push(candidate);
}

/**
 * Build an Oracle view model from a server response.
 * Efficiency is ranked only inside a resource group; blood, trust, fabric and
 * tokens are intentionally never compared against each other.
 */
export function buildOraclePlan(input, names = {}) {
  const snapshot = normalizeOracleSnapshot(input);
  const paths = [];
  const recommendations = {};

  const wardenNames = names.wardens || {};
  const loverNames = names.lovers || {};
  const itemNames = names.items || {};
  const getWardenName = id => wardenNames[getRecordId(id)] || `Смотритель ${id}`;
  const getLoverName = id => loverNames[getRecordId(id)] || `Партнёр ${id}`;
  const getItemName = id => itemNames[getRecordId(id)] || `Предмет ${id}`;

  const conclave = snapshot.conclave || {};
  addPath(paths, 'conclave', 'Маршрут Конклава', conclave.best_path);

  const levels = snapshot.levels || {};
  addPath(paths, 'levels', 'Маршрут уровней', levels.best_path);
  const bloodLeft = numberOrNull(levels.left) ?? numberOrNull(levels.blood) ?? 0;
  for (const warden of levels.wardens || []) {
    addCandidateGroup(recommendations, makeCandidate('levels', 'blood', bloodLeft, {
      step: warden,
      current: warden.target ?? warden.level,
      maximum: warden.max_target,
      entityId: warden.warden_id,
      label: getWardenName(warden.warden_id),
      detail: `ур. ${warden.target ?? warden.level} → следующий уровень`,
    }));
  }

  const conclaveLeft = numberOrNull(conclave.left) ?? numberOrNull(conclave.points) ?? 0;
  for (const attribute of conclave.attributes || []) {
    addCandidateGroup(recommendations, makeCandidate('conclave', 'conclave', conclaveLeft, {
      step: attribute,
      current: attribute.target ?? attribute.level,
      maximum: attribute.max_target,
      entityId: attribute.attribute,
      label: `Конклав · ${attribute.attribute}`,
      detail: `ур. ${attribute.target ?? attribute.level} → следующий уровень`,
    }));
  }

  const bonds = snapshot.bonds || {};
  const trustLeft = numberOrNull(bonds.left) ?? numberOrNull(bonds.trust) ?? 0;
  for (const lover of bonds.lovers || []) {
    addPath(paths, 'bonds', `Маршрут уз · ${getLoverName(lover.lover_id)}`, lover.best_path, lover.lover_id);
    for (const bond of lover.bonds || []) {
      for (const kind of ['level', 'percent']) {
        const step = bond[kind];
        if (!step) continue;
        addCandidateGroup(recommendations, makeCandidate('bonds', 'trust', trustLeft, {
          step,
          current: step.target ?? step.level,
          maximum: step.max_target,
          entityId: lover.lover_id,
          label: `${getLoverName(lover.lover_id)} · ${bond.attribute}`,
          detail: kind === 'percent' ? 'процентная ступень связи' : 'уровень связи',
        }));
      }
    }
  }

  const auras = snapshot.auras || {};
  for (const item of auras.items || []) {
    addPath(paths, 'auras', `Путь вдохновения · ${getItemName(item.item_id)}`, item.best_path, item.item_id);
    const available = numberOrNull(item.left) ?? numberOrNull(item.count) ?? 0;
    for (const warden of item.wardens || []) {
      for (const level of warden.levels || []) {
        addCandidateGroup(recommendations, makeCandidate('auras', 'aura', available, {
          step: level,
          current: level.target ?? level.level,
          maximum: level.max_target ?? level.max_level,
          entityId: warden.warden_id,
          label: `${getWardenName(warden.warden_id)} · ${getItemName(item.item_id)}`,
          detail: 'следующая ступень вдохновения',
        }));
      }
    }
  }

  const presences = snapshot.presences || {};
  for (const item of presences.items || []) {
    addPath(paths, 'presences', `Путь веяния · ${getItemName(item.item_id)}`, item.best_path, item.item_id);
    const available = numberOrNull(item.left) ?? numberOrNull(item.count) ?? 0;
    for (const lover of item.lovers || []) {
      for (const level of lover.levels || []) {
        addCandidateGroup(recommendations, makeCandidate('presences', 'presence', available, {
          step: level,
          current: level.target ?? level.level,
          maximum: level.max_target ?? level.max_level,
          entityId: lover.lover_id,
          label: `${getLoverName(lover.lover_id)} · ${getItemName(item.item_id)}`,
          detail: 'следующая ступень веяния',
        }));
      }
    }
  }

  const skins = snapshot.skins || {};
  for (const fabric of skins.fabrics || []) {
    const available = numberOrNull(fabric.left) ?? numberOrNull(fabric.count) ?? 0;
    for (const skin of fabric.skins || []) {
      addCandidateGroup(recommendations, makeCandidate('skins', 'fabric', available, {
        step: skin,
        current: skin.target ?? skin.level,
        maximum: skin.max_target ?? skin.max_level,
        entityId: skin.skin_id,
        label: `Облик ${skin.skin_id}`,
        detail: `${String(fabric.quality || skin.quality || '').toUpperCase()} · ${skin.next_kind || 'следующий шаг'}`,
      }));
    }
  }

  const talents = snapshot.talents || {};
  for (const kind of ['scripts', 'scrolls']) {
    for (const item of talents[kind] || []) {
      const available = numberOrNull(item.left) ?? 0;
      for (const warden of item.wardens || []) {
        for (const talent of warden.talents || []) {
          addCandidateGroup(recommendations, makeCandidate('talents', kind, available, {
            step: talent,
            current: talent.final ?? talent.level,
            maximum: talent.cap,
            entityId: warden.warden_id,
            label: `${getWardenName(warden.warden_id)} · ${talent.attribute}`,
            detail: `${kind === 'scripts' ? 'рукопись' : 'свиток'} · ${item.item_id}`,
          }));
        }
      }
    }
  }

  for (const [resource, candidates] of Object.entries(recommendations)) {
    candidates.sort((a, b) => {
      if (a.free !== b.free) return a.free ? -1 : 1;
      return (b.efficiency ?? 0) - (a.efficiency ?? 0);
    });
  }

  const attributes = Array.isArray(snapshot.attributes) ? snapshot.attributes.map(row => ({
    attribute: row.attribute,
    total: numberOrNull(row.total) ?? 0,
  })) : [];
  const gains = Array.isArray(snapshot.gain?.attributes) ? snapshot.gain.attributes.map(row => ({
    attribute: row.attribute,
    total: numberOrNull(row.total) ?? 0,
  })) : [];

  return {
    snapshot,
    metrics: {
      total: numberOrNull(snapshot.total) ?? 0,
      gain: numberOrNull(snapshot.gain?.total) ?? 0,
      attributes,
      gains,
      blood: {
        available: numberOrNull(levels.blood) ?? 0,
        spent: numberOrNull(levels.spent) ?? 0,
        left: bloodLeft,
      },
      conclave: {
        available: numberOrNull(conclave.points) ?? 0,
        spent: numberOrNull(conclave.spent) ?? 0,
        left: conclaveLeft,
      },
      trust: {
        available: numberOrNull(bonds.trust) ?? 0,
        spent: numberOrNull(bonds.spent) ?? 0,
        left: trustLeft,
      },
    },
    paths,
    recommendations,
    routeCount: paths.length,
    hasServerPath: paths.length > 0,
    notes: [
      'Серверный best_path показан в исходном порядке и не пересчитывается.',
      'next_cost и next_gain берутся напрямую из загруженного JSON-ответа.',
      'Эффективность сравнивается только внутри одинакового типа ресурса.',
    ],
  };
}
