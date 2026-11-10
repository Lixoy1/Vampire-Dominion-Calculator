/**
 * Normalize captured Vampire Dominion calculation responses.
 *
 * The adapter does not calculate game values. It only maps known server fields
 * and numeric strings into a stable read model. Unknown fields and the complete
 * source object stay available under `raw`; null is never coerced to zero.
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

/**
 * Strictly recognize a raw calculator response, not an exported profile or
 * arbitrary JSON object. This is used before routing imports into the snapshot slot.
 */
export function isCalculationSnapshotPayload(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  if (toFiniteNumber(input.total) === null) return false;
  if (!Array.isArray(input.attributes) || !input.gain || typeof input.gain !== 'object') return false;
  if (!Array.isArray(input.gain.attributes) || toFiniteNumber(input.gain.total) === null) return false;
  const current = new Set(input.attributes.map(row => row?.attribute));
  const gain = new Set(input.gain.attributes.map(row => row?.attribute));
  return SNAPSHOT_ATTRIBUTES.every(attribute => current.has(attribute) && gain.has(attribute));
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

function normalizeBondSection(section) {
  if (!section || typeof section !== 'object') return section ?? null;
  return {
    trust: toFiniteNumber(section.trust),
    spent: toFiniteNumber(section.spent),
    left: toFiniteNumber(section.left),
    gain: toFiniteNumber(section.gain),
    lovers: Array.isArray(section.lovers)
      ? section.lovers.map(lover => ({
          loverId: lover.lover_id,
          wardenId: lover.warden_id,
          summoned: lover.summoned ?? null,
          trust: toFiniteNumber(lover.trust),
          spent: toFiniteNumber(lover.spent),
          left: toFiniteNumber(lover.left),
          gain: toFiniteNumber(lover.gain),
          bonds: Array.isArray(lover.bonds)
            ? lover.bonds.map(bond => ({
                attribute: bond.attribute,
                gain: toFiniteNumber(bond.gain),
                level: normalizeNextStep(bond.level),
                percent: normalizeNextStep(bond.percent),
                raw: bond,
              }))
            : [],
          bestPath: lover.best_path ?? null,
          raw: lover,
        }))
      : [],
    idle: Array.isArray(section.idle) ? section.idle : [],
    raw: section,
  };
}

function normalizeSkinSection(section) {
  if (!section || typeof section !== 'object') return section ?? null;
  return {
    gain: toFiniteNumber(section.gain),
    fabrics: Array.isArray(section.fabrics)
      ? section.fabrics.map(group => ({
          quality: group.quality,
          itemId: group.item_id,
          count: toFiniteNumber(group.count),
          spent: toFiniteNumber(group.spent),
          left: toFiniteNumber(group.left),
          gain: toFiniteNumber(group.gain),
          skins: Array.isArray(group.skins)
            ? group.skins.map(skin => ({
                id: skin.skin_id,
                owner: skin.owner ?? null,
                ownerId: skin.owner_id ?? null,
                owned: skin.owned ?? null,
                summoned: skin.summoned ?? null,
                summonPossible: skin.summon_possible ?? null,
                level: toFiniteNumber(skin.level),
                target: toFiniteNumber(skin.target),
                maxLevel: toFiniteNumber(skin.max_level),
                cards: toFiniteNumber(skin.cards),
                cardsUsed: toFiniteNumber(skin.cards_used),
                fabricUsed: toFiniteNumber(skin.fabric_used),
                gain: toFiniteNumber(skin.gain),
                nextKind: skin.next_kind ?? null,
                nextCost: toFiniteNumber(skin.next_cost),
                nextGain: toFiniteNumber(skin.next_gain),
                maxTarget: toFiniteNumber(skin.max_target),
                raw: skin,
              }))
            : [],
          raw: group,
        }))
      : [],
    store: section.store ?? null,
    raw: section,
  };
}

function normalizeTalentLines(lines) {
  if (!Array.isArray(lines)) return [];
  return lines.map(line => ({
    position: toFiniteNumber(line.position),
    attribute: line.attribute ?? null,
    stars: toFiniteNumber(line.stars),
    level: toFiniteNumber(line.level),
    cap: toFiniteNumber(line.cap),
    chosen: toFiniteNumber(line.chosen),
    cost: toFiniteNumber(line.cost),
    maxChosen: toFiniteNumber(line.max_chosen),
    nextCost: toFiniteNumber(line.next_cost),
    nextGain: toFiniteNumber(line.next_gain),
    final: toFiniteNumber(line.final),
    chance: toFiniteNumber(line.chance),
    tries: toFiniteNumber(line.tries),
    best: line.best ?? null,
    raw: line,
  }));
}

function normalizeTalentGroups(groups) {
  if (!Array.isArray(groups)) return [];
  return groups.map(group => ({
    itemId: group.item_id ?? null,
    stars: toFiniteNumber(group.stars),
    attribute: group.attribute ?? null,
    count: toFiniteNumber(group.count),
    spent: toFiniteNumber(group.spent),
    left: toFiniteNumber(group.left),
    gain: toFiniteNumber(group.gain),
    wardens: Array.isArray(group.wardens)
      ? group.wardens.map(warden => ({
          wardenId: warden.warden_id,
          owned: warden.owned ?? null,
          gain: toFiniteNumber(warden.gain),
          talents: normalizeTalentLines(warden.talents),
          raw: warden,
        }))
      : [],
    raw: group,
  }));
}

function normalizeTalentExperience(wardens) {
  if (!Array.isArray(wardens)) return [];
  return wardens.map(warden => ({
    wardenId: warden.warden_id,
    owned: warden.owned ?? null,
    exp: toFiniteNumber(warden.exp),
    promoteExp: toFiniteNumber(warden.promote_exp),
    level: toFiniteNumber(warden.level),
    added: toFiniteNumber(warden.added),
    points: toFiniteNumber(warden.points),
    left: toFiniteNumber(warden.left),
    gain: toFiniteNumber(warden.gain),
    talents: normalizeTalentLines(warden.talents),
    raw: warden,
  }));
}

function normalizeTalentSection(section) {
  if (!section || typeof section !== 'object') return section ?? null;
  return {
    gain: toFiniteNumber(section.gain),
    scrolls: normalizeTalentGroups(section.scrolls),
    scripts: normalizeTalentGroups(section.scripts),
    expItems: Array.isArray(section.exp_items) ? section.exp_items : [],
    ownExp: normalizeTalentExperience(section.own_exp),
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
    minimum: toFiniteNumber(section.minimum),
    expected: toFiniteNumber(section.expected),
    maximum: toFiniteNumber(section.maximum),
    items: Array.isArray(section.items)
      ? section.items.map(item => ({
          itemId: item.item_id ?? null,
          count: toFiniteNumber(item.count),
          counted: toFiniteNumber(item.counted),
          minimum: toFiniteNumber(item.minimum),
          expected: toFiniteNumber(item.expected),
          maximum: toFiniteNumber(item.maximum),
          raw: item,
        }))
      : [],
    raw: section,
  };
}

export function normalizeCalculationSnapshot(input) {
  if (!isCalculationSnapshotPayload(input)) {
    throw new TypeError('Calculation snapshot must contain total, all four attributes, and gain totals.');
  }

  return {
    schemaVersion: 1,
    source: 'vampire-dominion-calculation',
    total: toFiniteNumber(input.total),
    attributes: normalizeAttributeRows(input.attributes),
    gain: {
      total: toFiniteNumber(input.gain?.total),
      attributes: normalizeAttributeRows(input.gain?.attributes),
    },
    sections: {
      conclave: normalizeAttributeSection(input.conclave),
      levels: normalizeWardenLevels(input.levels),
      bonds: normalizeBondSection(input.bonds),
      auras: normalizeCollectionSection(input.auras, 'wardens', 'warden_id'),
      presences: normalizeCollectionSection(input.presences, 'lovers', 'lover_id'),
      skins: normalizeSkinSection(input.skins),
      talents: normalizeTalentSection(input.talents),
      courtyard: normalizeSimpleResourceSection(input.courtyard),
      books: normalizeSimpleResourceSection(input.books),
    },
    raw: input,
  };
}

/**
 * Compare two fully calculated snapshots without filling missing data.
 * `local` must expose total, attributes, and gain like a server snapshot.
 */
function getComparableIdentity(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const values = [];
  for (const key of ['id', 'itemId', 'wardenId', 'loverId', 'attribute', 'position', 'skin_id', 'warden_id', 'lover_id', 'item_id']) {
    if (row[key] !== undefined && row[key] !== null) values.push(key + ':' + String(row[key]));
  }
  if (row.raw && typeof row.raw === 'object') {
    for (const key of ['item_id', 'warden_id', 'lover_id', 'skin_id', 'aura_id', 'presence_id']) {
      if (row.raw[key] !== undefined && row.raw[key] !== null) values.push('raw.' + key + ':' + String(row.raw[key]));
    }
  }
  return values.length ? values.join('|') : null;
}

function compareTree(local, server, path, tolerance, mismatches) {
  if (local === undefined && server === undefined) return;
  if (local === null && server === null) return;

  if (local === undefined || server === undefined || local === null || server === null) {
    mismatches.push({
      path: path,
      issue: local == null ? 'missing_local' : 'missing_server',
      local: local === undefined ? undefined : local,
      server: server === undefined ? undefined : server
    });
    return;
  }

  if (Array.isArray(local) || Array.isArray(server)) {
    if (!Array.isArray(local) || !Array.isArray(server)) {
      mismatches.push({ path: path, issue: 'type_mismatch' });
      return;
    }

    const localIds = local.map(getComparableIdentity);
    const serverIds = server.map(getComparableIdentity);
    const canMatchByIdentity =
      local.length > 0 &&
      server.length > 0 &&
      localIds.every(Boolean) &&
      serverIds.every(Boolean) &&
      new Set(localIds).size === localIds.length &&
      new Set(serverIds).size === serverIds.length;

    if (canMatchByIdentity) {
      const localMap = new Map(local.map((row, index) => [localIds[index], row]));
      const serverMap = new Map(server.map((row, index) => [serverIds[index], row]));
      const allIds = new Set([...localMap.keys(), ...serverMap.keys()]);
      for (const id of allIds) {
        compareTree(localMap.get(id), serverMap.get(id), path + '[' + id + ']', tolerance, mismatches);
      }
      return;
    }

    if (local.length !== server.length) {
      mismatches.push({ path: path, issue: 'array_length', local: local.length, server: server.length });
    }
    const count = Math.min(local.length, server.length);
    for (let index = 0; index < count; index++) {
      compareTree(local[index], server[index], path + '[' + index + ']', tolerance, mismatches);
    }
    return;
  }

  if (typeof local === 'object' || typeof server === 'object') {
    if (typeof local !== 'object' || typeof server !== 'object') {
      mismatches.push({ path: path, issue: 'type_mismatch' });
      return;
    }
    const keys = new Set([...Object.keys(local), ...Object.keys(server)]);
    for (const key of keys) {
      if (key === 'raw' || key === 'bestPath') continue;
      compareTree(local[key], server[key], path + '.' + key, tolerance, mismatches);
    }
    return;
  }

  const localNumber = toFiniteNumber(local);
  const serverNumber = toFiniteNumber(server);
  if (localNumber !== null && serverNumber !== null) {
    const delta = localNumber - serverNumber;
    if (Math.abs(delta) > tolerance) {
      mismatches.push({ path: path, local: local, server: server, delta: delta });
    }
    return;
  }
  if (local !== server) {
    mismatches.push({ path: path, local: local, server: server });
  }
}

/**
 * Compare two calculation snapshots. If both sides include normalized sections,
 * compare nested costs and gains in addition to the headline totals/attributes.
 * Missing fields are reported, never silently treated as zero.
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

  const total = compareValue(local.total, server.total);
  const gainTotal = compareValue(local.gain?.total, server.gain?.total);
  const headlineChecks = [
    total,
    gainTotal,
    ...Object.values(attributes),
    ...Object.values(gainAttributes),
  ];

  const detailMismatches = [];
  const detailAvailable = Boolean(local.sections && server.sections);
  if (detailAvailable) {
    compareTree(local.sections, server.sections, 'sections', tolerance, detailMismatches);
  }

  const sectionComparison = {
    available: detailAvailable,
    matches: !detailAvailable || detailMismatches.length === 0,
    mismatches: detailMismatches,
  };

  return {
    matches: headlineChecks.every(check => check.matches) && sectionComparison.matches,
    total,
    gainTotal,
    attributes,
    gainAttributes,
    sections: sectionComparison,
    tolerance,
  };
}
