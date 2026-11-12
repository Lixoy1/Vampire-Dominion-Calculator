import assert from 'node:assert/strict';
import { GAME_DB } from '../scripts/data.js';
import { FABRIC_COST_BY_QUALITY as EngineFabricCostMap, calcWardenLevelMultiplier, calcWardenTalentSum } from '../scripts/engine.js';

function EngineFabricCost(quality) { return EngineFabricCostMap[quality] ?? null; }
import {
  LOCAL_ENGINE_VERSION,
  calculateLocalSnapshot,
  autoDistributeAll,
  autoDistributeConclave,
  autoDistributeTalentPlan,
  autoDistributePresencePlan,
  autoDistributeBondPlan,
  commitLocalPlan,
  summonWarden,
  summonLover,
  importCommunitySnapshot,
  getLocalEngineCapabilities,
} from '../scripts/local-planner.js';

const warden = GAME_DB.wardens[0];
const lover = GAME_DB.lovers.find(item => item.warden_id === warden.id);
assert.ok(warden, 'reference warden exists');
assert.ok(lover, 'reference lover exists for selected warden');

function makeAccount() {
  return {
    blood: 0,
    conclaveExp: 0,
    courtyardExp: 0,
    courtyardLvl: 10,
    conclave: { strength: 10, allure: 10, intellect: 10, spirit: 10 },
    ownedWardens: {
      [warden.id]: { level: 10, promoteId: 1, exp: 800, talents: {}, auras: {} },
    },
    ownedLovers: {
      [lover.id]: { affinity: 10000, closeness: 200, sex: 'female', presences: {}, bonds: {} },
    },
    skins: {},
    bag: {},
  };
}

function makePlan() {
  return {
    conclave: { strength: 10, allure: 10, intellect: 10, spirit: 10 },
    courtyardToLvl: 10,
    levels: {},
    promotes: {},
    bonds: {},
    skins: {},
    summons: { wardens: [], lovers: [] },
  };
}

function walkNumbers(value, path = 'root') {
  if (typeof value === 'number') {
    assert.ok(Number.isFinite(value), `finite number at ${path}`);
    return;
  }
  if (Array.isArray(value)) return value.forEach((child, index) => walkNumbers(child, `${path}[${index}]`));
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) walkNumbers(child, `${path}.${key}`);
  }
}

{
  const account = makeAccount();
  const original = structuredClone(account);
  const snapshot = calculatelocal planner({ account, plan: makePlan() });

  assert.equal(snapshot.meta.localEngineVersion, ORACLE_VERSION);
  assert.equal(snapshot.meta.inputSource, 'player-entered');
  assert.equal(snapshot.meta.gameConnected, false);
  assert.equal(snapshot.meta.stateless, true);
  assert.equal(snapshot.meta.project.kind, 'community-project');
  assert.ok(snapshot.report);
  assert.ok(snapshot.conclaveBranches.strength);
  assert.ok(snapshot.courtyardUpgrade);
  assert.ok(snapshot.wardens[warden.id]);
  assert.ok(snapshot.wardens[warden.id].levelUpgrade);
  assert.ok(snapshot.lovers[lover.id]);
  assert.ok(snapshot.lovers[lover.id].bondResult);
  assert.ok(snapshot.summonCandidates);
  assert.ok(snapshot.inventory);
  const firstInventoryItem = GAME_DB.items.find(item => item.category && snapshot.inventory[item.category]?.items.some(row => row.id === item.id));
  assert.ok(firstInventoryItem, 'inventory categories are returned by local planner');
  assert.equal(
    snapshot.inventory[firstInventoryItem.category].items.find(row => row.id === firstInventoryItem.id).count,
    account.bag[firstInventoryItem.id] || 0
  );
  const catalogSkins = [
    ...GAME_DB.wardens.flatMap(item => item.skins || []),
    ...GAME_DB.lovers.flatMap(item => item.skins || []),
  ];
  assert.equal(Object.keys(snapshot.skins).length, catalogSkins.length, 'every skin has a server result');
  if (catalogSkins.length) {
    const firstSkin = catalogSkins[0];
    assert.equal(snapshot.skins[firstSkin.id].level, 0);
    assert.equal(snapshot.skins[firstSkin.id].fabricPerLevel, EngineFabricCost(firstSkin.quality));
  }
  assert.deepEqual(account, original, 'calculation does not mutate player input');
  walkNumbers(snapshot);

  const capabilities = getlocal plannerCapabilities();
  assert.equal(capabilities.gameApiConnected, false);
  assert.equal(capabilities.project.kind, 'community-project');
  assert.ok(capabilities.sections.includes('dominance'));
  assert.ok(capabilities.sections.includes('inventory'));
}

{
  const account = makeAccount();
  const plan = makePlan();
  const candidate = GAME_DB.wardens.find(item => item.id !== warden.id);
  assert.ok(candidate);
  plan.summons.wardens = [candidate.id];

  const snapshot = calculatelocal planner({ account, plan });
  assert.ok(snapshot.report.gain.summon > 0);
  assert.equal(
    snapshot.report.gain.totalWithSummonEstimate,
    snapshot.report.gain.total + snapshot.report.gain.summon,
    'estimated summon value is displayed separately from the exact total'
  );
  assert.ok(snapshot.warnings.some(item => item.code === 'ESTIMATED_SUMMON_GAIN'));
}

