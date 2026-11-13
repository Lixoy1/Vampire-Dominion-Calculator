/**
 * HAR-grounded settings and result adapter for the original Quick Calculation.
 * The original optimizer itself ran server-side; this module reproduces the
 * observed settings contract and maps its response into our local plan schema.
 */
export const QUICK_GOALS = Object.freeze(['all', 'strength', 'allure', 'intellect', 'spirit']);
export const QUICK_ATTRIBUTES = Object.freeze(['strength', 'allure', 'intellect', 'spirit']);
export const QUICK_SPEND_KEYS = Object.freeze([
  'blood', 'promote_items', 'conclave', 'trust', 'group_items',
  'presence_items', 'talent_items', 'talent_exp', 'skin_cards', 'fabric',
]);
export const QUICK_DEFAULT_SPEND = Object.freeze(Object.fromEntries(QUICK_SPEND_KEYS.map(key => [key, true])));

const WARDEN_ARRAY_RULES = ['promotes_off', 'talents_off', 'auras_off', 'skins_off'];
const LOVER_ARRAY_RULES = ['presences_off', 'skins_off'];
const asRecord = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const uniqueSortedIds = value => [...new Set((Array.isArray(value) ? value : [])
  .map(Number).filter(Number.isSafeInteger))].sort((a, b) => a - b);

export function createDefaultQuickSettings() {
  return { goal: 'all', spend: { ...QUICK_DEFAULT_SPEND }, wardens: {}, lovers: {}, conclave_off: [] };
}

export function normalizeQuickSettings(input = {}) {
  const source = asRecord(input);
  const goal = QUICK_GOALS.includes(source.goal) ? source.goal : 'all';
  const rawSpend = asRecord(source.spend);
  const spend = Object.fromEntries(QUICK_SPEND_KEYS.map(key => [key, rawSpend[key] !== false]));
  const wardens = {};
  for (const [id, rawValue] of Object.entries(asRecord(source.wardens))) {
    if (!/^\d+$/.test(id)) continue;
    const raw = asRecord(rawValue);
    const rule = {};
    if (raw.off === true) rule.off = true;
    if (raw.summon === false) rule.summon = false;
    if (raw.levels === false) rule.levels = false;
    if (raw.max_level != null && Number.isFinite(Number(raw.max_level))) {
      rule.max_level = Math.max(1, Math.min(450, Math.round(Number(raw.max_level))));
    }
    for (const key of WARDEN_ARRAY_RULES) {
      const ids = uniqueSortedIds(raw[key]);
      if (ids.length) rule[key] = ids;
    }
    if (Object.keys(rule).length) wardens[id] = rule;
  }

  const lovers = {};
  for (const [id, rawValue] of Object.entries(asRecord(source.lovers))) {
    if (!/^\d+$/.test(id)) continue;
    const raw = asRecord(rawValue);
    const rule = {};
    if (raw.off === true) rule.off = true;
    if (raw.summon === false) rule.summon = false;
    const bonds = [];
    const seen = new Set();
    for (const bond of Array.isArray(raw.bonds_off) ? raw.bonds_off : []) {
      const attribute = QUICK_ATTRIBUTES.includes(bond?.attribute) ? bond.attribute : null;
      const kind = ['level', 'percent'].includes(bond?.kind) ? bond.kind : null;
      if (!attribute || !kind || seen.has(attribute + ':' + kind)) continue;
      seen.add(attribute + ':' + kind);
      bonds.push({ attribute, kind });
    }
    if (bonds.length) rule.bonds_off = bonds;
    for (const key of LOVER_ARRAY_RULES) {
      const ids = uniqueSortedIds(raw[key]);
      if (ids.length) rule[key] = ids;
    }
    if (Object.keys(rule).length) lovers[id] = rule;
  }

  const conclaveOff = QUICK_ATTRIBUTES.filter(attribute =>
    Array.isArray(source.conclave_off) && source.conclave_off.includes(attribute));
  if (conclaveOff.length === QUICK_ATTRIBUTES.length) spend.conclave = false;
  return { goal, spend, wardens, lovers, conclave_off: spend.conclave ? conclaveOff : [] };
}

/** Serialize exactly the compact settings shape used by the captured UI. */
export function serializeQuickSettings(input = {}) {
  const normalized = normalizeQuickSettings(input);
  return {
    goal: normalized.goal,
    spend: { ...normalized.spend },
    wardens: structuredClone(normalized.wardens),
    lovers: structuredClone(normalized.lovers),
    ...(normalized.conclave_off.length ? { conclave_off: [...normalized.conclave_off] } : {}),
  };
}

