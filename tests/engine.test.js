import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAME_DB, getIconUrl } from '../js/data.js';
import * as E from '../js/engine.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (error) { console.error(`FAIL ${name}\n`, error); process.exitCode = 1; }
}

const expectedCounts = {
  wardens: 68, lovers: 45, items: 237, warden_promotes: 8,
  conclave_levels: 180, courtyard_levels: 210, lover_presence_levels: 155,
};

test('database tables have expected cardinality', () => {
  for (const [key, count] of Object.entries(expectedCounts)) assert.equal(GAME_DB[key]?.length, count, key);
});

test('primary entity IDs are unique', () => {
  for (const key of ['wardens', 'lovers', 'items', 'conclave_levels', 'courtyard_levels']) {
    const ids = GAME_DB[key].map(x => x.id);
    assert.equal(new Set(ids).size, ids.length, key);
  }
});

test('favicon exists locally', () => {
  assert.ok(existsSync(join(root, 'assets', 'crest.svg')));
});

test('496 referenced images exist locally and are WebP', () => {
  const paths = new Set();
  const walk = value => {
    if (Array.isArray(value)) return value.forEach(walk);
    if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        if (key.startsWith('icon_path') && typeof child === 'string') paths.add(child);
        else walk(child);
      }
    }
  };
  walk(GAME_DB);
  assert.equal(paths.size, 496);
  for (const rel of paths) {
    const file = join(root, 'assets', 'icons', rel);
    assert.ok(existsSync(file), `missing ${rel}`);
    const buf = readFileSync(file);
    assert.equal(buf.toString('ascii', 0, 4), 'RIFF', `${rel} RIFF`);
    assert.equal(buf.toString('ascii', 8, 12), 'WEBP', `${rel} WEBP`);
  }
  assert.equal(getIconUrl('wardens/10010.ffef7b42.webp'), './assets/icons/wardens/10010.ffef7b42.webp');
});

test('Conclave spends the destination-level costs', () => {
  const from = 10, to = 14;
  const result = E.calcConclaveBranch(GAME_DB.conclave_levels, from, to, 2);
  const expected = GAME_DB.conclave_levels.filter(row => row.id > from && row.id <= to).reduce((sum, row) => sum + row.cost, 0);
  assert.equal(result.spent, expected);
  assert.equal(result.directAttributeGain, result.flatBonusDelta * 2);
});

test('Conclave auto-distribution stays within available points', () => {
  const levels = { strength: 10, allure: 10, intellect: 10, spirit: 10 };
  const budget = 25000;
  const result = E.autoDistributeConclave(GAME_DB.conclave_levels, levels, budget, { strength: 2, allure: 1, intellect: 1, spirit: 1 });
  assert.ok(result.spent >= 0 && result.spent <= budget);
  assert.ok(result.left >= 0);
  for (const attr of E.ATTRIBUTES) assert.ok(result.levels[attr] >= levels[attr] && result.levels[attr] <= 180);
});

test('Courtyard budget calculation is bounded', () => {
  const result = E.calcMaxCourtyardLevel(GAME_DB.courtyard_levels, 10, 250);
  assert.ok(result.toLvl >= 10 && result.toLvl <= 210);
  assert.ok(result.spent <= 250);
});

test('talent DP is integer and within exp/cap bounds', () => {
  const warden = GAME_DB.wardens[0];
  const value = E.calcAchievableExpTalentPoints(warden, 40, 8000);
  assert.ok(Number.isInteger(value));
  assert.ok(value >= 0 && value <= 8000 / E.EXP_PER_TALENT_POINT);
  assert.equal(E.calcWardenBaseTalentStars(warden), warden.talents.reduce((sum, t) => sum + t.stars, 0));
});

test('Closeness unlocks bond branches; Affinity pays their cost', () => {
  const lover = GAME_DB.lovers[0];
  const states = Object.fromEntries(lover.scarlet_bonds.map(b => [b.attribute, { level: 0, targetLevel: 2, percentLevel: 0, targetPercentLevel: 2 }]));
  const locked = E.calcLoverBonds(lover, 100000, states, { strength: 1000, allure: 1000, intellect: 1000, spirit: 1000 }, 0);
  assert.equal(locked.spentAffinity, 0);
  assert.equal(locked.totalGain, 0);
  const open = E.calcLoverBonds(lover, 100000, states, { strength: 1000, allure: 1000, intellect: 1000, spirit: 1000 }, 200);
  assert.ok(open.spentAffinity > 0);
  assert.ok(open.totalGain > 0);
  assert.ok(open.leftAffinity < 100000);
});