{
  const account = makeAccount();
  const plan = makePlan();
  plan.levels[warden.id] = 11;

  const snapshot = calculatelocal planner({ account, plan });
  assert.ok(snapshot.report.spent.blood > 0);
  assert.ok(snapshot.warnings.some(item => item.code === 'APPROXIMATE_BLOOD_COST'));

  const blocked = commitlocal plannerPlan({ account, plan });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.error.code, 'INSUFFICIENT_BLOOD');
}

{
  const account = makeAccount();
  const plan = makePlan();
  const auto = autoDistributeAll({ account, plan });
  assert.ok(auto.plan);
  assert.ok(auto.plan.conclave);
  assert.ok(auto.plan.levels);

  const conclave = autoDistributeConclave({ account, plan });
  assert.ok(conclave.levels);
  for (const attribute of ['strength', 'allure', 'intellect', 'spirit']) {
    assert.ok(conclave.levels[attribute] >= account.conclave[attribute]);
  }
}

{
  const account = makeAccount();
  const w = GAME_DB.wardens.find(item => item.id === warden.id);
  for (const talent of w.talents) {
    account.bag[talent.scroll_item_id] = 1;
    account.bag[talent.script_item_id] = 500;
  }
  const auto = autoDistributeTalentPlan({ account, plan: {
    ...makePlan(),
    conclave: { strength: 0, allure: 0, intellect: 0, spirit: 0 },
    courtyardToLvl: 0,
  } });
  assert.ok(auto.summary.plannedLevels > 0, 'talent optimiser allocates owned Warden talent levels');
  assert.ok(auto.summary.scrollLevels > 0, 'scroll groups receive levels');
  assert.ok(auto.summary.scriptLevels > 0, 'script groups receive levels');
  assert.ok(auto.plan.talents[warden.id]);
  const calculated = calculatelocal planner({ account, plan: auto.plan });
  assert.ok(calculated.report.gain.talents > 0, 'talent dominance is included in the combined report');
  assert.equal(calculated.talentPlan.plannedLevels, auto.summary.plannedLevels);
}

{
  const account = makeAccount();
  const firstTalent = warden.talents[0];
  account.bag[firstTalent.scroll_item_id] = 1;
  const plan = makePlan();
  plan.talents = { [warden.id]: { scrolls: { 0: 1 }, scripts: {} } };
  const committed = commitlocal plannerPlan({ account, plan });
  assert.equal(committed.ok, true);
  assert.equal(committed.account.ownedWardens[warden.id].talents[0], 2);
  assert.equal(committed.account.bag[firstTalent.scroll_item_id], 0);
  assert.equal(account.ownedWardens[warden.id].talents[0] || 1, 1, 'commit does not mutate submitted account');

  const insufficient = commitlocal plannerPlan({
    account: makeAccount(),
    plan,
  });
  assert.equal(insufficient.ok, false);
  assert.equal(insufficient.error.code, 'INSUFFICIENT_TALENT_ITEMS');
}

{
  const warden = GAME_DB.wardens.find(item => item.id === 10510);
  const lover = GAME_DB.lovers.find(item => item.id === 20510);
  assert.ok(warden && lover && warden.summon_item_id && lover.summon_item_id);
  const account = {
    blood: 0, conclaveExp: 0, courtyardExp: 0, courtyardLvl: 0,
    conclave: {}, ownedWardens: {}, ownedLovers: {},
    bag: {
      [warden.summon_item_id]: warden.summon_item_count,
      [lover.summon_item_id]: lover.summon_item_count,
    },
  };
  const auto = autoDistributeAll({ account, plan: {} });
  assert.ok(auto.plan.summons.wardens.includes(warden.id), 'auto-distribute selects an affordable Warden');
  assert.ok(auto.plan.summons.lovers.includes(lover.id), 'auto-distribute selects the matching Lover after the Warden');

  const committed = commitlocal plannerPlan({ account, plan: auto.plan });
  assert.equal(committed.ok, true, 'a planned Warden and their Lover can be committed together');
  assert.ok(committed.account.ownedWardens[warden.id]);
  assert.ok(committed.account.ownedLovers[lover.id]);
  assert.equal(committed.account.bag[warden.summon_item_id], 0);
  assert.equal(committed.account.bag[lover.summon_item_id], 0);
}

{
  const account = makeAccount();
  const committed = commitlocal plannerPlan({ account, plan: makePlan() });
  assert.equal(committed.ok, true);
  assert.ok(committed.account);
  assert.equal(account.blood, 0, 'atomic commit does not mutate the submitted object');
}

{
  const account = {
    blood: 0,
    conclaveExp: 0,
    courtyardExp: 0,
    courtyardLvl: 0,
    conclave: {},
    ownedWardens: {},
    ownedLovers: {},
    bag: {},
  };
  const summoned = summonWarden({ account, wardenId: warden.id });
  assert.equal(summoned.ok, true);
  assert.ok(summoned.account.ownedWardens[warden.id]);
  assert.deepEqual(account.ownedWardens, {}, 'summon does not mutate submitted profile');

  const duplicate = summonWarden({ account: summoned.account, wardenId: warden.id });
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.error.code, 'WARDEN_ALREADY_OWNED');
}


