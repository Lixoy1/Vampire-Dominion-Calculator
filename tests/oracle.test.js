import assert from 'node:assert/strict';
import { GAME_DB } from '../js/data.js';
import { FABRIC_COST_BY_QUALITY as EngineFabricCostMap, calcWardenLevelMultiplier, calcWardenTalentSum } from '../js/engine.js';

function EngineFabricCost(quality) { return EngineFabricCostMap[quality] ?? null; }
import {
  ORACLE_VERSION,
  calculateOracle,
  autoDistributeAll,
  autoDistributeConclave,
  autoDistributeTalentPlan,
  autoDistributePresencePlan,
  autoDistributeBondPlan,
  commitOraclePlan,
  summonWarden,
  summonLover,
  importDhampirSnapshot,
  getOracleCapabilities,
} from '../oracle.js';

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
  const snapshot = calculateOracle({ account, plan: makePlan() });

  assert.equal(snapshot.meta.oracleVersion, ORACLE_VERSION);
  assert.equal(snapshot.meta.inputSource, 'player-entered');
  assert.equal(snapshot.meta.gameConnected, false);
  assert.equal(snapshot.meta.stateless, true);
  assert.equal(snapshot.meta.catalogProvenance.sourceId, 'dhampir-helper-api');
  assert.equal(snapshot.meta.catalogProvenance.gameServerVerified, false);
  assert.equal(snapshot.meta.gameVerification.status, 'not-verified');
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
  assert.ok(firstInventoryItem, 'inventory categories are returned by Oracle');
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

  const capabilities = getOracleCapabilities();
  assert.equal(capabilities.gameApiConnected, false);
  assert.equal(capabilities.catalogProvenance.trustLevel, 'reference-unverified');
  assert.equal(capabilities.gameVerification.verifiedAgainstGame, false);
  assert.ok(capabilities.sections.includes('dominance'));
  assert.ok(capabilities.sections.includes('inventory'));
}

{
  const account = makeAccount();
  const plan = makePlan();
  const candidate = GAME_DB.wardens.find(item => item.id !== warden.id);
  assert.ok(candidate);
  plan.summons.wardens = [candidate.id];

  const snapshot = calculateOracle({ account, plan });
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

  const snapshot = calculateOracle({ account, plan });
  assert.ok(snapshot.report.spent.blood > 0);
  assert.ok(snapshot.warnings.some(item => item.code === 'APPROXIMATE_BLOOD_COST'));

  const blocked = commitOraclePlan({ account, plan });
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
  const calculated = calculateOracle({ account, plan: auto.plan });
  assert.ok(calculated.report.gain.talents > 0, 'talent dominance is included in the combined report');
  assert.equal(calculated.talentPlan.plannedLevels, auto.summary.plannedLevels);
}

