/**
 * Quick Calculation request/response compatibility layer.
 *
 * Reconstructed from the official QuickSettings / quick client modules captured
 * in the supplied HAR files. This implements the wire schema and response
 * mapping only; the server-side optimization algorithm is not reproduced here.
 */

export const QUICK_GOALS = Object.freeze([
  'all', 'strength', 'allure', 'intellect', 'spirit',
]);

export const QUICK_ATTRIBUTES = Object.freeze([
  'strength', 'allure', 'intellect', 'spirit',
]);

export const QUICK_SPEND_KEYS = Object.freeze([
  'blood',
  'promote_items',
  'conclave',
  'trust',
  'group_items',
  'presence_items',
  'talent_items',
  'talent_exp',
  'skin_cards',
  'fabric',
]);

export const QUICK_DEFAULT_SPEND = Object.freeze(
  Object.fromEntries(QUICK_SPEND_KEYS.map(key => [key, true]))
);

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function numericId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function numericIndex(value) {
  const index = Number(value);
  return Number.isSafeInteger(index) && index >= 0 ? index : null;
}

function sortedUniqueIds(values) {
  if (!Array.isArray(values)) return undefined;
  const ids = [...new Set(values.map(numericId).filter(id => id !== null))].sort((a, b) => a - b);
  return ids.length ? ids : undefined;
}

function sortedUniqueIndices(values) {
  if (!Array.isArray(values)) return undefined;
  const indices = [...new Set(values.map(numericIndex).filter(index => index !== null))].sort((a, b) => a - b);
  return indices.length ? indices : undefined;
}

function normalizeWardenSettings(value) {
  const source = asRecord(value);
  const result = {};
  if (source.off) result.off = true;
  if (source.summon === false) result.summon = false;
  if (source.levels === false) result.levels = false;
  if (source.max_level) {
    const max = Number(source.max_level);
    if (Number.isFinite(max) && max > 0) result.max_level = Math.floor(max);
  }
  for (const key of ['promotes_off', 'talents_off', 'auras_off', 'skins_off']) {
    const values = key === 'talents_off' ? sortedUniqueIndices(source[key]) : sortedUniqueIds(source[key]);
    if (values) result[key] = values;
  }
  return Object.keys(result).length ? result : undefined;
}

function normalizeLoverSettings(value) {
  const source = asRecord(value);
  const result = {};
  if (source.off) result.off = true;
  if (source.summon === false) result.summon = false;

  if (Array.isArray(source.bonds_off)) {
    const seen = new Set();
    const bonds = [];
    for (const row of source.bonds_off) {
      const item = asRecord(row);
      if (!QUICK_ATTRIBUTES.includes(item.attribute)) continue;
      if (item.kind !== 'level' && item.kind !== 'percent') continue;
      const key = item.attribute + ':' + item.kind;
      if (seen.has(key)) continue;
      seen.add(key);
      bonds.push({ attribute: item.attribute, kind: item.kind });
    }
    if (bonds.length) result.bonds_off = bonds;
  }

  for (const key of ['presences_off', 'skins_off']) {
    const values = sortedUniqueIds(source[key]);
    if (values) result[key] = values;
  }
  return Object.keys(result).length ? result : undefined;
}

/**
 * Normalize the exact Quick Calculation request settings.
 * Unknown goal values fall back to all; omitted spend keys default to true.
 */
export function normalizeQuickSettings(input = {}) {
  const source = asRecord(input);
  const goal = QUICK_GOALS.includes(source.goal) ? source.goal : 'all';
  const spend = { ...QUICK_DEFAULT_SPEND, ...asRecord(source.spend) };
  for (const key of QUICK_SPEND_KEYS) spend[key] = spend[key] !== false;

  const wardens = {};
  for (const [rawId, value] of Object.entries(asRecord(source.wardens))) {
    const id = numericId(rawId);
    if (id === null) continue;
    const normalized = normalizeWardenSettings(value);
    if (normalized) wardens[id] = normalized;
  }

  const lovers = {};
  for (const [rawId, value] of Object.entries(asRecord(source.lovers))) {
    const id = numericId(rawId);
    if (id === null) continue;
    const normalized = normalizeLoverSettings(value);
    if (normalized) lovers[id] = normalized;
  }

  const selectedConclave = QUICK_ATTRIBUTES.filter(attribute =>
    Array.isArray(source.conclave_off) && source.conclave_off.includes(attribute)
  );
  let conclaveOff = selectedConclave;
  if (selectedConclave.length === QUICK_ATTRIBUTES.length) {
    spend.conclave = false;
    conclaveOff = [];
  }
  if (spend.conclave === false) conclaveOff = [];

  const result = { goal, spend, wardens, lovers };
  if (conclaveOff.length) result.conclave_off = conclaveOff;
  return result;
}

function clonePlan(plan = {}) {
  return typeof structuredClone === 'function'
    ? structuredClone(plan)
    : JSON.parse(JSON.stringify(plan));
}

/**
 * Convert the official Quick endpoint response to the local plan schema.
 * The official response stores bond targets as {level, percent_level}, while
 * the local editor stores current values and targetLevel/targetPercentLevel.
 *
 * Warden aura level plans and talent exp_items are returned in ignored because
 * the current local planner has no equivalent plan fields for them.
 */
