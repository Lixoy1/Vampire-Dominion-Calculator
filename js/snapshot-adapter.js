/**
 * Normalize captured Vampire Dominion calculation responses.
 *
 * This adapter intentionally does not calculate game values. It only converts
 * server-supplied numeric strings into numbers and keeps source fields intact.
 * Unknown fields, missing fields and null values are preserved in `raw`.
 */

export const SNAPSHOT_ATTRIBUTES = Object.freeze([
  'strength',
  'allure',
  'intellect',
  'spirit',
]);

export function toFiniteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeAttributeRows(rows, valueKey = 'total') {
  if (!Array.isArray(rows)) return {};
  const result = {};
  for (const row of rows) {
    if (!row || !SNAPSHOT_ATTRIBUTES.includes(row.attribute)) continue;
    result[row.attribute] = toFiniteNumber(row[valueKey]);
  }
  return result;
}

function normalizeNextStep(row) {
  if (!row || typeof row !== 'object') return row ?? null;
  return {
    currentLevel: toFiniteNumber(row.level),
    targetLevel: toFiniteNumber(row.target),
    nextCost: toFiniteNumber(row.next_cost),
    nextGain: toFiniteNumber(row.next_gain),
    maxTarget: toFiniteNumber(row.max_target),
    maxGain: toFiniteNumber(row.max_gain),
    cost: toFiniteNumber(row.cost),
    gain: toFiniteNumber(row.gain),
    missing: Array.isArray(row.next_missing) ? row.next_missing : [],
    raw: row,
  };
}

function normalizeAttributeSection(section) {
  if (!section || typeof section !== 'object') return section ?? null;
  return {
    points: toFiniteNumber(section.points),
    spent: toFiniteNumber(section.spent),
    left: toFiniteNumber(section.left),
    gain: toFiniteNumber(section.gain),
    attributes: Array.isArray(section.attributes)
      ? section.attributes.map(row => ({
          attribute: row.attribute,
          ...normalizeNextStep(row),
          raw: row,
        }))
      : [],
    bestPath: section.best_path ?? null,
    raw: section,
  };
}

function normalizeWardenLevels(section) {
  if (!section || typeof section !== 'object') return section ?? null;
  return {
    blood: toFiniteNumber(section.blood),
    spent: toFiniteNumber(section.spent),
    left: toFiniteNumber(section.left),
    gain: toFiniteNumber(section.gain),
    wardens: Array.isArray(section.wardens)
      ? section.wardens.map(row => ({
          id: row.warden_id,
          ...normalizeNextStep(row),
          promote: toFiniteNumber(row.promote),
          promoteAfter: toFiniteNumber(row.promote_after),
          summoned: row.summoned ?? null,
          offer: row.offer ?? null,
          raw: row,
        }))
      : [],
    items: Array.isArray(section.items) ? section.items : [],
    bestPath: section.best_path ?? null,
    raw: section,
  };
}

function normalizeCollectionSection(section, childKey, idKey) {
  if (!section || typeof section !== 'object') return section ?? null;
  const groups = Array.isArray(section.items) ? section.items : [];
  return {
    gain: toFiniteNumber(section.gain),
    summonsGain: toFiniteNumber(section.summons_gain),
    items: groups.map(group => ({
      itemId: group.item_id,
      count: toFiniteNumber(group.count),
      spent: toFiniteNumber(group.spent),
      left: toFiniteNumber(group.left),
      gain: toFiniteNumber(group.gain),
      entities: Array.isArray(group[childKey])
        ? group[childKey].map(entity => ({
            id: entity[idKey],
            owned: entity.owned ?? null,
            summoned: entity.summon ?? entity.summoned ?? null,
            summonCost: toFiniteNumber(entity.summon_cost),
            summonGain: toFiniteNumber(entity.summon_gain),
            gain: toFiniteNumber(entity.gain),
            levels: Array.isArray(entity.levels)
              ? entity.levels.map(level => ({
                  id: level.aura_id ?? level.presence_id ?? level.skin_id ?? null,
                  ...normalizeNextStep(level),
                  percent: toFiniteNumber(level.percent),
                  targetPercent: toFiniteNumber(level.target_percent),
                  raw: level,
                }))
              : [],
            raw: entity,
          }))
        : [],
      bestPath: group.best_path ?? null,
      raw: group,
    })),
    free: Array.isArray(section.free) ? section.free : [],
    raw: section,
  };
}