test('summon requires confirmed availability and a real item requirement', () => {
  const sampleWardens = [
    { id: 1, name: 'UNKNOWN_FREE', summon_item_id: null, summon_item_count: null, talents: [{ stars: 4 }] },
    { id: 2, name: 'PAID', summon_item_id: 77, summon_item_count: 5, summon_gain: '1234', talents: [{ stars: 3 }] },
    { id: 3, name: 'EXPLICITLY_FREE', summon_item_id: null, summon_item_count: 0, summon_possible: true, talents: [{ stars: 2 }] },
    { id: 4, name: 'SERVER_LOCKED', summon_item_id: 77, summon_item_count: 5, summon_possible: false, talents: [{ stars: 4 }] },
  ];
  const sampleLovers = [
    { id: 20, name: 'UNKNOWN_LOVER', warden_id: 1, summon_item_id: null, summon_item_count: null },
  ];
  const result = E.getSummonCandidates(
    sampleWardens, sampleLovers, new Set(), new Set(), { 77: 5 }
  );
  assert.equal(result.wardens.find(x => x.id === 1).canSummon, false);
  assert.equal(result.wardens.find(x => x.id === 1).availabilityReason, 'unknown_requirement');
  assert.equal(result.wardens.find(x => x.id === 2).canSummon, true);
  assert.equal(result.wardens.find(x => x.id === 2).estimatedBaseGain, 1234);
  assert.equal(result.wardens.find(x => x.id === 3).canSummon, true);
  assert.equal(result.wardens.find(x => x.id === 3).estimatedBaseGain, null);
  assert.equal(result.wardens.find(x => x.id === 4).canSummon, false, 'explicit server denial overrides available item count');
  assert.equal(result.wardens.find(x => x.id === 4).availabilityReason, 'not_available');
  assert.equal(result.lovers.find(x => x.id === 20).canSummon, false);
});

test('bag intimacy calculation returns min/expected/max', () => {
  const result = E.calcBagPoints({ 4230: 2 }, [4230]);
  assert.deepEqual([result.minimum, result.expected, result.maximum], [8, 20, 100]);
});

test('guild donations respect the event-day limit', () => {
  const result = E.calcGuildExp({ 4005: 2, 4002: 4 }, 3);
  assert.equal(result.expected, 2200);
  assert.equal(result.items.find(x => x.item_id === 4005)?.counted, 2);
  assert.equal(result.items.find(x => x.item_id === 4002)?.counted, 1);
});

test('unified dominance report returns finite totals and bond spend', () => {
  const w = GAME_DB.wardens[0];
  const l = GAME_DB.lovers.find(x => x.warden_id === w.id);
  const curves = E.buildPresenceCurvesMap(GAME_DB.lover_presence_levels);
  const db = {
    wardens: GAME_DB.wardens, lovers: GAME_DB.lovers, items: GAME_DB.items,
    promotes: GAME_DB.warden_promotes, conclaveLevels: GAME_DB.conclave_levels,
    courtyardLevels: GAME_DB.courtyard_levels, presenceCurvesMap: curves,
  };
  const account = {
    blood: 1000000, conclaveExp: 50000, courtyardExp: 300, courtyardLvl: 10,
    conclave: { strength: 10, allure: 10, intellect: 10, spirit: 10 },
    ownedWardens: { [w.id]: { level: 100, promoteId: 1, talents: {} } },
    ownedLovers: { [l.id]: { affinity: 20000, closeness: 200, bonds: {} } },
    bag: {},
  };
  const bondPlan = { wardenBaseAttrs: { strength: 500, allure: 500, intellect: 500, spirit: 500 } };
  for (const bond of l.scarlet_bonds) bondPlan[bond.attribute] = { level: 0, targetLevel: 1, percentLevel: 0, targetPercentLevel: 1 };
  const plan = {
    conclave: { strength: 11, allure: 10, intellect: 10, spirit: 10 }, courtyardToLvl: 11,
    levels: { [w.id]: 101 }, bonds: { [l.id]: bondPlan }, summons: { wardens: [], lovers: [] },
  };
  const report = E.calculateTotalDominanceReport({ db, account, plan });
  assert.ok(Number.isFinite(report.gain.total));
  assert.ok(Number.isFinite(report.spent.bondAffinity));
  assert.ok(report.spent.bondAffinity > 0);
  assert.ok(report.gain.total > 0);
  assert.equal(report.coverage.levels.status, 'approximate');
  assert.equal(report.coverage.talents.included, false);
  assert.equal(report.isComplete, false);
  assert.equal(report.canApply, false, 'plans using unverified blood and bond costs cannot be committed');
  assert.equal(Object.values(report.gain.byAttribute).reduce((sum, value) => sum + value, 0), report.gain.total);
});