export function quickResponseToPlan(responseValue, accountValue = {}, basePlan = {}) {
  const response = asRecord(responseValue);
  const account = asRecord(accountValue);
  const plan = clonePlan(basePlan);
  plan.conclave = { ...asRecord(plan.conclave) };
  plan.levels = { ...asRecord(plan.levels) };
  plan.bonds = { ...asRecord(plan.bonds) };
  plan.talents = { ...asRecord(plan.talents) };
  plan.presences = { ...asRecord(plan.presences) };
  plan.skins = { ...asRecord(plan.skins) };
  plan.summons = {
    wardens: [...(asRecord(plan.summons).wardens || [])],
    lovers: [...(asRecord(plan.summons).lovers || [])],
  };

  const ignored = {
    wardenAuraLevels: {},
    talentExpItems: {},
    unknown: [],
  };

  // The API returns null for branches which were not selected.
  for (const [attribute, value] of Object.entries(asRecord(response.conclave))) {
    if (QUICK_ATTRIBUTES.includes(attribute) && value !== null && value !== undefined) {
      plan.conclave[attribute] = Math.max(
        Number(asRecord(account.conclave)[attribute]) || 0,
        Math.round(Number(value) || 0)
      );
    }
  }

  for (const [rawId, value] of Object.entries(asRecord(response.levels))) {
    const id = numericId(rawId);
    const level = Number(value);
    if (id === null || !Number.isFinite(level)) continue;
    plan.levels[id] = Math.max(
      Number(asRecord(account.ownedWardens)[id]?.level) || 1,
      Math.round(level)
    );
  }

  for (const [rawLoverId, attributesValue] of Object.entries(asRecord(response.bonds))) {
    const loverId = numericId(rawLoverId);
    if (loverId === null) continue;
    const owned = asRecord(asRecord(account.ownedLovers)[loverId]);
    const currentBonds = asRecord(owned.bonds);
    const loverPlan = { ...asRecord(plan.bonds[loverId]) };

    for (const [attribute, targetValue] of Object.entries(asRecord(attributesValue))) {
      if (!QUICK_ATTRIBUTES.includes(attribute)) continue;
      const target = asRecord(targetValue);
      const current = asRecord(currentBonds[attribute]);
      const currentFlat = Math.max(0, Number(current.level) || 0);
      const currentPercent = Math.max(0, Number(current.percentLevel ?? current.pctLevel) || 0);
      const selected = { ...current, ...asRecord(loverPlan[attribute]) };

      if (target.level !== null && target.level !== undefined && Number.isFinite(Number(target.level))) {
        selected.level = currentFlat;
        selected.targetLevel = Math.max(currentFlat, Math.round(Number(target.level)));
      }
      if (target.percent_level !== null && target.percent_level !== undefined &&
          Number.isFinite(Number(target.percent_level))) {
        selected.percentLevel = currentPercent;
        selected.targetPercentLevel = Math.max(currentPercent, Math.round(Number(target.percent_level)));
      }
      if (selected.targetLevel !== undefined || selected.targetPercentLevel !== undefined) {
        loverPlan[attribute] = selected;
      }
    }
    if (Object.keys(loverPlan).length) plan.bonds[loverId] = loverPlan;
  }

  const mapEntityLevels = (section, ownerKind) => {
    for (const [rawOwnerId, rawValue] of Object.entries(asRecord(response[section]))) {
      const ownerId = numericId(rawOwnerId);
      if (ownerId === null) continue;
      const value = asRecord(rawValue);
      if (value.summon === true) {
        const target = ownerKind === 'warden' ? plan.summons.wardens : plan.summons.lovers;
        if (!target.includes(ownerId)) target.push(ownerId);
      }
      const levels = asRecord(value.levels);
      if (!Object.keys(levels).length) continue;

      if (section === 'presences') {
        const lover = { ...asRecord(plan.presences[ownerId]) };
        for (const [rawPresenceId, levelValue] of Object.entries(levels)) {
          const presenceId = numericId(rawPresenceId);
          const level = Number(levelValue);
          if (presenceId !== null && Number.isFinite(level)) lover[presenceId] = Math.max(0, Math.round(level));
        }
        plan.presences[ownerId] = lover;
      } else {
        ignored.wardenAuraLevels[ownerId] = Object.fromEntries(
          Object.entries(levels).filter(([, level]) => Number.isFinite(Number(level)))
            .map(([id, level]) => [id, Math.max(0, Math.round(Number(level)))])
        );
      }
    }
  };

  mapEntityLevels('auras', 'warden');
  mapEntityLevels('presences', 'lover');

  for (const [rawWardenId, value] of Object.entries(asRecord(response.talents))) {
    const wardenId = numericId(rawWardenId);
    if (wardenId === null) continue;
    const source = asRecord(value);
    const selected = { ...asRecord(plan.talents[wardenId]) };
    for (const key of ['scrolls', 'scripts', 'exp_levels']) {
      const values = {};
      for (const [rawPosition, countValue] of Object.entries(asRecord(source[key]))) {
        const position = numericIndex(rawPosition);
        const count = Number(countValue);
        if (position !== null && Number.isFinite(count) && count > 0) values[position] = Math.floor(count);
      }
      if (Object.keys(values).length) selected[key] = { ...asRecord(selected[key]), ...values };
    }
    const expItems = asRecord(source.exp_items);
    if (Object.keys(expItems).length) ignored.talentExpItems[wardenId] = expItems;
    if (Object.keys(selected).length) plan.talents[wardenId] = selected;
  }

  for (const [rawSkinId, levelValue] of Object.entries(asRecord(response.skins))) {
    const skinId = numericId(rawSkinId);
    const level = Number(levelValue);
    if (skinId !== null && Number.isFinite(level)) plan.skins[skinId] = Math.max(0, Math.round(level));
  }

  const knownSections = new Set(['conclave', 'levels', 'bonds', 'auras', 'skins', 'talents', 'presences']);
  for (const key of Object.keys(response)) if (!knownSections.has(key)) ignored.unknown.push(key);

  return { plan, ignored };
}