const positiveEntries = value => Object.fromEntries(Object.entries(asRecord(value))
  .filter(([, amount]) => amount != null && Number.isFinite(Number(amount)) && Number(amount) > 0)
  .map(([key, amount]) => [key, Math.round(Number(amount))]));

export function mapQuickResultToPlan(quickResult, currentPlan = {}) {
  const result = asRecord(quickResult);
  const plan = structuredClone(asRecord(currentPlan));
  plan.conclave = { ...asRecord(plan.conclave) };
  plan.levels = { ...asRecord(plan.levels) };
  plan.promotes = { ...asRecord(plan.promotes) };
  plan.talents = { ...asRecord(plan.talents) };
  plan.bonds = { ...asRecord(plan.bonds) };
  plan.auras = { ...asRecord(plan.auras) };
  plan.presences = { ...asRecord(plan.presences) };
  plan.skins = { ...asRecord(plan.skins) };
  plan.summons = {
    wardens: [...(asRecord(plan.summons).wardens || [])],
    lovers: [...(asRecord(plan.summons).lovers || [])],
  };

  for (const [attribute, target] of Object.entries(asRecord(result.conclave))) {
    if (QUICK_ATTRIBUTES.includes(attribute) && target != null && Number.isFinite(Number(target))) {
      plan.conclave[attribute] = Math.max(0, Math.min(180, Math.round(Number(target))));
    }
  }
  for (const [wardenId, target] of Object.entries(asRecord(result.levels))) {
    if (/^\d+$/.test(wardenId) && target != null && Number.isFinite(Number(target))) {
      plan.levels[wardenId] = Math.max(1, Math.min(450, Math.round(Number(target))));
    }
  }
  for (const [loverId, byAttribute] of Object.entries(asRecord(result.bonds))) {
    if (!/^\d+$/.test(loverId)) continue;
    const next = { ...asRecord(plan.bonds[loverId]) };
    for (const [attribute, target] of Object.entries(asRecord(byAttribute))) {
      if (!QUICK_ATTRIBUTES.includes(attribute)) continue;
      const source = asRecord(target);
      const prior = asRecord(next[attribute]);
      next[attribute] = {
        ...prior,
        ...(source.level != null ? { targetLevel: Math.max(0, Math.min(600, Math.round(Number(source.level)))) } : {}),
        ...(source.percent_level != null ? { targetPercentLevel: Math.max(0, Math.min(600, Math.round(Number(source.percent_level)))) } : {}),
      };
    }
    plan.bonds[loverId] = next;
  }

  const mapOwners = (source, target, ownerType) => {
    for (const [ownerId, rawValue] of Object.entries(asRecord(source))) {
      if (!/^\d+$/.test(ownerId)) continue;
      const raw = asRecord(rawValue);
      if (raw.summon === true) {
        const list = ownerType === 'warden' ? plan.summons.wardens : plan.summons.lovers;
        const id = Number(ownerId);
        if (!list.includes(id)) list.push(id);
      }
      const levels = positiveEntries(raw.levels);
      if (Object.keys(levels).length) {
        target[ownerId] = { ...asRecord(target[ownerId]), ...levels };
      }
    }
  };
  mapOwners(result.auras, plan.auras, 'warden');
  mapOwners(result.presences, plan.presences, 'lover');

  for (const [wardenId, rawValue] of Object.entries(asRecord(result.talents))) {
    if (!/^\d+$/.test(wardenId)) continue;
    const raw = asRecord(rawValue);
    const prior = asRecord(plan.talents[wardenId]);
    const next = { ...prior };
    for (const key of ['scrolls', 'scripts', 'exp_items', 'exp_levels']) {
      const values = positiveEntries(raw[key]);
      if (Object.keys(values).length) next[key] = { ...asRecord(next[key]), ...values };
    }
    plan.talents[wardenId] = next;
  }
  for (const [skinId, target] of Object.entries(asRecord(result.skins))) {
    if (/^\d+$/.test(skinId) && Number.isFinite(Number(target))) {
      plan.skins[skinId] = Math.max(0, Math.min(10, Math.round(Number(target))));
    }
  }

  plan.summons.wardens = [...new Set(plan.summons.wardens.map(Number))];
  plan.summons.lovers = [...new Set(plan.summons.lovers.map(Number))];
  return plan;
}

export function summarizeQuickSettings(input = {}) {
  const settings = normalizeQuickSettings(input);
  return {
    goal: settings.goal,
    disabledResources: QUICK_SPEND_KEYS.filter(key => !settings.spend[key]),
    excludedWardens: Object.values(settings.wardens).filter(rule => rule.off).length,
    excludedLovers: Object.values(settings.lovers).filter(rule => rule.off).length,
    excludedConclaveAttributes: [...settings.conclave_off],
  };
}