test('report blocks imported plan categories that are not applied yet', () => {
  const curves = E.buildPresenceCurvesMap(GAME_DB.lover_presence_levels);
  const db = {
    wardens: GAME_DB.wardens,
    lovers: GAME_DB.lovers,
    items: GAME_DB.items,
    promotes: GAME_DB.warden_promotes,
    conclaveLevels: GAME_DB.conclave_levels,
    courtyardLevels: GAME_DB.courtyard_levels,
    presenceCurvesMap: curves,
  };
  const account = {
    blood: 0,
    conclaveExp: 0,
    courtyardExp: 0,
    courtyardLvl: 0,
    conclave: { strength: 0, allure: 0, intellect: 0, spirit: 0 },
    ownedWardens: {},
    ownedLovers: {},
    bag: {},
  };
  const basePlan = {
    conclave: { strength: 0, allure: 0, intellect: 0, spirit: 0 },
    courtyardToLvl: 0,
    levels: {},
    bonds: {},
    summons: { wardens: [], lovers: [] },
  };
  const report = E.calculateTotalDominanceReport({
    db,
    account,
    plan: { ...basePlan, skins: { 10544101: 1 }, talents: { 10540: { scripts: { 0: 1 } } } },
  });
  assert.equal(report.canApply, false);
  assert.ok(report.inventoryIssues.some(issue => issue.type === 'unsupported_plan_category' && issue.category === 'skins'));
  assert.ok(report.inventoryIssues.some(issue => issue.type === 'unsupported_plan_category' && issue.category === 'talents'));
  assert.ok(report.blockers.some(blocker => blocker.includes('talents, skins')));
});

test('level upgrade exposes per-attribute contributions and flags approximate blood cost', () => {
  const warden = GAME_DB.wardens[0];
  const result = E.calcWardenLevelsUpgrade(warden, 1, 2, 1, GAME_DB.warden_promotes, {}, {});
  assert.equal(result.bloodCostIsApproximate, true);
  assert.equal(Object.values(result.gainByAttribute).reduce((sum, value) => sum + value, 0), result.baseGain);
  assert.ok(Object.keys(result.gainByAttribute).every(key => E.ATTRIBUTES.includes(key)));
});

test('promotion checks expose required breakthrough items without mutating inventory', () => {
  const warden = GAME_DB.wardens[0];
  const promote = GAME_DB.warden_promotes.find(p => p.id === 2);
  const emptyBag = {};
  const blocked = E.calcWardenLevelsUpgrade(warden, 100, 101, 1, GAME_DB.warden_promotes, emptyBag, {});
  assert.equal(blocked.canPromote, false);
  assert.equal(blocked.neededPromotes.some(p => p.id === 2), true);
  assert.ok(blocked.missingItems.length > 0);
  assert.deepEqual(emptyBag, {}, 'the calculation must not consume source inventory');
  const prepared = Object.fromEntries(promote.item_ids.map(id => [id, promote.price]));
  const allowed = E.calcWardenLevelsUpgrade(warden, 100, 101, 1, GAME_DB.warden_promotes, prepared, {});
  assert.equal(allowed.canPromote, true);
});

test('skin optimizer respects fabric budget and ownership eligibility', () => {
  const group = {
    quality: 'a', count: 100,
    skins: [
      { skin_id: 1, owner: 'warden', owned: true, quality: 'a', level: 1, max_level: 10, max_target: 10, cards: 0, purchasable: true, next_gain: 100 },
      { skin_id: 2, owner: 'warden', owned: false, quality: 'a', level: 0, max_level: 10, max_target: 10, cards: 0, purchasable: false, next_gain: 999 },
    ],
  };
  const result = E.autoDistributeSkins(group, {});
  assert.ok((result[1] || 1) <= 3, '100 fabric buys at most two additional A levels');
  assert.equal(result[2], undefined, 'unowned unavailable skin must not be raised');
});

test('breakthrough reservation accumulates repeated item costs across tiers', () => {
  const warden = GAME_DB.wardens[0];
  const syntheticPromotes = [
    { id: 1, min_warden_lvl: 1, price: 0, item_ids: [], max_talent_lvl: 40 },
    { id: 2, min_warden_lvl: 10, price: 1, item_ids: [990001] },
    { id: 3, min_warden_lvl: 50, price: 1, item_ids: [990001] },
  ];
  const oneSeal = { 990001: 1 };
  const result = E.calcWardenLevelsUpgrade(
    warden, 1, 100, 1, syntheticPromotes, oneSeal, {}
  );
  assert.equal(result.canPromote, false);
  assert.deepEqual(result.missingItems, [{ promoteId: 3, itemId: 990001, need: 1 }]);
  assert.deepEqual(oneSeal, { 990001: 1 }, 'checks must not mutate inventory');
});

console.log(`\n${passed} test groups passed.`);