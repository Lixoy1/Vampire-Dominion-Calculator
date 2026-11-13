import assert from 'node:assert/strict';
import { GAME_DB, CALCULATION_REFERENCE } from '../scripts/data.js';
import * as Engine from '../scripts/engine.js';

const expectedCounts = {
  wardens: 68,
  lovers: 45,
  items: 240,
  warden_promotes: 8,
  conclave_levels: 180,
  courtyard_levels: 210,
};
for (const [key, expected] of Object.entries(expectedCounts)) {
  assert.equal(GAME_DB[key].length, expected, `HAR template count mismatch: ${key}`);
}

for (const id of [10464101, 20464101, 30464101]) {
  assert.ok(GAME_DB.items.some(item => item.id === id), `HAR template item missing: ${id}`);
}

assert.equal(GAME_DB.limits.levels.max_warden_lvl, 450);
assert.equal(GAME_DB.limits.levels.max_talent_lvl, 320);
assert.equal(GAME_DB.limits.levels.max_aura_lvl, 30);
assert.equal(GAME_DB.limits.levels.max_presence_lvl, 30);
assert.equal(GAME_DB.limits.levels.max_skin_lvl, 10);

// Exact aggregate costs returned by successful dominance calculation responses.
const bloodIntervals = [
  [1, 3, 384],
  [1, 7, 3765],
  [1, 10, 9799],
  [105, 150, 36056873],
];
for (const [from, to, expected] of bloodIntervals) {
  assert.equal(Engine.calcBloodCostForRange(from, to), expected, `blood interval ${from}->${to}`);
  assert.equal(Engine.getBloodCostConfidence(from, to), 'exact_api_interval');
}
assert.equal(Engine.getBloodCostConfidence(3, 7), 'approximation_only');

// API confirms the first flat bond level is free, the following step is 20,
// and the first percentage step costs 20. Later steps remain unverified.
assert.equal(Engine.calcBondLevelCost(1), 0);
assert.equal(Engine.calcBondLevelCost(2), 20);
const capturedSpiritBond = GAME_DB.lovers.find(x => x.id === 20170).scarlet_bonds.find(x => x.id === 1704);
assert.equal(Engine.calcBondLevelCost(2, capturedSpiritBond), 54);
assert.equal(Engine.calcBondPercentCost(1, capturedSpiritBond), 54);
const capturedLover = GAME_DB.lovers.find(x => x.id === 20170);
const firstBondLevels = Object.fromEntries(capturedLover.scarlet_bonds.map(bond => [bond.attribute, { level: 0, targetLevel: 1, percentLevel: 0, targetPercentLevel: 0 }]));
const bondResult = Engine.calcLoverBonds(capturedLover, 0, firstBondLevels, {}, 100);
assert.equal(bondResult.spentAffinity, 0);
assert.equal(bondResult.totalGain, 620);
const secondBondLevels = Object.fromEntries(capturedLover.scarlet_bonds.map(bond => [bond.attribute, { level: 0, targetLevel: 2, percentLevel: 0, targetPercentLevel: 0 }]));
const secondBondResult = Engine.calcLoverBonds(capturedLover, 1000, secondBondLevels, {}, 200);
assert.equal(secondBondResult.spentAffinity, 114);
assert.equal(secondBondResult.totalGain, 1302);
assert.ok(secondBondResult.details.every(row => row.flatGainConfidence === 'exact_api_observation'));
assert.equal(Engine.calcBondPercentCost(1), 20);

// The captured Conclave levels 5–8 expose the next destination-level costs.
for (const [from, to, expected] of [[5,6,6014],[6,7,6132],[7,8,6250],[8,9,6368]]) {
  assert.equal(Engine.calcConclaveBranch(GAME_DB.conclave_levels, from, to).spent, expected);
}

assert.equal(Engine.calcGuildExp({}, 3).expected, 0);

// The captured lover-points scenario: 2 bags of item 4232 yield 10 / 12 / 16.
const points = Engine.calcBagPoints({ 4232: 2 }, [4232]);
assert.deepEqual(
  { minimum: points.minimum, expected: points.expected, maximum: points.maximum },
  { minimum: 10, expected: 12, maximum: 16 },
);

assert.deepEqual(
  CALCULATION_REFERENCE.manuscript_chances.map(x => [x.stars, x.chance, x.protection, x.tries]),
  [[1,100,0,1],[2,50,3,2],[3,33.3,4,3],[4,25,6,4],[5,20,8,5],[6,16.6,10,6]],
);

// Exact dominance gains for the four Warden intervals explicitly present in the HAR.
for (const [wardenId, target, gain] of [[10270,3,50],[10280,7,641],[10300,10,2051],[10960,3,57]]) {
  const warden = GAME_DB.wardens.find(item => item.id === wardenId);
  const result = Engine.calcWardenLevelsUpgrade(warden, 1, target, 1, GAME_DB.warden_promotes, {}, {});
  assert.equal(result.observedApiGain, gain, `Warden ${wardenId} observed API gain`);
  assert.equal(result.observedApiGainScope, 'captured_account_state_only');
  assert.equal(result.baseGainConfidence, 'approximation_only');
}

console.log('HAR parity checks passed: templates, limits, exact intervals, bond entry costs, bag points, manuscripts.');