function normalizeSimpleResourceSection(section) {
  if (!section || typeof section !== 'object') return section ?? null;
  return {
    spent: toFiniteNumber(section.spent),
    left: toFiniteNumber(section.left),
    points: toFiniteNumber(section.points),
    gain: toFiniteNumber(section.gain),
    level: toFiniteNumber(section.level),
    levelAfter: toFiniteNumber(section.level_after),
    nextExp: toFiniteNumber(section.next_exp),
    exp: toFiniteNumber(section.exp),
    expAfter: toFiniteNumber(section.exp_after),
    items: Array.isArray(section.items) ? section.items : [],
    fabrics: Array.isArray(section.fabrics) ? section.fabrics : [],
    store: section.store ?? null,
    raw: section,
  };
}

function normalizeTalentSection(section) {
  if (!section || typeof section !== 'object') return section ?? null;
  return {
    gain: toFiniteNumber(section.gain),
    scrolls: Array.isArray(section.scrolls) ? section.scrolls : [],
    scripts: Array.isArray(section.scripts) ? section.scripts : [],
    expItems: Array.isArray(section.exp_items) ? section.exp_items : [],
    ownExp: Array.isArray(section.own_exp) ? section.own_exp : [],
    raw: section,
  };
}

export function normalizeCalculationSnapshot(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Calculation snapshot must be a JSON object.');
  }

  const total = toFiniteNumber(input.total);
  const attributes = normalizeAttributeRows(input.attributes);
  const gainAttributes = normalizeAttributeRows(input.gain?.attributes);

  return {
    schemaVersion: 1,
    source: 'vampire-dominion-calculation',
    total,
    attributes,
    gain: {
      total: toFiniteNumber(input.gain?.total),
      attributes: gainAttributes,
    },
    sections: {
      conclave: normalizeAttributeSection(input.conclave),
      levels: normalizeWardenLevels(input.levels),
      bonds: normalizeSimpleResourceSection(input.bonds),
      auras: normalizeCollectionSection(input.auras, 'wardens', 'warden_id'),
      presences: normalizeCollectionSection(input.presences, 'lovers', 'lover_id'),
      skins: normalizeSimpleResourceSection(input.skins),
      talents: normalizeTalentSection(input.talents),
      courtyard: normalizeSimpleResourceSection(input.courtyard),
      books: normalizeSimpleResourceSection(input.books),
    },
    // Keep the complete original response for parity diagnostics and future fields.
    raw: input,
  };
}

/**
 * Compare two fully calculated snapshots without filling missing data.
 * `local` must expose total, attributes, and gain like a server snapshot.
 */
export function compareCalculationSnapshots(local, server, tolerance = 1e-7) {
  if (!local || !server) throw new TypeError('Both local and server snapshots are required.');
  const localAttributes = local.attributes ?? {};
  const serverAttributes = server.attributes ?? {};
  const localGainAttributes = local.gain?.attributes ?? {};
  const serverGainAttributes = server.gain?.attributes ?? {};

  const compareValue = (left, right) => {
    const a = toFiniteNumber(left);
    const b = toFiniteNumber(right);
    if (a === null || b === null) return { local: a, server: b, delta: null, matches: a === b };
    const delta = a - b;
    return { local: a, server: b, delta, matches: Math.abs(delta) <= tolerance };
  };

  const attributes = {};
  const gainAttributes = {};
  for (const key of SNAPSHOT_ATTRIBUTES) {
    attributes[key] = compareValue(localAttributes[key], serverAttributes[key]);
    gainAttributes[key] = compareValue(localGainAttributes[key], serverGainAttributes[key]);
  }

  const checks = [
    compareValue(local.total, server.total),
    compareValue(local.gain?.total, server.gain?.total),
    ...Object.values(attributes),
    ...Object.values(gainAttributes),
  ];

  return {
    matches: checks.every(check => check.matches),
    total: compareValue(local.total, server.total),
    gainTotal: compareValue(local.gain?.total, server.gain?.total),
    attributes,
    gainAttributes,
    tolerance,
  };
}