{
  const account = makeAccount();
  delete account.ownedLovers[lover.id];
  const candidate = calculatelocal planner({ account, plan: makePlan() }).summonCandidates.lovers.find(item => item.id === lover.id);
  assert.ok(candidate, 'reference lover is available as a summon candidate');
  if (candidate.itemId && candidate.cost > 0) account.bag[candidate.itemId] = candidate.cost;

  const original = structuredClone(account);
  const summoned = summonLover({ account, loverId: lover.id });
  assert.equal(summoned.ok, true);
  assert.ok(summoned.account.ownedLovers[lover.id]);
  assert.deepEqual(account, original, 'lover summon does not mutate submitted profile');

  const duplicate = summonLover({ account: summoned.account, loverId: lover.id });
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.error.code, 'LOVER_ALREADY_OWNED');

  const plan = makePlan();
  plan.summons.lovers = [lover.id];
  const committed = commitlocal plannerPlan({ account, plan });
  assert.equal(committed.ok, true, 'commit plan applies lover summon');
  assert.ok(committed.account.ownedLovers[lover.id]);
}


{
  const snapshotFromLegacyGuild = calculatelocal planner({
    account: { guild: { exp: 6800, level: 11, next_level_exp: 7000 } },
    plan: {},
  });
  assert.deepEqual(snapshotFromLegacyGuild.guildProgress, { exp: 6800, level: 11, nextLevelExp: 7000 });

  const account = makeAccount();
  account.bag = { 4230: 2, 4235: 3, 4005: 2, 4002: 4, 4821: 1 };
  const snapshot = calculatelocal planner({ account, plan: makePlan() });
  assert.equal(snapshot.eventCalculators.intimacy.expected, 20);
  assert.equal(snapshot.eventCalculators.attraction.expected, 30);
  assert.equal(snapshot.eventCalculators.guildExp.expected, 2220);
  assert.deepEqual(snapshot.guildProgress, { exp: 0, level: 0, nextLevelExp: 0 });
  assert.equal(snapshot.eventCalculators.guildExp.items.find(item => item.item_id === 4002)?.counted, 1);
}

{
  const helperWardenRows = [
    { template_id: 10170, talent_exp: 45, level: 450, promote_id: 8, filled: true, dominance: '2335120.0000000000' },
    { template_id: 10270, talent_exp: 0, level: 450, promote_id: 8, filled: true, dominance: '6701429.0000000000' },
    { template_id: 10280, talent_exp: 0, level: 56, promote_id: 1, filled: false, dominance: '1753603.0000000000' },
    { template_id: 10530, talent_exp: 0, level: 1, promote_id: 1, filled: false, dominance: '1738764.0000000000' },
    { template_id: 10540, talent_exp: 45, level: 5, promote_id: 1, filled: true, dominance: '1758651.0000000000' },
    { template_id: 10660, talent_exp: 56, level: 5, promote_id: 1, filled: true, dominance: '1745845.0000000000' },
    { template_id: 10670, talent_exp: 0, level: 1, promote_id: 1, filled: true, dominance: '1744134.0000000000' },
    { template_id: 10940, talent_exp: 0, level: 1, promote_id: 1, filled: false, dominance: '3089022.0000000000' },
    { template_id: 10950, talent_exp: 0, level: 450, promote_id: 8, filled: true, dominance: '4502756.0000000000' },
    { template_id: 10960, talent_exp: 0, level: 1, promote_id: 1, filled: false, dominance: '3089022.0000000000' },
  ];
  const helperBondRows = [
    { template_id: 2603, level: 0, percent_level: 0 },
    { template_id: 2601, level: 0, percent_level: 0 },
    { template_id: 2604, level: 0, percent_level: 0 },
    { template_id: 2602, level: 0, percent_level: 0 },
  ];
  const helperSkinRows = [
    { kind: 'warden', owner_id: 10270, template_id: 10273101, level: 8 },
    { kind: 'warden', owner_id: 10540, template_id: 10544101, level: 10 },
    { kind: 'lover', owner_id: 20510, template_id: 30514101, level: 4 },
  ];
  const imported = importCommunitySnapshot({
    account: makeAccount(),
    snapshots: [
      helperWardenRows,
      helperBondRows,
      [{ attribute: 'strength', level: 23 }, { attribute: 'allure', level: 74 }, { attribute: 'intellect', level: 45 }, { attribute: 'spirit', level: 75 }],
      helperSkinRows,
      { exp: 6800, level: 11, next_level_exp: 7000 },
    ],
  });
  assert.equal(imported.summary.wardens, 10);
  assert.equal(imported.account.ownedWardens[10270].level, 450);
  assert.equal(imported.account.ownedWardens[10270].promoteId, 8);
  assert.equal(imported.account.ownedWardens[10540].exp, 45);
  assert.equal(imported.account.ownedWardens[10280].sourceFilled, false);
  assert.equal(imported.account.communityImport.observedWardenDominance[10270], '6701429.0000000000');
  assert.equal(imported.summary.bonds, 4);
  assert.equal(imported.account.ownedLovers[20260].bonds.strength.level, 0);
  assert.equal(imported.account.ownedLovers[20260].bonds.allure.percentLevel, 0);
  assert.equal(imported.summary.skins, 3);
  assert.equal(imported.account.skins[10273101], 8);
  assert.equal(imported.account.skinOwnership[10273101], true);
  assert.deepEqual(imported.account.conclave, { strength: 23, allure: 74, intellect: 45, spirit: 75 });
  assert.deepEqual(imported.account.guildProgress, { exp: 6800, level: 11, nextLevelExp: 7000 });
  assert.equal(imported.provenance.kind, 'community-project');
  assert.equal(imported.account.communityImport.trustLevel, 'community-reference');
  assert.equal(imported.warnings.length, 0);
}


