/**
 * UNIFIED SERVER ORACLE
 *
 * All gameplay calculations exposed to the browser are executed here on the
 * Render server. The calculator deliberately does not connect to Game of
 * Vampires: players enter their own observed in-game values.
 */
import { GAME_DB } from './js/data.js';
import * as Engine from './js/engine.js';

export const ORACLE_VERSION = '1.4.0';
export const ORACLE_SCHEMA_VERSION = 1;

const CATALOG_PROVENANCE = Object.freeze({
  sourceId: 'dhampir-helper-api',
  sourceLabel: 'API бота «Помощник Дампира»',
  sourceType: 'third-party-bot-api',
  trustLevel: 'reference-unverified',
  gameServerVerified: false,
  note: 'Справочные каталоги и ограничения получены из API стороннего бота. Они не являются подтверждёнными ответами Game of Vampires.',
});

const GAME_VERIFICATION = Object.freeze({
  status: 'not-verified',
  verifiedAgainstGame: false,
  note: 'Контрольные значения непосредственно из игрового клиента пока не внесены.',
});

const ATTRIBUTES = Engine.ATTRIBUTES;
const INTIMACY_ITEM_IDS = [4211, 4212, 4213, 4230, 4231, 4232, 30005, 30006, 30007, 30008];
const ATTRACTION_ITEM_IDS = [4221, 4222, 4223, 4235, 4236, 4237, 30009, 30010, 30011, 30012];

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
      promoteId: Math.max(1, Math.min(db.promotes.length, Math.round(numeric(warden.promoteId, 1)))),
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

  const guild = record(account.guildProgress ?? account.guild);

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
    guildProgress: {
      exp: nonNegative(guild.exp),
      level: Math.max(0, Math.min(999, Math.round(numeric(guild.level)))),
      nextLevelExp: nonNegative(guild.nextLevelExp ?? guild.next_level_exp),
    },
    skins: record(account.skins),
    skinStoreExp: nonNegative(account.skinStoreExp),
    skinOwnership: record(account.skinOwnership),
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
    skins: Object.fromEntries(Object.entries(record(source.skins)).filter(([id]) => {
      const skinId = Number(id);
      return db.wardens.some(item => (item.skins || []).some(skin => skin.id === skinId))
        || db.lovers.some(item => (item.skins || []).some(skin => skin.id === skinId));
    }).map(([id, target]) => {
      const skinId = Number(id);
      const skin = [...db.wardens, ...db.lovers].flatMap(item => item.skins || []).find(item => item.id === skinId);
      const current = Math.max(0, Math.min(skin?.max_lvl || 10, Math.round(numeric(account.skins[id]))));
      return [id, Math.max(current, Math.min(skin?.max_lvl || 10, Math.round(numeric(target, current))))];
    })),
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

  // Planned talent additions are increments, not absolute talent levels.
  // Clamp scroll + script increments together so a talent cannot exceed the
  // selected promotion's cap.
  plan.talents = {};
  for (const [id, raw] of Object.entries(record(source.talents))) {
    if (!/^\d+$/.test(id)) continue;
    const warden = db.wardens.find(item => item.id === Number(id));
    const owned = account.ownedWardens[id];
    if (!warden || !owned) continue;
    const promoteId = Math.max(1, Math.min(db.promotes.length, Math.round(numeric(plan.promotes[id], owned.promoteId || 1))));
    const maxLevel = db.promotes.find(item => item.id === promoteId)?.max_talent_lvl ?? 40;
    const selected = record(raw);
    const scrolls = {};
    const scripts = {};
    for (let position = 0; position < warden.talents.length; position++) {
      const baseLevel = Math.max(1, Math.min(maxLevel, Math.round(numeric(record(owned.talents)[position], 1))));
      const room = Math.max(0, maxLevel - baseLevel);
      const scrollCount = Math.max(0, Math.min(room, Math.round(numeric(record(selected.scrolls)[position]))));
      const scriptCount = Math.max(0, Math.min(room - scrollCount, Math.round(numeric(record(selected.scripts)[position]))));
      if (scrollCount) scrolls[position] = scrollCount;
      if (scriptCount) scripts[position] = scriptCount;
    }
    if (Object.keys(scrolls).length || Object.keys(scripts).length) {
      plan.talents[id] = { scrolls, scripts };
    }
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

function getSkinPlanUsage(plan, account) {
  const byItem = {};
  const byFabric = {};
  const bySkin = {};
  const unavailable = {};
  let storeExp = 0;
  for (const [skinId, targetRaw] of Object.entries(record(plan.skins))) {
    const skinIdNumber = Number(skinId);
    const owner = db.wardens.find(item => (item.skins || []).some(skin => skin.id === skinIdNumber))
      || db.lovers.find(item => (item.skins || []).some(skin => skin.id === skinIdNumber));
    const skin = owner?.skins?.find(item => item.id === skinIdNumber);
    if (!skin) continue;
    const current = Math.max(0, Math.min(skin.max_lvl || 10, Math.round(numeric(account.skins[skinId]))));
    const target = Math.max(current, Math.min(skin.max_lvl || 10, Math.round(numeric(targetRaw, current))));
    const levels = target - current;
    if (!levels) continue;
    const cards = Math.min(levels, nonNegative(account.bag[skinId]));
    const fabricLevels = levels - cards;
    if (fabricLevels > 0 && !skin.purchasable) unavailable[skinId] = fabricLevels;
    const fabricId = ({ a: 4421, s: 4422, ss: 4423 })[skin.quality];
    const fabricPerLevel = Engine.FABRIC_COST_BY_QUALITY[skin.quality] || 0;
    const fabric = fabricLevels * fabricPerLevel;
    byItem[skinId] = cards;
    if (fabricId && fabric) byFabric[fabricId] = (byFabric[fabricId] || 0) + fabric;
    bySkin[skinId] = { from: current, to: target, levels, cards, fabric, fabricItemId: fabricId };
    storeExp += levels * nonNegative(skin.store_exp);
  }
  return { byItem, byFabric, bySkin, unavailable, storeExp };
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

function getTalentPlanUsage(plan, ownedWardens) {
  const byItem = {};
  const byWarden = {};
  let scrollLevels = 0;
  let scriptLevels = 0;
  let totalLevels = 0;

  for (const [wardenId, selectedRaw] of Object.entries(record(plan.talents))) {
    const warden = db.wardens.find(item => item.id === Number(wardenId));
    if (!warden || !ownedWardens[wardenId]) continue;
    const selected = record(selectedRaw);
    const scrolls = record(selected.scrolls);
    const scripts = record(selected.scripts);
    const wardenSummary = { scrollLevels: 0, scriptLevels: 0, itemCosts: {} };

    for (let position = 0; position < warden.talents.length; position++) {
      const talent = warden.talents[position];
      const scrollCount = Math.max(0, Math.round(numeric(scrolls[position])));
      const scriptCount = Math.max(0, Math.round(numeric(scripts[position])));
      if (scrollCount && talent.scroll_item_id) {
        byItem[talent.scroll_item_id] = (byItem[talent.scroll_item_id] || 0) + scrollCount;
        wardenSummary.itemCosts[talent.scroll_item_id] = (wardenSummary.itemCosts[talent.scroll_item_id] || 0) + scrollCount;
      }
      if (scriptCount && talent.script_item_id) {
        const scriptCost = Engine.calcScriptExpectedCost({ tries: talent.stars }, scriptCount);
        byItem[talent.script_item_id] = (byItem[talent.script_item_id] || 0) + scriptCost;
        wardenSummary.itemCosts[talent.script_item_id] = (wardenSummary.itemCosts[talent.script_item_id] || 0) + scriptCost;
      }
      wardenSummary.scrollLevels += scrollCount;
      wardenSummary.scriptLevels += scriptCount;
    }
    if (wardenSummary.scrollLevels || wardenSummary.scriptLevels) {
      byWarden[wardenId] = wardenSummary;
      scrollLevels += wardenSummary.scrollLevels;
      scriptLevels += wardenSummary.scriptLevels;
      totalLevels += wardenSummary.scrollLevels + wardenSummary.scriptLevels;
    }
  }

  return { byItem, byWarden, scrollLevels, scriptLevels, totalLevels };
}

function buildTalentDistributionBlock(account, plan, availableBag = account.bag) {
  const groups = { scrolls: new Map(), scripts: new Map() };
  const usage = getTalentPlanUsage(plan, account.ownedWardens);
  const targetLevel = id => Math.max(account.ownedWardens[id]?.level || 1, numeric(plan.levels[id], account.ownedWardens[id]?.level || 1));

  for (const [wardenId, owned] of Object.entries(account.ownedWardens)) {
    const warden = db.wardens.find(item => item.id === Number(wardenId));
    if (!warden) continue;
    const promotionId = Math.max(1, Math.min(db.promotes.length, Math.round(numeric(plan.promotes[wardenId], owned.promoteId || 1))));
    const cap = db.promotes.find(item => item.id === promotionId)?.max_talent_lvl ?? 40;
    const selection = record(plan.talents[wardenId]);
    const selectedScrolls = record(selection.scrolls);
    const selectedScripts = record(selection.scripts);
    const multiplier = Engine.calcWardenLevelMultiplier(targetLevel(wardenId));

    for (let position = 0; position < warden.talents.length; position++) {
      const talent = warden.talents[position];
      if (!talent.scroll_item_id && !talent.script_item_id) continue;
      const baseLevel = Math.max(1, Math.min(cap, Math.round(numeric(record(owned.talents)[position], 1))));
      const scrollChosen = Math.max(0, Math.round(numeric(selectedScrolls[position])));
      const scriptChosen = Math.max(0, Math.round(numeric(selectedScripts[position])));
      const finalLevel = Math.min(cap, baseLevel + scrollChosen + scriptChosen);
      const common = {
        position,
        cap,
        final: finalLevel,
        max_chosen: Math.max(0, cap - baseLevel),
        next_gain: talent.stars * multiplier,
      };

      const addLine = (category, itemId, chosen, extra) => {
        if (!itemId) return;
        const groupMap = groups[category];
        if (!groupMap.has(itemId)) {
          const reserved = usage.byItem[itemId] || 0;
          groupMap.set(itemId, {
            item_id: itemId,
            left: Math.max(0, nonNegative(availableBag[itemId]) - reserved),
            wardens: new Map(),
          });
        }
        const group = groupMap.get(itemId);
        if (!group.wardens.has(Number(wardenId))) {
          group.wardens.set(Number(wardenId), { warden_id: Number(wardenId), talents: [] });
        }
        group.wardens.get(Number(wardenId)).talents.push({
          ...common,
          chosen,
          ...extra,
        });
      };

      addLine('scrolls', talent.scroll_item_id, scrollChosen, { next_cost: 1 });
      addLine('scripts', talent.script_item_id, scriptChosen, { tries: Math.max(1, Number(talent.stars) || 1) });
    }
  }

  return {
    scrolls: [...groups.scrolls.values()].map(group => ({
      item_id: group.item_id,
      left: group.left,
      wardens: [...group.wardens.values()],
    })),
    scripts: [...groups.scripts.values()].map(group => ({
      item_id: group.item_id,
      left: group.left,
      wardens: [...group.wardens.values()],
    })),
    own_exp: [],
  };
}

function runTalentAutoDistribution(account, plan, availableBag = account.bag) {
  const block = buildTalentDistributionBlock(account, plan, availableBag);
  const result = Engine.autoDistributeTalents(block, plan.talents || {});
  const nextPlan = { ...plan, talents: result.after };
  return {
    plan: normalizePlan(nextPlan, account),
    opened: result.opened,
    usage: getTalentPlanUsage(nextPlan, account.ownedWardens),
  };
}

function calculateTalentGain(account, plan) {
  let gain = 0;
  for (const [wardenId, selectedRaw] of Object.entries(record(plan.talents))) {
    const warden = db.wardens.find(item => item.id === Number(wardenId));
    const owned = account.ownedWardens[wardenId];
    if (!warden || !owned) continue;
    const selected = record(selectedRaw);
    const multiplier = Engine.calcWardenLevelMultiplier(
      Math.max(owned.level || 1, numeric(plan.levels[wardenId], owned.level || 1))
    );
    for (let position = 0; position < warden.talents.length; position++) {
      const levels = Math.max(0, numeric(record(selected.scrolls)[position]))
        + Math.max(0, numeric(record(selected.scripts)[position]));
      gain += levels * warden.talents[position].stars * multiplier;
    }
  }
  return Math.round(gain);
}

export function autoDistributeTalentPlan(input = {}) {
  const raw = record(input);
  const account = normalizeAccount(raw.account);
  const plan = normalizePlan(raw.plan, account);
  const distribution = runTalentAutoDistribution(account, plan, account.bag);
  return {
    plan: distribution.plan,
    opened: distribution.opened,
    summary: {
      plannedLevels: distribution.usage.totalLevels,
      scrollLevels: distribution.usage.scrollLevels,
      scriptLevels: distribution.usage.scriptLevels,
      items: distribution.usage.byItem,
    },
  };
}

export function calculateOracle(input = {}) {
  const raw = record(input);
  const account = normalizeAccount(raw.account);
  const plan = normalizePlan(raw.plan, account);
  const report = Engine.calculateTotalDominanceReport({ db, account, plan });
  const talentUsage = getTalentPlanUsage(plan, account.ownedWardens);
  const skinUsage = getSkinPlanUsage(plan, account);
  const talentGain = calculateTalentGain(account, plan);
  report.gain.talents = talentGain;
  report.gain.total += talentGain;
  report.gain.totalWithSummonEstimate += talentGain;
  report.spent.talentScrolls = talentUsage.scrollLevels;
  report.spent.talentScripts = talentUsage.scriptLevels;
  report.spent.talentItems = talentUsage.byItem;
  report.spent.skinCards = skinUsage.byItem;
  report.spent.skinFabric = skinUsage.byFabric;
  report.skinUpgrade = skinUsage;

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

  // Aura percentages modify talent/book efficiency; presence percentages are
  // separate attribute modifiers. Keep them visible, but outside raw dominance
  // until the game-side stacking formula is verified.
  const modifierBreakdown = {
    auras: { talent: {}, book: {}, totalByAttribute: {} },
    presences: { strength: 0, allure: 0, intellect: 0, spirit: 0 },
    notes: [
      'Проценты аур показаны как модификаторы эффективности талантов/книг и не прибавляются напрямую к Господству.',
      'Проценты Веяний показаны отдельно; их преобразование в абсолютное Господство не подтверждено игровым контрольным значением.',
    ],
  };
  for (const attr of ATTRIBUTES) {
    modifierBreakdown.auras.talent[attr] = 0;
    modifierBreakdown.auras.book[attr] = 0;
    modifierBreakdown.auras.totalByAttribute[attr] = 0;
  }
  for (const warden of db.wardens) {
    const owned = account.ownedWardens[warden.id];
    if (!owned) continue;
    for (const aura of warden.auras || []) {
      const level = owned.auras?.[aura.id] ?? aura.min_lvl ?? 0;
      const percent = Engine.calcAuraPercent(aura, level);
      const kind = aura.bonus_type === 'book' ? 'book' : 'talent';
      for (const attr of aura.attributes || []) {
        if (!ATTRIBUTES.includes(attr)) continue;
        modifierBreakdown.auras[kind][attr] += percent;
        modifierBreakdown.auras.totalByAttribute[attr] += percent;
      }
    }
  }
  for (const lover of db.lovers) {
    const owned = account.ownedLovers[lover.id];
    if (!owned) continue;
    for (const presence of lover.presences || []) {
      const level = owned.presences?.[presence.id] ?? presence.min_lvl ?? 0;
      const percents = Engine.calcPresencePercents(presence, level, db.presenceCurvesMap);
      for (const attr of ATTRIBUTES) modifierBreakdown.presences[attr] += numeric(percents[attr]);
    }
  }
  report.modifiers = modifierBreakdown;
  const inventory = Engine.summarizeBag(db.items, account.bag);
  // Event and guild calculators use the same server-side inventory snapshot.
  // The three-day donation cap is part of the reference helper's calculation.
  const eventCalculators = {
    intimacy: Engine.calcBagPoints(account.bag, INTIMACY_ITEM_IDS),
    attraction: Engine.calcBagPoints(account.bag, ATTRACTION_ITEM_IDS),
    guildExp: Engine.calcGuildExp(account.bag, 3),
  };

  const skins = {};
  for (const warden of db.wardens) {
    for (const skin of warden.skins || []) {
      const level = Math.max(0, Math.min(skin.max_lvl || 10, Math.round(numeric(account.skins[skin.id]))));
      const costPerLevel = Engine.FABRIC_COST_BY_QUALITY[skin.quality] ?? null;
      skins[skin.id] = {
        skinId: skin.id,
        ownerType: 'warden',
        ownerId: warden.id,
        level,
        maxLevel: skin.max_lvl || 10,
        quality: skin.quality,
        purchasable: Boolean(skin.purchasable),
        storeExp: nonNegative(skin.store_exp),
        fabricPerLevel: costPerLevel,
        levelsRemaining: Math.max(0, (skin.max_lvl || 10) - level),
        fabricToMax: skin.purchasable && costPerLevel != null
          ? Math.max(0, (skin.max_lvl || 10) - level) * costPerLevel
          : null,
      };
    }
  }
  for (const lover of db.lovers) {
    for (const skin of lover.skins || []) {
      const level = Math.max(0, Math.min(skin.max_lvl || 10, Math.round(numeric(account.skins[skin.id]))));
      const costPerLevel = Engine.FABRIC_COST_BY_QUALITY[skin.quality] ?? null;
      skins[skin.id] = {
        skinId: skin.id,
        ownerType: 'lover',
        ownerId: lover.id,
        level,
        maxLevel: skin.max_lvl || 10,
        quality: skin.quality,
        purchasable: Boolean(skin.purchasable),
        storeExp: nonNegative(skin.store_exp),
        fabricPerLevel: costPerLevel,
        levelsRemaining: Math.max(0, (skin.max_lvl || 10) - level),
        fabricToMax: skin.purchasable && costPerLevel != null
          ? Math.max(0, (skin.max_lvl || 10) - level) * costPerLevel
          : null,
      };
    }
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
    talentGain: 'engine-modelled-not-game-verified',
  };

  return {
    meta: {
      oracleVersion: ORACLE_VERSION,
      schemaVersion: ORACLE_SCHEMA_VERSION,
      engineVersion: '5.0.0',
      dataVersion: 'GAME_DB_v5.0.0',
      catalogProvenance: CATALOG_PROVENANCE,
      gameVerification: GAME_VERIFICATION,
      computedAt: new Date().toISOString(),
      inputSource: 'player-entered',
      gameConnected: false,
      stateless: true,
    },
    report,
    inventory,
    eventCalculators,
    guildProgress: account.guildProgress,
    skins,
    skinUpgrade: skinUsage,
    conclaveBranches,
    courtyardUpgrade,
    wardens,
    lovers,
    summonCandidates,
    talentPlan: {
      plannedLevels: talentUsage.totalLevels,
      scrollLevels: talentUsage.scrollLevels,
      scriptLevels: talentUsage.scriptLevels,
      items: talentUsage.byItem,
      byWarden: talentUsage.byWarden,
    },
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

  // Plan scrolls and scripts against the bag remaining after Warden
  // breakthrough reservations. The optimiser preserves any existing choices.
  const talentDistribution = runTalentAutoDistribution(account, plan, tempBag);
  plan.talents = talentDistribution.plan.talents;
  for (const [itemId, count] of Object.entries(talentDistribution.usage.byItem)) {
    tempBag[itemId] = Math.max(0, (tempBag[itemId] || 0) - count);
  }

  // Reserve summon resources through one shared bag ledger. A Lover can be
  // auto-selected only when their Warden is already owned or included above.
  plan.summons.wardens = [];
  plan.summons.lovers = [];
  const ownedWardenIds = new Set(Object.keys(account.ownedWardens).map(Number));
  const summonBag = { ...tempBag };
  const wardenCandidates = Engine.getSummonCandidates(
    db.wardens,
    db.lovers,
    ownedWardenIds,
    new Set(Object.keys(account.ownedLovers).map(Number)),
    summonBag
  ).wardens;
  plan.summons.lovers = [];
  for (const candidate of wardenCandidates) {
    if (!candidate.canSummon || candidate.cost <= 0) continue;
    if (candidate.itemId && (summonBag[candidate.itemId] || 0) < candidate.cost) continue;
    if (candidate.itemId) summonBag[candidate.itemId] -= candidate.cost;
    plan.summons.wardens.push(candidate.id);
    ownedWardenIds.add(candidate.id);
  }

  const loverCandidates = Engine.getSummonCandidates(
    db.wardens,
    db.lovers,
    ownedWardenIds,
    new Set(Object.keys(account.ownedLovers).map(Number)),
    summonBag
  ).lovers;
  for (const candidate of loverCandidates) {
    if (!candidate.hasWarden || !candidate.canSummon || candidate.cost <= 0) continue;
    if (candidate.itemId && (summonBag[candidate.itemId] || 0) < candidate.cost) continue;
    if (candidate.itemId) summonBag[candidate.itemId] -= candidate.cost;
    plan.summons.lovers.push(candidate.id);
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

  // Apply planned talent levels using the same inventory ledger as
  // breakthrough items and summons. Script requirements use expected tries
  // from the reference engine (one try per talent star).
  const talentUsage = getTalentPlanUsage(plan, draft.ownedWardens);
  for (const [itemId, count] of Object.entries(talentUsage.byItem)) {
    const available = draft.bag[itemId] || 0;
    if (available < count) {
      return {
        ok: false,
        error: {
          code: 'INSUFFICIENT_TALENT_ITEMS',
          itemId: Number(itemId),
          required: count,
          available,
          message: 'Недостаточно свитков или рукописей талантов для выбранного плана.',
        },
      };
    }
    draft.bag[itemId] = Math.max(0, available - count);
  }

  const skinUsage = getSkinPlanUsage(plan, draft);
  if (Object.keys(skinUsage.unavailable).length) {
    return { ok: false, error: { code: 'SKIN_NOT_PURCHASABLE', skins: skinUsage.unavailable, message: 'Для выбранного уровня нужны карточки обликов: этот облик нельзя улучшить тканью.' } };
  }
  for (const [itemId, count] of Object.entries(skinUsage.byItem)) {
    if ((draft.bag[itemId] || 0) < count) {
      return { ok: false, error: { code: 'INSUFFICIENT_SKIN_CARDS', itemId: Number(itemId), required: count, available: draft.bag[itemId] || 0, message: 'Недостаточно карточек обликов для выбранного плана.' } };
    }
    draft.bag[itemId] -= count;
  }
  for (const [itemId, count] of Object.entries(skinUsage.byFabric)) {
    if ((draft.bag[itemId] || 0) < count) {
      return { ok: false, error: { code: 'INSUFFICIENT_SKIN_FABRIC', itemId: Number(itemId), required: count, available: draft.bag[itemId] || 0, message: 'Недостаточно ткани для выбранного плана обликов.' } };
    }
    draft.bag[itemId] -= count;
  }
  for (const [skinId, skin] of Object.entries(skinUsage.bySkin)) draft.skins[skinId] = skin.to;
  draft.skinStoreExp = nonNegative(draft.skinStoreExp) + skinUsage.storeExp;

  const summonIds = [...new Set(plan.summons.wardens.map(Number))];
  const loverSummonIds = [...new Set(plan.summons.lovers.map(Number))];
  for (const id of summonIds) {
    const warden = db.wardens.find(item => item.id === id);
    const itemId = warden?.summon_item_id;
    const cost = Math.max(0, numeric(warden?.summon_item_count));
    const available = itemId ? (draft.bag[itemId] || 0) : 0;
    if (!warden || (cost > 0 && (!itemId || available < cost))) {
      return {
        ok: false,
        error: {
          code: 'SUMMON_UNAVAILABLE',
          kind: 'warden',
          wardenId: id,
          itemId: itemId ?? null,
          required: cost,
          available,
          message: `Призыв смотрителя ${warden?.name || id} недоступен: проверь предметы в сумке.`,
        },
      };
    }
    if (itemId && cost > 0) draft.bag[itemId] = available - cost;
  }
  for (const id of loverSummonIds) {
    const lover = db.lovers.find(item => item.id === id);
    const hasWarden = Boolean(lover && (
      draft.ownedWardens[lover.warden_id] || summonIds.includes(lover.warden_id)
    ));
    const itemId = lover?.summon_item_id;
    const cost = Math.max(0, numeric(lover?.summon_item_count));
    const available = itemId ? (draft.bag[itemId] || 0) : 0;
    if (!lover || !hasWarden || (cost > 0 && (!itemId || available < cost))) {
      return {
        ok: false,
        error: {
          code: 'SUMMON_UNAVAILABLE',
          kind: 'lover',
          loverId: id,
          itemId: itemId ?? null,
          required: cost,
          available,
          message: `Призыв возлюбленной ${lover?.name || id} недоступен: проверь её смотрителя и предметы в сумке.`,
        },
      };
    }
    if (itemId && cost > 0) draft.bag[itemId] = available - cost;
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

  for (const [wardenId, selectedRaw] of Object.entries(record(plan.talents))) {
    const owned = draft.ownedWardens[wardenId];
    const warden = db.wardens.find(item => item.id === Number(wardenId));
    if (!owned || !warden) continue;
    owned.talents ||= {};
    const selected = record(selectedRaw);
    for (let position = 0; position < warden.talents.length; position++) {
      const increments = Math.max(0, numeric(record(selected.scrolls)[position]))
        + Math.max(0, numeric(record(selected.scripts)[position]));
      if (!increments) continue;
      const cap = db.promotes.find(item => item.id === (wardenPromotes[wardenId] || owned.promoteId || 1))?.max_talent_lvl ?? 40;
      const currentLevel = Math.max(1, numeric(owned.talents[position], 1));
      owned.talents[position] = Math.min(cap, currentLevel + increments);
    }
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
  for (const id of loverSummonIds) {
    const lover = db.lovers.find(item => item.id === id);
    draft.ownedLovers[id] = {
      affinity: 0,
      closeness: 0,
      sex: lover?.fixed_sex || 'female',
      presences: {},
      bonds: {},
    };
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

export function summonLover(input = {}) {
  const raw = record(input);
  const account = normalizeAccount(raw.account);
  const loverId = Math.round(numeric(raw.loverId));
  const lover = db.lovers.find(item => item.id === loverId);
  if (!lover) {
    return { ok: false, error: { code: 'LOVER_NOT_FOUND', message: 'Возлюбленная не найдена в каталоге.' } };
  }
  if (account.ownedLovers[loverId]) {
    return { ok: false, error: { code: 'LOVER_ALREADY_OWNED', message: 'Эта возлюбленная уже добавлена в профиль.' } };
  }
  const candidates = Engine.getSummonCandidates(
    db.wardens,
    db.lovers,
    new Set(Object.keys(account.ownedWardens).map(Number)),
    new Set(Object.keys(account.ownedLovers).map(Number)),
    account.bag
  );
  const candidate = candidates.lovers.find(item => item.id === loverId);
  if (!candidate?.canSummon) {
    return {
      ok: false,
      error: {
        code: 'SUMMON_UNAVAILABLE',
        kind: 'lover',
        loverId,
        itemId: candidate?.itemId ?? null,
        required: candidate?.cost ?? 0,
        available: candidate?.have ?? 0,
        message: 'Недостаточно предметов для призыва возлюбленной.',
      },
    };
  }
  if (candidate.itemId && candidate.cost > 0) {
    account.bag[candidate.itemId] = Math.max(0, (account.bag[candidate.itemId] || 0) - candidate.cost);
  }
  account.ownedLovers[loverId] = {
    affinity: 0,
    closeness: 0,
    sex: lover.fixed_sex || 'female',
    presences: {},
    bonds: {},
  };
  return { ok: true, account, candidate };
}

/**
 * Imports manual account snapshots exported by the third-party Dhampir Helper.
 * Source dominance values are retained as references, never added to formulas.
 */
export function importDhampirSnapshot(input = {}) {
  const raw = record(input);
  const account = normalizeAccount(raw.account);
  const snapshots = Array.isArray(raw.snapshots) ? raw.snapshots : [raw.snapshot ?? raw.data ?? raw];
  const bondIndex = new Map();
  for (const lover of db.lovers) {
    for (const bond of lover.scarlet_bonds || []) bondIndex.set(Number(bond.id), { loverId: lover.id, attribute: bond.attribute });
  }
  const knownItems = new Set(db.items.map(item => item.id));
  const knownWardens = new Map(db.wardens.map(item => [item.id, item]));
  const knownLovers = new Map(db.lovers.map(item => [item.id, item]));
  const summary = { wardens: 0, bonds: 0, skins: 0, inventory: 0, conclaveAttributes: 0, guildProgress: false, skipped: 0 };
  const warnings = [];
  const observedWardenDominance = { ...(record(account.helperImport).observedWardenDominance || {}) };
  const sourceWardenFlags = { ...(record(account.helperImport).wardenFlags || {}) };

  const setWardenRows = rows => {
    for (const value of rows) {
      const row = record(value);
      const id = Math.round(numeric(row.template_id ?? row.id));
      if (!knownWardens.has(id) || row.level === undefined) { summary.skipped++; continue; }
      const current = account.ownedWardens[id] || {};
      account.ownedWardens[id] = {
        ...current,
        level: Math.max(1, Math.min(450, Math.round(numeric(row.level, current.level || 1)))),
        promoteId: Math.max(1, Math.min(db.promotes.length, Math.round(numeric(row.promote_id ?? row.promoteId, current.promoteId || 1)))),
        exp: nonNegative(row.talent_exp ?? row.exp ?? current.exp),
        talents: record(current.talents),
        auras: record(current.auras),
        sourceFilled: typeof row.filled === 'boolean' ? row.filled : current.sourceFilled,
      };
      if (row.dominance !== undefined && Number.isFinite(Number(row.dominance))) observedWardenDominance[id] = String(row.dominance);
      if (typeof row.filled === 'boolean') sourceWardenFlags[id] = row.filled;
      summary.wardens++;
    }
  };

  const setBondRows = rows => {
    for (const value of rows) {
      const row = record(value);
      const bondMeta = bondIndex.get(Math.round(numeric(row.template_id ?? row.id)));
      if (!bondMeta) { summary.skipped++; continue; }
      const lover = knownLovers.get(bondMeta.loverId);
      const current = account.ownedLovers[bondMeta.loverId] || {};
      account.ownedLovers[bondMeta.loverId] = {
        ...current,
        affinity: nonNegative(row.affinity ?? current.affinity),
        closeness: nonNegative(row.closeness ?? current.closeness),
        sex: current.sex || lover?.fixed_sex || 'female',
        presences: record(current.presences),
        bonds: {
          ...record(current.bonds),
          [bondMeta.attribute]: {
            level: Math.max(0, Math.min(600, Math.round(numeric(row.level)))),
            percentLevel: Math.max(0, Math.min(600, Math.round(numeric(row.percent_level ?? row.percentLevel)))),
          },
        },
      };
      summary.bonds++;
    }
  };

  const setSkinRows = rows => {
    for (const value of rows) {
      const row = record(value);
      const id = Math.round(numeric(row.template_id ?? row.id));
      const level = Math.max(0, Math.min(10, Math.round(numeric(row.level))));
      const kind = row.kind === 'warden' || row.kind === 'lover' ? row.kind : null;
      const ownerId = Math.round(numeric(row.owner_id ?? row.ownerId));
      const owner = kind === 'warden' ? knownWardens.get(ownerId) : kind === 'lover' ? knownLovers.get(ownerId) : null;
      const skin = owner?.skins?.find(item => item.id === id);
      if (!skin) { summary.skipped++; continue; }
      account.skins[id] = level;
      account.skinOwnership[id] = true;
      summary.skins++;
    }
  };

  const setAttributeRows = rows => {
    let changed = 0;
    for (const value of rows) {
      const row = record(value);
      if (!ATTRIBUTES.includes(row.attribute)) continue;
      const level = Math.round(numeric(row.level, -1));
      if (level < 0 || level > 180) continue;
      account.conclave[row.attribute] = level;
      changed++;
    }
    summary.conclaveAttributes += changed;
  };

  const setInventoryRows = rows => {
    for (const value of rows) {
      const row = record(value);
      const id = Math.round(numeric(row.item_id ?? row.template_id ?? row.id));
      const count = row.count ?? row.quantity ?? row.amount;
      if (!knownItems.has(id) || count === undefined) { summary.skipped++; continue; }
      account.bag[id] = nonNegative(count);
      summary.inventory++;
    }
  };

  const importObject = objectValue => {
    const object = record(objectValue);
    if (Array.isArray(object.wardens)) setWardenRows(object.wardens);
    if (Array.isArray(object.warden_list)) setWardenRows(object.warden_list);
    if (Array.isArray(object.bonds)) setBondRows(object.bonds);
    if (Array.isArray(object.scarlet_bonds)) setBondRows(object.scarlet_bonds);
    if (Array.isArray(object.skins)) setSkinRows(object.skins);
    if (Array.isArray(object.skin_levels)) setSkinRows(object.skin_levels);
    if (Array.isArray(object.attributes)) setAttributeRows(object.attributes);
    if (Array.isArray(object.conclave_attributes)) setAttributeRows(object.conclave_attributes);
    if (Array.isArray(object.conclaveLevels)) setAttributeRows(object.conclaveLevels);
    if (Array.isArray(object.inventory)) setInventoryRows(object.inventory);
    if (Array.isArray(object.bag_items)) setInventoryRows(object.bag_items);

    const guild = record(object.guildProgress ?? object.guild_progress ?? object.guild);
    const candidate = Object.keys(guild).length ? guild : object;
    if (candidate.level !== undefined && candidate.exp !== undefined &&
        (candidate.next_level_exp !== undefined || candidate.nextLevelExp !== undefined ||
         object.guildProgress !== undefined || object.guild_progress !== undefined || object.guild !== undefined)) {
      account.guildProgress = {
        exp: nonNegative(candidate.exp),
        level: Math.max(0, Math.min(999, Math.round(numeric(candidate.level)))),
        nextLevelExp: nonNegative(candidate.next_level_exp ?? candidate.nextLevelExp),
      };
      summary.guildProgress = true;
    }
  };

  for (const snapshot of snapshots) {
    if (Array.isArray(snapshot)) {
      const rows = snapshot.map(record);
      if (rows.some(row => (row.kind === 'warden' || row.kind === 'lover') && row.owner_id !== undefined && row.template_id !== undefined)) {
        setSkinRows(rows);
      } else if (rows.some(row => row.promote_id !== undefined || row.talent_exp !== undefined) &&
                 rows.some(row => knownWardens.has(Number(row.template_id ?? row.id)))) {
        setWardenRows(rows);
      } else if (rows.some(row => row.percent_level !== undefined || bondIndex.has(Number(row.template_id ?? row.id)))) {
        setBondRows(rows);
      } else if (rows.some(row => ATTRIBUTES.includes(row.attribute))) {
        setAttributeRows(rows);
      } else if (rows.some(row => row.item_id !== undefined || row.quantity !== undefined || row.amount !== undefined)) {
        setInventoryRows(rows);
      } else {
        summary.skipped += rows.length;
      }
    } else {
      importObject(snapshot);
    }
  }

  account.helperImport = {
    source: 'dhampir-helper-api',
    sourceLabel: 'API бота «Помощник Дампира»',
    trustLevel: 'reference-unverified',
    importedAt: new Date().toISOString(),
    observedWardenDominance,
    wardenFlags: sourceWardenFlags,
  };
  warnings.push('Импортированы данные стороннего бота; они не подтверждают ответы игрового сервера.');
  if (summary.bonds) warnings.push('Проверьте Доверие и Близость отдельно: в этих фрагментах их значения не передавались.');
  if (summary.skipped) warnings.push('Пропущено записей, не совпавших со схемой или каталогом: ' + summary.skipped + '.');
  return { account, summary, warnings, provenance: CATALOG_PROVENANCE };
}

export function getOracleCapabilities() {
  return {
    oracleVersion: ORACLE_VERSION,
    schemaVersion: ORACLE_SCHEMA_VERSION,
    engineVersion: '5.0.0',
    dataVersion: 'GAME_DB_v5.0.0',
    catalogProvenance: CATALOG_PROVENANCE,
    gameVerification: GAME_VERIFICATION,
    gameApiConnected: false,
    inputMode: 'manual-player-entry',
    stateless: true,
    sections: [
      'dominance', 'conclave', 'courtyard', 'warden-levels', 'talents',
      'auras', 'presences', 'blood-bonds', 'skins', 'summons', 'inventory',
      'intimacy', 'attraction', 'guild-exp', 'helper-snapshot-import',
    ],
    formulaCaveats: [
      'Warden blood costs currently use an approximate progression curve.',
      'Blood-bond costs currently use formula estimates.',
      'Summon dominance gain is an estimate and is excluded from the exact total.',
      'Helper snapshot imports are reference data, not game-server verification.',
    ],
  };
}