{
  const account = makeAccount();
  const firstTalent = warden.talents[0];
  account.bag[firstTalent.scroll_item_id] = 1;
  const plan = makePlan();
  plan.talents = { [warden.id]: { scrolls: { 0: 1 }, scripts: {} } };
  const committed = commitOraclePlan({ account, plan });
  assert.equal(committed.ok, true);
  assert.equal(committed.account.ownedWardens[warden.id].talents[0], 2);
  assert.equal(committed.account.bag[firstTalent.scroll_item_id], 0);
  assert.equal(account.ownedWardens[warden.id].talents[0] || 1, 1, 'commit does not mutate submitted account');

  const insufficient = commitOraclePlan({
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

  const committed = commitOraclePlan({ account, plan: auto.plan });
  assert.equal(committed.ok, true, 'a planned Warden and their Lover can be committed together');
  assert.ok(committed.account.ownedWardens[warden.id]);
  assert.ok(committed.account.ownedLovers[lover.id]);
  assert.equal(committed.account.bag[warden.summon_item_id], 0);
  assert.equal(committed.account.bag[lover.summon_item_id], 0);
}

{
  const account = makeAccount();
  const committed = commitOraclePlan({ account, plan: makePlan() });
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
  const candidate = calculateOracle({ account, plan: makePlan() }).summonCandidates.lovers.find(item => item.id === lover.id);
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
  const committed = commitOraclePlan({ account, plan });
  assert.equal(committed.ok, true, 'commit plan applies lover summon');
  assert.ok(committed.account.ownedLovers[lover.id]);
}


{
  const snapshotFromLegacyGuild = calculateOracle({
    account: { guild: { exp: 6800, level: 11, next_level_exp: 7000 } },
    plan: {},
  });
  assert.deepEqual(snapshotFromLegacyGuild.guildProgress, { exp: 6800, level: 11, nextLevelExp: 7000 });

  const account = makeAccount();
  account.bag = { 4230: 2, 4235: 3, 4005: 2, 4002: 4, 4821: 1 };
  const snapshot = calculateOracle({ account, plan: makePlan() });
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
  const imported = importDhampirSnapshot({
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
  assert.equal(imported.account.helperImport.observedWardenDominance[10270], '6701429.0000000000');
  assert.equal(imported.summary.bonds, 4);
  assert.equal(imported.account.ownedLovers[20260].bonds.strength.level, 0);
  assert.equal(imported.account.ownedLovers[20260].bonds.allure.percentLevel, 0);
  assert.equal(imported.summary.skins, 3);
  assert.equal(imported.account.skins[10273101], 8);
  assert.equal(imported.account.skinOwnership[10273101], true);
  assert.deepEqual(imported.account.conclave, { strength: 23, allure: 74, intellect: 45, spirit: 75 });
  assert.deepEqual(imported.account.guildProgress, { exp: 6800, level: 11, nextLevelExp: 7000 });
  assert.equal(imported.provenance.sourceId, 'dhampir-helper-api');
  assert.equal(imported.provenance.gameServerVerified, false);
  assert.ok(imported.warnings.length > 0);
}


{
  const purchasableSkin = GAME_DB.wardens.flatMap(item => item.skins || []).find(item => item.quality === 'a' && item.purchasable);
  assert.ok(purchasableSkin);
  const account = makeAccount();
  account.bag[4421] = 50;
  const plan = makePlan();
  plan.skins = { [purchasableSkin.id]: 1 };
  const preview = calculateOracle({ account, plan });
  assert.equal(preview.skinUpgrade.bySkin[purchasableSkin.id].fabric, 50);
  assert.equal(preview.report.spent.skinFabric[4421], 50);
  const committed = commitOraclePlan({ account, plan });
  assert.equal(committed.ok, true, 'skin upgrade can be committed using matching fabric');
  assert.equal(committed.account.skins[purchasableSkin.id], 1);
  assert.equal(committed.account.bag[4421], 0);
  assert.equal(committed.account.skinStoreExp, purchasableSkin.store_exp);
  assert.equal(account.bag[4421], 50, 'skin commit does not mutate submitted profile');

  const cardAccount = makeAccount();
  cardAccount.bag[purchasableSkin.id] = 1;
  const cardCommit = commitOraclePlan({
    account: cardAccount,
    plan: { ...makePlan(), skins: { [purchasableSkin.id]: 1 } },
  });
  assert.equal(cardCommit.ok, true, 'skin card is used without fabric');
  assert.equal(cardCommit.account.bag[purchasableSkin.id], 0);

  const cardOnlySkin = GAME_DB.wardens.flatMap(item => item.skins || []).find(item => !item.purchasable);
  assert.ok(cardOnlySkin);
  const blocked = commitOraclePlan({
    account: makeAccount(),
    plan: { ...makePlan(), skins: { [cardOnlySkin.id]: 1 } },
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.error.code, 'SKIN_NOT_PURCHASABLE');
}


{
  const auraWarden = GAME_DB.wardens.find(item => (item.auras || []).length);
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
  const result = calculateOracle({ account, plan: { conclave: {}, courtyardToLvl: 0, levels: {}, promotes: {}, bonds: {}, talents: {}, skins: {}, summons: { wardens: [], lovers: [] } } });
  assert.ok(result.report.modifiers, 'combined report exposes separate modifiers');
  const expectedAuraTalent = { strength: 0, allure: 0, intellect: 0, spirit: 0 };
  const expectedAuraBook = { strength: 0, allure: 0, intellect: 0, spirit: 0 };
  for (const aura of auraWarden.auras) {
    const percent = result.wardens[auraWarden.id].auras[aura.id].percent;
    const bucket = aura.bonus_type === 'book' ? expectedAuraBook : expectedAuraTalent;
    for (const attr of aura.attributes || []) bucket[attr] += percent;
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
  const preview = calculateOracle({ account, plan });
  assert.equal(preview.report.presenceUpgrade.byItem[presence.upgrade_item_id], requiredTokens);
  assert.equal(preview.lovers[loverTemplate.id].presences[presence.id].level, targetLevel);
  assert.ok(preview.report.modifiers.presences[presence.main_attribute] > 0);
  const committed = commitOraclePlan({ account, plan });
  assert.equal(committed.ok, true, 'presence upgrade commits with required curve tokens');
  assert.equal(committed.account.ownedLovers[loverTemplate.id].presences[presence.id], targetLevel);
  assert.equal(committed.account.bag[presence.upgrade_item_id], 0);
  assert.equal(account.bag[presence.upgrade_item_id], requiredTokens, 'presence commit leaves original profile untouched');

  const insufficient = commitOraclePlan({ account: { ...account, bag: { [presence.upgrade_item_id]: requiredTokens - 1 } }, plan });
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

  const committed = commitOraclePlan({ account, plan: automatic.plan });
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
  const combinedPreview = calculateOracle({
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

  const insufficient = commitOraclePlan({
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
  const committed = commitOraclePlan({ account, plan: automatic.plan });
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

console.log('PASS unified server Oracle tests');
