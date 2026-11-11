/**
 * UNIFIED SERVER ORACLE
 *
 * All gameplay calculations exposed to the browser are executed here on the
 * Render server. The calculator deliberately does not connect to Game of
 * Vampires: players enter their own observed in-game values.
 */
import { GAME_DB } from './js/data.js';
import * as Engine from './js/engine.js';

export const ORACLE_VERSION = '1.0.0';
export const ORACLE_SCHEMA_VERSION = 1;

const ATTRIBUTES = Engine.ATTRIBUTES;
const db = {
  wardens: GAME_DB.wardens,
  lovers: GAME_DB.lovers,
  items: GAME_DB.items,
  promotes: GAME_DB.warden_promotes,
  conclaveLevels: GAME_DB.conclave_levels,
  courtyardLevels: GAME_DB.courtyard_levels,
  presenceCurvesMap: Engine.buildPresenceCurvesMap(GAME_DB.lover_presence_levels),
};

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function numeric(value, fallback = 0) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function nonNegative(value) {
  return Math.min(1_000_000_000_000_000, Math.max(0, numeric(value)));
}

function clone(value) {
  return structuredClone(value);
}

function normalizeAccount(input = {}) {
  const account = record(input);
  const ownedWardens = {};
  for (const [id, raw] of Object.entries(record(account.ownedWardens))) {
    if (!/^\d+$/.test(id)) continue;
    const warden = record(raw);
    ownedWardens[id] = {
      ...warden,
      level: Math.max(1, Math.min(500, Math.round(numeric(warden.level, 1)))),
      promoteId: Math.max(1, Math.min(db.promotes.length, Math.round(numeric(warden.promoteId, 1))),
      exp: nonNegative(warden.exp),
      talents: record(warden.talents),
      auras: record(warden.auras),
    };
  }

  const ownedLovers = {};
  for (const [id, raw] of Object.entries(record(account.ownedLovers))) {
    if (!/^\d+$/.test(id)) continue;
    const lover = record(raw);
    ownedLovers[id] = {
      ...lover,
      affinity: nonNegative(lover.affinity),
      closeness: Math.min(1_000_000, nonNegative(lover.closeness)),
      presences: record(lover.presences),
      bonds: record(lover.bonds),
    };
  }

  const bag = {};
  for (const [id, count] of Object.entries(record(account.bag))) {
    if (!/^\d+$/.test(id)) continue;
    bag[id] = nonNegative(count);
  }

  const conclave = {};
  for (const attribute of ATTRIBUTES) {
    conclave[attribute] = Math.max(0, Math.min(180, Math.round(numeric(record(account.conclave)[attribute]))));
  }

  return {
    ...account,
    blood: nonNegative(account.blood),
    conclaveExp: nonNegative(account.conclaveExp),
    courtyardExp: nonNegative(account.courtyardExp),
    courtyardLvl: Math.max(0, Math.min(210, Math.round(numeric(account.courtyardLvl)))),
    conclave,
    ownedWardens,
    ownedLovers,
    bag,
    skins: record(account.skins),
  };
}

function normalizePlan(input = {}, account) {
  const source = record(input);
  const plan = {
    ...source,
    conclave: {},
    courtyardToLvl: Math.max(account.courtyardLvl, Math.min(210, Math.round(numeric(source.courtyardToLvl, account.courtyardLvl)))),
    levels: {},
    promotes: {},
    bonds: {},
    skins: record(source.skins),
    summons: {
      wardens: Array.isArray(record(source.summons).wardens) ? source.summons.wardens.map(Number).filter(Number.isSafeInteger).slice(0, db.wardens.length) : [],
      lovers: Array.isArray(record(source.summons).lovers) ? source.summons.lovers.map(Number).filter(Number.isSafeInteger).slice(0, db.lovers.length) : [],
    },
  };

  for (const attribute of ATTRIBUTES) {
    plan.conclave[attribute] = Math.max(
      account.conclave[attribute],
      Math.min(180, Math.round(numeric(record(source.conclave)[attribute], account.conclave[attribute])))
    );
  }

  for (const [id, target] of Object.entries(record(source.levels))) {
    if (!/^\d+$/.test(id)) continue;
    plan.levels[id] = Math.max(
      account.ownedWardens[id]?.level || 1,
      Math.min(450, Math.round(numeric(target, account.ownedWardens[id]?.level || 1)))
    );
  }

  for (const [id, promoteId] of Object.entries(record(source.promotes))) {
    if (/^\d+$/.test(id)) plan.promotes[id] = Math.max(1, Math.round(numeric(promoteId, 1)));
  }

  for (const [id, raw] of Object.entries(record(source.bonds))) {
    if (/^\d+$/.test(id)) plan.bonds[id] = clone(record(raw));
  }

  // Include current bond levels as the baseline even when a player has not
  // edited a branch yet. Warden attributes are always recomputed server-side.
  for (const [id, owned] of Object.entries(account.ownedLovers)) {
    const lover = db.lovers.find(item => item.id === Number(id));
    if (!lover) continue;
    const bondPlan = record(plan.bonds[id]);
    for (const bond of lover.scarlet_bonds || []) {
      const current = record(owned.bonds[bond.attribute]);
      const currentLevel = Math.max(0, Math.min(600, Math.round(numeric(current.level))));
      const currentPercentLevel = Math.max(0, Math.min(600, Math.round(numeric(current.percentLevel ?? current.pctLevel))));
      const selected = record(bondPlan[bond.attribute]);
      bondPlan[bond.attribute] = {
        level: Math.max(currentLevel, Math.min(600, Math.round(numeric(selected.level, currentLevel)))),
        targetLevel: Math.max(currentLevel, Math.min(600, Math.round(numeric(selected.targetLevel, currentLevel)))),
        percentLevel: Math.max(currentPercentLevel, Math.min(600, Math.round(numeric(selected.percentLevel, currentPercentLevel)))),
        targetPercentLevel: Math.max(currentPercentLevel, Math.min(600, Math.round(numeric(selected.targetPercentLevel, currentPercentLevel)))),
      };
    }
    bondPlan.wardenBaseAttrs = getWardenBaseAttributes(lover.warden_id, account);
    plan.bonds[id] = bondPlan;
  }

  return plan;
}

export function getWardenBaseAttributes(wardenId, accountInput) {
  const account = accountInput?.ownedWardens ? accountInput : normalizeAccount(accountInput);
  const warden = db.wardens.find(item => item.id === Number(wardenId));
  const owned = account.ownedWardens?.[wardenId];
  const result = { strength: 0, allure: 0, intellect: 0, spirit: 0 };
  if (!warden || !owned) return result;

  const multiplier = Engine.calcWardenLevelMultiplier(owned.level || 1);
  warden.talents.forEach((talent, index) => {
    const level = Math.max(1, numeric(owned.talents?.[index], 1));
    result[talent.attribute] += level * talent.stars * multiplier;
  });
  return result;
}

function makeWarnings(account, plan) {
  const warnings = [];
  const hasLevelPlan = Object.entries(plan.levels).some(([id, target]) => target > (account.ownedWardens[id]?.level || 1));
  const hasBondPlan = Object.entries(plan.bonds).some(([id, bonds]) => {
    const owned = account.ownedLovers[id];
    return (db.lovers.find(item => item.id === Number(id))?.scarlet_bonds || []).some(bond => {
      const current = record(owned?.bonds?.[bond.attribute]);
      const selected = record(bonds[bond.attribute]);
      return numeric(selected.targetLevel) > numeric(current.level)
        || numeric(selected.targetPercentLevel) > numeric(current.percentLevel ?? current.pctLevel);
    });
  });
  if (hasLevelPlan) warnings.push({
    code: 'APPROXIMATE_BLOOD_COST',
    message: 'Стоимость уровней в Крови использует аппроксимированную кривую из текущего движка. Проверь её по игровым значениям перед применением.',
  });
  if (hasBondPlan) warnings.push({
    code: 'APPROXIMATE_BOND_COST',
    message: 'Стоимость уровней Кровных уз использует расчётную формулу, а не подтверждённую выгрузку игрового сервера.',
  });
  if (plan.summons.wardens.length) warnings.push({
    code: 'ESTIMATED_SUMMON_GAIN',
    message: 'Прирост Господства от призыва показывается отдельно как оценка и не включается в точный итог.',
  });
  return warnings;
}

export function calculateOracle(input = {}) {
  const raw = record(input);
  const account = normalizeAccount(raw.account);
  const plan = normalizePlan(raw.plan, account);
  const report = Engine.calculateTotalDominanceReport({ db, account, plan });

  const conclaveBranches = {};
  for (const attribute of ATTRIBUTES) {
    const current = account.conclave[attribute] || 0;
    const target = plan.conclave[attribute] || current;
    const activeWardens = db.wardens.filter(warden =>
      account.ownedWardens[warden.id] && warden.attributes.includes(attribute)
    ).length || 1;
    conclaveBranches[attribute] = Engine.calcConclaveBranch(db.conclaveLevels, current, target, activeWardens);
  }

  const courtyardUpgrade = Engine.calcCourtyardUpgrade(
    db.courtyardLevels,
    account.courtyardLvl,
    plan.courtyardToLvl
  );

  const wardens = {};
  for (const warden of db.wardens) {
    const owned = account.ownedWardens[warden.id];
    const promoteId = plan.promotes[warden.id] || owned?.promoteId || 1;
    const promotion = db.promotes.find(item => item.id === promoteId) || db.promotes[0];
    const personalExp = owned?.exp || 0;
    const promotionExp = Engine.calcPromoteBonusExp(db.promotes, promoteId);
    const talentSum = Engine.calcWardenTalentSum(warden, owned?.talents || {});
    const baseTalentStars = Engine.calcWardenBaseTalentStars(warden);
    const talentPointsAvailable = Engine.calcAchievableExpTalentPoints(
      warden,
      promotion?.max_talent_lvl ?? 40,
      promotionExp + personalExp
    );
    const levelTarget = Math.max(owned?.level || 1, plan.levels[warden.id] || owned?.level || 1);
    const levelUpgrade = owned
      ? Engine.calcWardenLevelsUpgrade(
        warden,
        owned.level,
        levelTarget,
        owned.promoteId || 1,
        db.promotes,
        account.bag,
        owned.talents || {}
      )
      : null;
    const auras = {};
    for (const aura of warden.auras || []) {
      const level = owned?.auras?.[aura.id] ?? aura.min_lvl ?? 0;
      auras[aura.id] = {
        level,
        percent: Engine.calcAuraPercent(aura, level),
      };
    }
    wardens[warden.id] = {
      owned: Boolean(owned),
      baseTalentStars,
      talentSum,
      promotionExp,
      personalExp,
      totalTalentExp: promotionExp + personalExp,
      talentPointsAvailable,
      maxTalentLevel: promotion?.max_talent_lvl ?? 40,
      baseAttributes: getWardenBaseAttributes(warden.id, account),
      levelUpgrade,
      auras,
    };
  }

  const lovers = {};
  for (const lover of db.lovers) {
    const owned = account.ownedLovers[lover.id];
    const bondPlan = plan.bonds[lover.id] || {};
    const bondResult = owned
      ? Engine.calcLoverBonds(
        lover,
        owned.affinity || 0,
        bondPlan,
        bondPlan.wardenBaseAttrs,
        owned.closeness || 0
      )
      : null;
    const presences = {};
    for (const presence of lover.presences || []) {
      const level = owned?.presences?.[presence.id] ?? presence.min_lvl ?? 0;
      presences[presence.id] = {
        level,
        percents: Engine.calcPresencePercents(presence, level, db.presenceCurvesMap),
      };
    }
    lovers[lover.id] = {
      owned: Boolean(owned),
      bondPlan,
      bondResult,
      presences,
    };
  }

  const summonCandidates = Engine.getSummonCandidates(
    db.wardens,
    db.lovers,
    new Set(Object.keys(account.ownedWardens).map(Number)),
    new Set(Object.keys(account.ownedLovers).map(Number)),
    account.bag
  );

  // The engine's summon gain is explicitly an estimate. Keep it visible, but
  // do not roll it into the exact planned dominance total.
  report.precision = {
    totalExcludesSummonEstimate: true,
    bloodCost: 'approximate',
    bondCost: 'approximate',
    summonGain: 'estimate-only',
  };

  return {
    meta: {
      oracleVersion: ORACLE_VERSION,
      schemaVersion: ORACLE_SCHEMA_VERSION,
      engineVersion: '5.0.0',
      dataVersion: 'GAME_DB_v5.0.0',
      computedAt: new Date().toISOString(),
      inputSource: 'player-entered',
      gameConnected: false,
      stateless: true,
    },
    report,
    conclaveBranches,
    courtyardUpgrade,
    wardens,
    lovers,
    summonCandidates,
    warnings: makeWarnings(account, plan),
  };
}

export function autoDistributeConclave(input = {}) {
  const account = normalizeAccount(record(input).account);
  const wardensByAttribute = {};
  for (const attribute of ATTRIBUTES) {
    wardensByAttribute[attribute] = db.wardens.filter(warden =>
      account.ownedWardens[warden.id] && warden.attributes.includes(attribute)
    ).length || 1;
  }
  return Engine.autoDistributeConclave(
    db.conclaveLevels,
    account.conclave,
    account.conclaveExp,
    wardensByAttribute
  );
}

export function autoDistributeAll(input = {}) {
  const raw = record(input);
  const account = normalizeAccount(raw.account);
  const plan = normalizePlan(raw.plan, account);
  const wardensByAttribute = {};
  for (const attribute of ATTRIBUTES) {
    wardensByAttribute[attribute] = db.wardens.filter(warden =>
      account.ownedWardens[warden.id] && warden.attributes.includes(attribute)
    ).length || 1;
  }

  plan.conclave = Engine.autoDistributeConclave(
    db.conclaveLevels,
    account.conclave,
    account.conclaveExp,
    wardensByAttribute
  ).levels;
  plan.courtyardToLvl = Engine.calcMaxCourtyardLevel(
    db.courtyardLevels,
    account.courtyardLvl,
    account.courtyardExp
  ).toLvl;

  let bloodLeft = account.blood;
  const tempBag = { ...account.bag };
  const nextLevels = {};
  const nextPromotes = {};
  for (const [id, owned] of Object.entries(account.ownedWardens)) {
    nextLevels[id] = Math.max(1, Number(owned.level) || 1);
    nextPromotes[id] = Math.max(1, Number(owned.promoteId) || 1);
  }

  while (bloodLeft > 0) {
    let best = null;
    let bestEfficiency = 0;
    for (const [id, owned] of Object.entries(account.ownedWardens)) {
      const warden = db.wardens.find(item => item.id === Number(id));
      if (!warden) continue;
      const from = nextLevels[id];
      if (from >= 450) continue;
      const step = Engine.calcWardenLevelsUpgrade(
        warden,
        from,
        from + 1,
        nextPromotes[id],
        db.promotes,
        tempBag,
        owned.talents || {}
      );
      if (!step.canPromote || step.bloodSpent <= 0 || step.bloodSpent > bloodLeft) continue;
      const efficiency = step.baseGain / step.bloodSpent;
      if (efficiency > bestEfficiency) {
        bestEfficiency = efficiency;
        best = { id, step, promoteId: nextPromotes[id] };
      }
    }
    if (!best) break;

    nextLevels[best.id]++;
    let resultingPromoteId = best.promoteId;
    for (const promote of best.step.neededPromotes || []) {
      resultingPromoteId = Math.max(resultingPromoteId, promote.id);
      for (const itemId of promote.item_ids || []) {
        tempBag[itemId] = Math.max(0, (tempBag[itemId] || 0) - promote.price);
      }
    }
    nextPromotes[best.id] = resultingPromoteId;
    bloodLeft -= best.step.bloodSpent;
  }

  plan.levels = nextLevels;
  plan.promotes = nextPromotes;

  const candidates = Engine.getSummonCandidates(
    db.wardens,
    db.lovers,
    new Set(Object.keys(account.ownedWardens).map(Number)),
    new Set(Object.keys(account.ownedLovers).map(Number)),
    tempBag
  );
  const summonBag = { ...tempBag };
  plan.summons.wardens = [];
  for (const candidate of candidates.wardens) {
    if (!candidate.canSummon || candidate.cost <= 0) continue;
    if (candidate.itemId && (summonBag[candidate.itemId] || 0) < candidate.cost) continue;
    if (candidate.itemId) summonBag[candidate.itemId] -= candidate.cost;
    plan.summons.wardens.push(candidate.id);
  }

  return { plan, warnings: makeWarnings(account, plan) };
}

export function commitOraclePlan(input = {}) {
  const raw = record(input);
  const account = normalizeAccount(raw.account);
  const plan = normalizePlan(raw.plan, account);
  const draft = clone(account);
  const snapshot = calculateOracle({ account: draft, plan });
  const report = snapshot.report;

  if (report.spent.blood > draft.blood) {
    return { ok: false, error: { code: 'INSUFFICIENT_BLOOD', message: 'Недостаточно Крови для выбранного плана.' } };
  }
  if (report.spent.conclaveExp > draft.conclaveExp) {
    return { ok: false, error: { code: 'INSUFFICIENT_CONCLAVE', message: 'Недостаточно очков Конклава для выбранного плана.' } };
  }
  if (report.spent.courtyardExp > draft.courtyardExp) {
    return { ok: false, error: { code: 'INSUFFICIENT_COURTYARD', message: 'Недостаточно очков Сада для выбранного плана.' } };
  }

  const wardenPromotes = {};
  for (const [id, targetLevelRaw] of Object.entries(plan.levels)) {
    const owned = draft.ownedWardens[id];
    const warden = db.wardens.find(item => item.id === Number(id));
    const targetLevel = Math.max(Number(owned?.level) || 1, Number(targetLevelRaw) || 1);
    if (!owned || !warden || targetLevel <= (Number(owned.level) || 1)) continue;

    const currentPromoteId = Math.max(1, Number(owned.promoteId) || 1);
    const upgrade = Engine.calcWardenLevelsUpgrade(
      warden, owned.level, targetLevel, currentPromoteId, db.promotes, draft.bag, owned.talents || {}
    );
    if (!upgrade.canPromote) {
      return {
        ok: false,
        error: {
          code: 'MISSING_BREAKTHROUGH_ITEMS',
          wardenId: warden.id,
          missingItems: upgrade.missingItems,
          message: `Нельзя применить уровни ${warden.name}: не хватает предметов прорыва.`,
        },
      };
    }

    let nextPromoteId = currentPromoteId;
    for (const promote of upgrade.neededPromotes || []) {
      nextPromoteId = Math.max(nextPromoteId, promote.id);
      for (const itemId of promote.item_ids || []) {
        const cost = Number(promote.price) || 0;
        if ((draft.bag[itemId] || 0) < cost) {
          return {
            ok: false,
            error: {
              code: 'MISSING_BREAKTHROUGH_ITEMS',
              wardenId: warden.id,
              itemId,
              required: cost,
              available: draft.bag[itemId] || 0,
              message: `Недостаточно предметов для прорыва ${warden.name}.`,
            },
          };
        }
        draft.bag[itemId] = Math.max(0, (draft.bag[itemId] || 0) - cost);
      }
    }
    wardenPromotes[id] = nextPromoteId;
  }

  const summonCandidates = Engine.getSummonCandidates(
    db.wardens, db.lovers,
    new Set(Object.keys(draft.ownedWardens).map(Number)),
    new Set(Object.keys(draft.ownedLovers).map(Number)),
    draft.bag
  );
  const summonIds = [...new Set(plan.summons.wardens.map(Number))];
  for (const id of summonIds) {
    const candidate = summonCandidates.wardens.find(item => item.id === id);
    if (!candidate || !candidate.canSummon) {
      return {
        ok: false,
        error: { code: 'SUMMON_UNAVAILABLE', wardenId: id, message: `Призыв смотрителя ${candidate?.name || id} недоступен: проверь предметы в сумке.` },
      };
    }
    if (candidate.itemId && candidate.cost > 0) {
      draft.bag[candidate.itemId] = Math.max(0, (draft.bag[candidate.itemId] || 0) - candidate.cost);
    }
  }

  const bondUpdates = {};
  for (const [id, bondPlan] of Object.entries(plan.bonds)) {
    const owned = draft.ownedLovers[id];
    const lover = db.lovers.find(item => item.id === Number(id));
    if (!owned || !lover) continue;
    const result = Engine.calcLoverBonds(
      lover, owned.affinity || 0, bondPlan, bondPlan.wardenBaseAttrs, owned.closeness || 0
    );
    if (result.spentAffinity > (owned.affinity || 0)) {
      return {
        ok: false,
        error: {
          code: 'INSUFFICIENT_AFFINITY',
          loverId: lover.id,
          required: result.spentAffinity,
          available: owned.affinity || 0,
          message: `Недостаточно очков Доверия у ${lover.name}.`,
        },
      };
    }
    bondUpdates[id] = { spent: result.spentAffinity, states: bondPlan };
  }

  draft.conclave = { ...draft.conclave, ...plan.conclave };
  draft.conclaveExp = Math.max(0, draft.conclaveExp - report.spent.conclaveExp);
  draft.courtyardLvl = Math.max(draft.courtyardLvl, Number(plan.courtyardToLvl) || draft.courtyardLvl);
  draft.courtyardExp = Math.max(0, draft.courtyardExp - report.spent.courtyardExp);
  draft.blood = Math.max(0, draft.blood - report.spent.blood);

  for (const [id, targetLevel] of Object.entries(plan.levels)) {
    const owned = draft.ownedWardens[id];
    if (!owned) continue;
    owned.level = Math.max(owned.level || 1, Number(targetLevel) || 1);
    owned.promoteId = wardenPromotes[id] || plan.promotes[id] || owned.promoteId || 1;
  }

  for (const [id, update] of Object.entries(bondUpdates)) {
    const owned = draft.ownedLovers[id];
    const lover = db.lovers.find(item => item.id === Number(id));
    owned.affinity = Math.max(0, (owned.affinity || 0) - update.spent);
    owned.bonds ||= {};
    for (const bond of lover?.scarlet_bonds || []) {
      const target = update.states[bond.attribute];
      if (!target) continue;
      owned.bonds[bond.attribute] = {
        level: Number(target.targetLevel ?? target.level ?? 0),
        percentLevel: Number(target.targetPercentLevel ?? target.percentLevel ?? 0),
      };
    }
  }

  for (const id of summonIds) {
    draft.ownedWardens[id] = { level: 1, promoteId: 1, exp: 0, talents: {}, auras: {} };
  }

  return {
    ok: true,
    account: draft,
    report,
    warnings: snapshot.warnings,
  };
}


export function summonWarden(input = {}) {
  const raw = record(input);
  const account = normalizeAccount(raw.account);
  const wardenId = Math.round(numeric(raw.wardenId));
  const warden = db.wardens.find(item => item.id === wardenId);
  if (!warden) {
    return { ok: false, error: { code: 'WARDEN_NOT_FOUND', message: 'Смотритель не найден в каталоге.' } };
  }
  if (account.ownedWardens[wardenId]) {
    return { ok: false, error: { code: 'WARDEN_ALREADY_OWNED', message: 'Этот смотритель уже добавлен в профиль.' } };
  }
  const candidates = Engine.getSummonCandidates(
    db.wardens,
    db.lovers,
    new Set(Object.keys(account.ownedWardens).map(Number)),
    new Set(Object.keys(account.ownedLovers).map(Number)),
    account.bag
  );
  const candidate = candidates.wardens.find(item => item.id === wardenId);
  if (!candidate?.canSummon) {
    return {
      ok: false,
      error: {
        code: 'SUMMON_UNAVAILABLE',
        wardenId,
        itemId: candidate?.itemId ?? null,
        required: candidate?.cost ?? 0,
        available: candidate?.have ?? 0,
        message: 'Недостаточно предметов для призыва этого смотрителя.',
      },
    };
  }

  if (candidate.itemId && candidate.cost > 0) {
    account.bag[candidate.itemId] = Math.max(0, (account.bag[candidate.itemId] || 0) - candidate.cost);
  }
  account.ownedWardens[wardenId] = { level: 1, promoteId: 1, exp: 0, talents: {}, auras: {} };
  return { ok: true, account, candidate };
}

export function getOracleCapabilities() {
  return {
    oracleVersion: ORACLE_VERSION,
    schemaVersion: ORACLE_SCHEMA_VERSION,
    engineVersion: '5.0.0',
    dataVersion: 'GAME_DB_v5.0.0',
    gameApiConnected: false,
    inputMode: 'manual-player-entry',
    stateless: true,
    sections: [
      'dominance', 'conclave', 'courtyard', 'warden-levels', 'talents',
      'auras', 'presences', 'blood-bonds', 'skins', 'summons', 'inventory',
      'intimacy', 'attraction', 'guild-exp',
    ],
    formulaCaveats: [
      'Warden blood costs currently use an approximate progression curve.',
      'Blood-bond costs currently use formula estimates.',
      'Summon dominance gain is an estimate and is excluded from the exact total.',
    ],
  };
}