{
  const purchasableSkin = GAME_DB.wardens.flatMap(item => item.skins || []).find(item => item.quality === 'a' && item.purchasable);
  assert.ok(purchasableSkin);
  const account = makeAccount();
  account.bag[4421] = 50;
  const plan = makePlan();
  plan.skins = { [purchasableSkin.id]: 1 };
  const preview = calculatelocal planner({ account, plan });
  assert.equal(preview.skinUpgrade.bySkin[purchasableSkin.id].fabric, 50);
  assert.equal(preview.report.spent.skinFabric[4421], 50);
  const committed = commitlocal plannerPlan({ account, plan });
  assert.equal(committed.ok, true, 'skin upgrade can be committed using matching fabric');
  assert.equal(committed.account.skins[purchasableSkin.id], 1);
  assert.equal(committed.account.bag[4421], 0);
  assert.equal(committed.account.skinStoreExp, purchasableSkin.store_exp);
  assert.equal(account.bag[4421], 50, 'skin commit does not mutate submitted profile');

  const cardAccount = makeAccount();
  cardAccount.bag[purchasableSkin.id] = 1;
  const cardCommit = commitlocal plannerPlan({
    account: cardAccount,
    plan: { ...makePlan(), skins: { [purchasableSkin.id]: 1 } },
  });
  assert.equal(cardCommit.ok, true, 'skin card is used without fabric');
  assert.equal(cardCommit.account.bag[purchasableSkin.id], 0);

  const cardOnlySkin = GAME_DB.wardens.flatMap(item => item.skins || []).find(item => !item.purchasable);
  assert.ok(cardOnlySkin);
  const blocked = commitlocal plannerPlan({
    account: makeAccount(),
    plan: { ...makePlan(), skins: { [cardOnlySkin.id]: 1 } },
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.error.code, 'SKIN_NOT_PURCHASABLE');
}


{
  const auraWarden = GAME_DB.wardens.find(item => (item.auras || []).some(aura => aura.bonus_type === 'both'));
  const presenceLover = GAME_DB.lovers.find(item => (item.presences || []).length);
  assert.ok(auraWarden && presenceLover, 'catalogue contains aura and presence templates');
  const account = {
    blood: 0, conclaveExp: 0, courtyardExp: 0, courtyardLvl: 0,
    conclave: {}, ownedWardens: {
      [auraWarden.id]: { level: 1, promoteId: 1, exp: 0, talents: {}, auras: {} },
    },
    ownedLovers: {
      [presenceLover.id]: { affinity: 0, closeness: 0, sex: 'female', presences: {}, bonds: {} },
    },
    bag: {}, skins: {},
  };
  for (const aura of auraWarden.auras) {
    account.ownedWardens[auraWarden.id].auras[aura.id] = aura.aura_type === 'not_updatable'
      ? (aura.min_lvl || 0)
      : Math.min(aura.max_lvl || 1, Math.max(aura.min_lvl || 0, 2));
  }
  for (const presence of presenceLover.presences) {
    account.ownedLovers[presenceLover.id].presences[presence.id] = Math.min(presence.max_lvl || 1, Math.max(presence.min_lvl || 0, 2));
  }
  const result = calculatelocal planner({ account, plan: { conclave: {}, courtyardToLvl: 0, levels: {}, promotes: {}, bonds: {}, talents: {}, skins: {}, summons: { wardens: [], lovers: [] } } });
  assert.ok(result.report.modifiers, 'combined report exposes separate modifiers');
  const expectedAuraTalent = { strength: 0, allure: 0, intellect: 0, spirit: 0 };
  const expectedAuraBook = { strength: 0, allure: 0, intellect: 0, spirit: 0 };
  for (const aura of auraWarden.auras) {
    const percent = result.wardens[auraWarden.id].auras[aura.id].percent;
    const buckets = aura.bonus_type === 'both'
      ? [expectedAuraTalent, expectedAuraBook]
      : [aura.bonus_type === 'book' ? expectedAuraBook : expectedAuraTalent];
    for (const bucket of buckets) for (const attr of aura.attributes || []) bucket[attr] += percent;
  }
  for (const attr of ['strength', 'allure', 'intellect', 'spirit']) {
    assert.equal(result.report.modifiers.auras.talent[attr], expectedAuraTalent[attr]);
    assert.equal(result.report.modifiers.auras.book[attr], expectedAuraBook[attr]);
  }
  const expectedPresence = { strength: 0, allure: 0, intellect: 0, spirit: 0 };
  for (const presence of presenceLover.presences) {
    const percents = result.lovers[presenceLover.id].presences[presence.id].percents;
    for (const attr of Object.keys(expectedPresence)) expectedPresence[attr] += percents[attr];
  }
  assert.deepEqual(result.report.modifiers.presences, expectedPresence);
  assert.equal(result.report.gain.total, 0, 'unverified percentage modifiers are not misrepresented as absolute dominance');
}


{
  const loverTemplate = GAME_DB.lovers.find(item => (item.presences || []).some(p => p.presence_type === 'updatable'));
  const presence = loverTemplate.presences.find(p => p.presence_type === 'updatable');
  const currentLevel = 0;
  const targetLevel = 2;
  const requiredTokens = GAME_DB.lover_presence_levels
    .filter(row => row.curve === presence.level_curve && row.lvl > currentLevel && row.lvl <= targetLevel)
    .reduce((sum, row) => sum + Number(row.cost), 0);
  const account = {
    blood: 0, conclaveExp: 0, courtyardExp: 0, courtyardLvl: 0,
    conclave: {}, ownedWardens: {},
    ownedLovers: {
      [loverTemplate.id]: { affinity: 0, closeness: 0, sex: 'female', presences: { [presence.id]: currentLevel }, bonds: {} },
    },
    bag: { [presence.upgrade_item_id]: requiredTokens }, skins: {},
  };
  const plan = { conclave: {}, courtyardToLvl: 0, levels: {}, promotes: {}, bonds: {}, talents: {}, skins: {}, presences: { [loverTemplate.id]: { [presence.id]: targetLevel } }, summons: { wardens: [], lovers: [] } };
  const preview = calculatelocal planner({ account, plan });
  assert.equal(preview.report.presenceUpgrade.byItem[presence.upgrade_item_id], requiredTokens);
  assert.equal(preview.lovers[loverTemplate.id].presences[presence.id].level, targetLevel);
  assert.ok(preview.report.modifiers.presences[presence.main_attribute] > 0);
  const committed = commitlocal plannerPlan({ account, plan });
  assert.equal(committed.ok, true, 'presence upgrade commits with required curve tokens');
  assert.equal(committed.account.ownedLovers[loverTemplate.id].presences[presence.id], targetLevel);
  assert.equal(committed.account.bag[presence.upgrade_item_id], 0);
  assert.equal(account.bag[presence.upgrade_item_id], requiredTokens, 'presence commit leaves original profile untouched');

  const insufficient = commitlocal plannerPlan({ account: { ...account, bag: { [presence.upgrade_item_id]: requiredTokens - 1 } }, plan });
  assert.equal(insufficient.ok, false);
  assert.equal(insufficient.error.code, 'INSUFFICIENT_PRESENCE_ITEMS');
}


{
  const loverTemplate = GAME_DB.lovers.find(item => (item.presences || []).some(p => p.presence_type === 'updatable'));
  const presence = loverTemplate.presences.find(p => p.presence_type === 'updatable');
  const account = {
    blood: 0, conclaveExp: 0, courtyardExp: 0, courtyardLvl: 0,
    conclave: {}, ownedWardens: {},
    ownedLovers: {
      [loverTemplate.id]: {
        affinity: 0, closeness: 0, sex: 'female',
        presences: { [presence.id]: 0 }, bonds: {},
      },
    },
    bag: { [presence.upgrade_item_id]: 150 }, skins: {},
  };
  const automatic = autoDistributePresencePlan({ account, plan: makePlan() });
  assert.equal(automatic.summary.addedLevels, 3, 'presence optimiser spends the three affordable 50-token steps');
  assert.equal(automatic.plan.presences[loverTemplate.id][presence.id], 3);
  assert.equal(automatic.summary.items[0].count, 150);

  const fullAuto = autoDistributeAll({ account, plan: makePlan() });
  assert.equal(fullAuto.summary.presences.addedLevels, 3, 'Auto All includes the presence allocator');
  assert.equal(fullAuto.plan.presences[loverTemplate.id][presence.id], 3);

  const reservedPlan = {
    ...makePlan(),
    presences: { [loverTemplate.id]: { [presence.id]: 2 } },
  };
  const afterReserved = autoDistributePresencePlan({ account, plan: reservedPlan });
  assert.equal(afterReserved.plan.presences[loverTemplate.id][presence.id], 3);
  assert.equal(afterReserved.summary.addedLevels, 1, 'existing planned levels reserve tokens before auto allocation');
}


{
  const expWarden = GAME_DB.wardens.find(item => item.talents?.some(t => t.stars === 1) && item.talents?.some(t => t.stars === 2));
  assert.ok(expWarden, 'catalogue has a Warden with a combination of talent star weights');
  const account = {
    blood: 0, conclaveExp: 0, courtyardExp: 0, courtyardLvl: 0,
    conclave: {}, ownedWardens: {
      [expWarden.id]: { level: 20, promoteId: 1, exp: 600, talents: {}, auras: {} },
    },
    ownedLovers: {}, bag: {}, skins: {},
  };
  const automatic = autoDistributeTalentPlan({ account, plan: {
    ...makePlan(),
    conclave: { strength: 0, allure: 0, intellect: 0, spirit: 0 },
    courtyardToLvl: 0,
  } });
  assert.equal(automatic.summary.expSpentTotal, 600, 'bounded allocator finds an exact 3-star-point spend from 600 EXP');
  assert.ok(automatic.summary.expLevels > 0);
  assert.ok(automatic.plan.talents[expWarden.id].exp_levels);

  const committed = commitlocal plannerPlan({ account, plan: automatic.plan });
  assert.equal(committed.ok, true, 'personal talent EXP can be committed: ' + JSON.stringify(committed.error || null));
  assert.equal(committed.account.ownedWardens[expWarden.id].exp, 0);
  assert.ok(Object.values(committed.account.ownedWardens[expWarden.id].talents).some(level => level > 1));
  assert.equal(account.ownedWardens[expWarden.id].exp, 600, 'commit does not mutate the source account');

  const combinedPlan = {
    ...automatic.plan,
    levels: { [expWarden.id]: 21 },
    conclave: { strength: 0, allure: 0, intellect: 0, spirit: 0 },
    courtyardToLvl: 0,
  };
  const combinedPreview = calculatelocal planner({
    account: { ...account, blood: 1_000_000 },
    plan: combinedPlan,
  });
  const selected = combinedPlan.talents[expWarden.id];
  const finalLevels = Object.fromEntries(expWarden.talents.map((talent, position) => [
    position,
    1 + (selected.exp_levels?.[position] || 0)
      + (selected.scrolls?.[position] || 0)
      + (selected.scripts?.[position] || 0),
  ]));
  const expectedCombinedLevelGain = Math.round(
    calcWardenTalentSum(expWarden, finalLevels) *
    (calcWardenLevelMultiplier(21) - calcWardenLevelMultiplier(20))
  );
  assert.equal(
    combinedPreview.report.gain.levels,
    expectedCombinedLevelGain,
    'Warden level gain includes the planned talent levels instead of the old talent baseline'
  );
  assert.ok(combinedPreview.report.gain.levels > 0);
  assert.equal(
    combinedPreview.report.gain.total,
    combinedPreview.report.gain.levels + combinedPreview.report.gain.talents,
    'unified dominance total includes both talent and Warden-level interactions'
  );

  const insufficient = commitlocal plannerPlan({
    account: { ...account, ownedWardens: { [expWarden.id]: { ...account.ownedWardens[expWarden.id], exp: 0 } } },
    plan: { ...{
    ...makePlan(),
    conclave: { strength: 0, allure: 0, intellect: 0, spirit: 0 },
    courtyardToLvl: 0,
  }, talents: { [expWarden.id]: { exp_levels: { 0: 1 } } } },
  });
  assert.equal(insufficient.ok, false);
  assert.equal(insufficient.error.code, 'INSUFFICIENT_TALENT_EXP');
}

{
  const bondLover = GAME_DB.lovers.find(item => item.scarlet_bonds?.length);
  const account = {
    blood: 0, conclaveExp: 0, courtyardExp: 0, courtyardLvl: 0,
    conclave: {}, ownedWardens: {},
    ownedLovers: {
      [bondLover.id]: { affinity: 1000, closeness: 200, sex: 'female', presences: {}, bonds: {} },
    },
    bag: {}, skins: {},
  };
  const automatic = autoDistributeBondPlan({ account, plan: {
    ...makePlan(),
    conclave: { strength: 0, allure: 0, intellect: 0, spirit: 0 },
    courtyardToLvl: 0,
  } });
  assert.ok(automatic.summary.addedLevels > 0, 'Bond allocator spends available Affinity on unlocked branches');
  assert.ok(automatic.summary.estimatedAffinity <= 1000);
  assert.ok(automatic.plan.bonds[bondLover.id]);
  const committed = commitlocal plannerPlan({ account, plan: automatic.plan });
  assert.equal(committed.ok, true);
  assert.ok(committed.account.ownedLovers[bondLover.id].affinity < 1000);
  assert.equal(account.ownedLovers[bondLover.id].affinity, 1000, 'bond commit leaves original profile untouched');

  const allAuto = autoDistributeAll({
    account,
    plan: {
      ...makePlan(),
      conclave: { strength: 0, allure: 0, intellect: 0, spirit: 0 },
      courtyardToLvl: 0,
    },
  });
  assert.ok(allAuto.summary.bonds.addedLevels > 0, 'Auto All includes Scarlet Bond allocation');
}


{
  const apiWarden = GAME_DB.wardens.find(item => (item.auras || []).some(aura => aura.upgrade_item_id));
  const aura = apiWarden.auras.find(item => item.upgrade_item_id);
  const apiLover = GAME_DB.lovers.find(item => (item.presences || []).some(presence => presence.presence_type === 'updatable'));
  const presence = apiLover.presences.find(item => item.presence_type === 'updatable');
  const skin = apiWarden.skins[0];
  const imported = importCommunitySnapshot({
    account: makeAccount(),
    snapshots: [{
      success: true,
      data: {
        wardens: [{
          template_id: apiWarden.id, level: 123, promote_id: 3, talent_exp: 600,
          dominance: '987654.25', filled: true,
        }],
        levels: {
          wardens: [{ id: apiWarden.id, next_cost: 1234, next_gain: 567, next_kind: 'blood' }],
        },
        lovers: [{
          id: apiLover.id, affinity: 4321, closeness: 140,
          presences: [{ id: presence.id, level: 3, next_cost: 50, next_gain: 1.5 }],
        }],
        attributes: {
          strength: { talent: '30', conclave: '7125', avatar: '1800', familiar: '337500', total: '346455' },
        },
        auras: {
          items: [{
            item_id: aura.upgrade_item_id,
            count: 2,
            best_path: { cost: [50, 75], gain: [2, 3] },
            wardens: [{
              warden_id: apiWarden.id,
              owned: true,
              levels: [{ aura_id: aura.id, level: 2, next_cost: 50, next_gain: 1 }],
            }],
          }],
        },
        talents: {
          scripts: [{ id: 512, attribute: 'strength', type: 'sample', tries: 2, chance: 100, next_gain: 169 }],
          scrolls: 12,
        },
        books: { items: [{ id: 1, min: 28, expected: 36, max: 48 }] },
        manuscripts: { tiers: [{ stars: 1, chance: 50, protection: 0, guaranteed: 56, expected: 56 }] },
        skins: [{
          kind: 'warden', owner_id: apiWarden.id, template_id: skin.id,
          level: 4, next_kind: 'fabric', next_cost: 50, next_gain: 250,
        }],
      },
    }],
  });

  assert.equal(imported.summary.wardens, 1);
  assert.equal(imported.summary.lovers, 1);
  assert.equal(imported.summary.presences, 1);
  assert.equal(imported.summary.auras, 1);
  assert.equal(imported.summary.auraPaths, 1);
  assert.equal(imported.summary.talentScripts, 1);
  assert.equal(imported.summary.bookRows, 1);
  assert.equal(imported.summary.manuscriptTiers, 1);
  assert.equal(imported.summary.skins, 1);

  assert.equal(imported.account.ownedWardens[apiWarden.id].level, 123);
  assert.equal(imported.account.ownedWardens[apiWarden.id].auras[aura.id], 2);
  assert.equal(imported.account.ownedLovers[apiLover.id].presences[presence.id], 3);
  assert.equal(imported.account.skins[skin.id], 4);

  const observations = imported.account.communityImport.referenceObservations;
  assert.deepEqual(observations.wardenSteps[apiWarden.id], {
    nextCost: 1234, nextGain: 567, nextKind: 'blood', level: null, dominance: null,
  });
  assert.deepEqual(observations.auraItems[0].bestPath, { cost: [50, 75], gain: [2, 3] });
  assert.equal(observations.talentScripts[0].next_gain, 169);
  assert.equal(observations.bookItems[0].expected, 36);
  assert.equal(observations.manuscriptTiers[0].expected, 56);
  assert.equal(observations.presenceSteps[0].nextCost, 50);

  const oracle = calculatelocal planner({ account: imported.account, plan: makePlan() });
  assert.equal(oracle.meta.project.kind, 'community-project');
  assert.equal(oracle.meta.referenceData, undefined, 'raw reference snapshots are not exposed in public calculation metadata');
}


{
  // Shape matching the real combined API payload: nested resource groups,
  // not flattened demo rows. This guards the exact import path used by the app.
  const apiWarden = GAME_DB.wardens.find(item =>
    item.auras?.some(aura => aura.upgrade_item_id) &&
    item.skins?.length &&
    item.talents?.some(talent => talent.script_item_id && talent.scroll_item_id)
  );
  const scriptTalent = apiWarden.talents.find(talent => talent.script_item_id && talent.scroll_item_id);
  const aura = apiWarden.auras.find(item => item.upgrade_item_id);
  const skin = apiWarden.skins[0];
  const apiLover = GAME_DB.lovers.find(item => item.presences?.some(presence => presence.presence_type === 'updatable')
    && item.scarlet_bonds?.length);
  const presence = apiLover.presences.find(item => item.presence_type === 'updatable');
  const bond = apiLover.scarlet_bonds.find(item => item.attribute === 'strength') || apiLover.scarlet_bonds[0];
  const fabricId = ({ a: 4421, s: 4422, ss: 4423 })[skin.quality];
  const bookItem = GAME_DB.items.find(item => item.id === 3144) || GAME_DB.items[0];
  const imported = importCommunitySnapshot({
    account: makeAccount(),
    snapshot: {
      total: '123456.0000000000',
      attributes: [{ attribute: 'strength', total: '123456.0000000000' }],
      conclave: {
        points: 40, spent: 5, left: 35,
        attributes: [{ attribute: 'strength', level: 12, target: 13, next_cost: 15, next_gain: 20 }],
        best_path: { runs: [{ key: 'strength', to: 13 }], end: 'strength' },
      },
      levels: {
        blood: 100000, spent: 10000, left: 90000,
        items: [{ item_id: fabricId, count: 2 }],
        wardens: [{ warden_id: apiWarden.id, level: 50, promote_id: 2, talent_exp: 900, next_cost: 1200, next_gain: 500 }],
        best_path: { runs: [{ key: String(apiWarden.id), to: 55 }], end: String(apiWarden.id) },
      },
      bonds: {
        trust: 20, spent: 3, left: 17,
        lovers: [{
          lover_id: apiLover.id, warden_id: apiLover.warden_id, summoned: false, trust: 6,
          bonds: [{
            attribute: bond.attribute,
            level: { level: 2, target: 2, next_cost: 0, next_gain: 25, max_target: 10 },
            percent: { level: 1, target: 1, next_cost: 20, next_gain: 2, max_target: 10 },
          }],
          best_path: { runs: [{ key: bond.attribute, to: 2 }], end: bond.attribute },
        }],
      },
      auras: {
        gain: '0',
        items: [{
          item_id: aura.upgrade_item_id, count: 4, spent: 1, left: 3,
          best_path: { runs: [{ key: String(apiWarden.id), to: 2 }], end: String(apiWarden.id) },
          wardens: [{
            warden_id: apiWarden.id, owned: true,
            levels: [{ aura_id: aura.id, level: 2, next_cost: 50, next_gain: 5 }],
          }],
        }],
      },
      presences: {
        items: [{
          item_id: presence.upgrade_item_id, count: 9, spent: 2, left: 7,
          best_path: { runs: [{ key: String(apiLover.id), to: 3 }], end: String(apiLover.id) },
          lovers: [{
            lover_id: apiLover.id, owned: true,
            levels: [{ presence_id: presence.id, level: 3, next_cost: 50, next_gain: 2 }],
          }],
        }],
      },
      skins: {
        fabrics: [{
          quality: skin.quality, item_id: fabricId, count: 2, spent: 0, left: 2,
          skins: [{
            skin_id: skin.id, owner: 'warden', owner_id: apiWarden.id, owned: true,
            quality: skin.quality, level: 4, target: 4, max_level: 10,
            next_kind: 'fabric', next_cost: 100, next_gain: 250,
          }],
        }],
        store: { exp: 120, exp_after: 120, level: 1, level_after: 1, next_exp: 200 },
      },
      talents: {
        scripts: [{
          item_id: scriptTalent.script_item_id, count: 12, spent: 2, left: 10,
          wardens: [{
            warden_id: apiWarden.id, owned: true,
            talents: [{ position: 0, attribute: scriptTalent.attribute, stars: scriptTalent.stars,
              level: 3, cap: 40, next_cost: 3, next_gain: 30 }],
          }],
        }],
        scrolls: [{
          item_id: scriptTalent.scroll_item_id, count: 7, spent: 1, left: 6,
          wardens: [{ warden_id: apiWarden.id, owned: true, talents: [] }],
        }],
        own_exp: [{
          warden_id: apiWarden.id, owned: true, exp: 900, promote_exp: 0, level: 50,
          talents: [{ position: 0, level: 3 }],
        }],
      },
      books: { items: [{ item_id: bookItem.id, count: 8, expected: 80 }] },
      courtyard: { level: 120, points: 25, spent: 3, left: 22 },
    },
  });

  assert.equal(imported.account.blood, 90000, 'Helper remaining Blood is imported');
  assert.equal(imported.account.conclaveExp, 35, 'remaining Conclave points are imported');
  assert.equal(imported.account.conclave.strength, 12, 'current Conclave attribute level is imported');
  assert.equal(imported.account.ownedWardens[apiWarden.id].level, 50, 'nested level Warden row is imported');
  assert.equal(imported.account.ownedWardens[apiWarden.id].exp, 900, 'Warden personal EXP is imported');
  assert.equal(imported.account.ownedWardens[apiWarden.id].talents[0], 3, 'nested talent levels are imported');
  assert.equal(imported.account.ownedWardens[apiWarden.id].auras[aura.id], 2, 'nested aura levels are imported');
  assert.equal(imported.account.ownedLovers[apiLover.id].affinity, 6, 'per-Lover Trust is imported');
  assert.equal(imported.account.ownedLovers[apiLover.id].bonds[bond.attribute].level, 2, 'nested Scarlet Bond levels are imported');
  assert.equal(imported.account.ownedLovers[apiLover.id].bonds[bond.attribute].percentLevel, 1, 'nested Scarlet Bond percent levels are imported');
  assert.equal(imported.account.ownedLovers[apiLover.id].presences[presence.id], 3, 'nested Presence levels are imported');
  assert.equal(imported.account.skins[skin.id], 4, 'nested fabric skin level is imported');
  assert.equal(imported.account.skinStoreExp, 120, 'skin shop experience is imported');
  assert.equal(imported.account.courtyardLvl, 120, 'Courtyard level is imported');
  assert.equal(imported.account.courtyardExp, 22, 'remaining Courtyard points are imported');
  assert.equal(imported.account.bag[scriptTalent.script_item_id], 12, 'manuscript stock is imported');
  assert.equal(imported.account.bag[scriptTalent.scroll_item_id], 7, 'scroll stock is imported');
  assert.equal(imported.account.bag[bookItem.id], 8, 'book stock is imported');
  assert.deepEqual(imported.account.communityImport.referenceObservations.bestPaths.levels.runs,
    [{ key: String(apiWarden.id), to: 55 }], 'exact Helper levels best_path is retained');
  assert.deepEqual(imported.account.communityImport.referenceObservations.bestPaths.bonds[String(apiLover.id)].runs,
    [{ key: bond.attribute, to: 2 }], 'exact nested bond best_path is retained');
  assert.equal(imported.account.communityImport.referenceObservations.bondSteps.length, 2, 'both nested Bond cost/gain observations are retained');
  assert.equal(imported.account.communityImport.referenceObservations.presenceSteps.length, 1, 'nested Presence next-step data is retained');
  assert.equal(imported.account.communityImport.referenceObservations.skinSteps.length, 1, 'nested Skin next-step data is retained');

  const result = calculatelocal planner({ account: imported.account, plan: makePlan() });
  assert.equal(result.meta.referenceData, undefined, 'public metadata contains no imported raw snapshots');
}

console.log('PASS unified server local planner tests');
