import assert from 'node:assert/strict';
import { GAME_DB } from '../scripts/data.js';
import * as Engine from '../scripts/engine.js';
import {
  API_OBSERVED_BLOOD_COSTS,
  API_OBSERVATION_META,
} from '../scripts/observed-costs.js';

assert.equal(API_OBSERVATION_META.successfulDominanceResponses, 78);
assert.equal(Object.keys(API_OBSERVED_BLOOD_COSTS).length, 32);
assert.equal(API_OBSERVATION_META.distinctBloodNextCostLevels, 32);

// Server-returned Warden next_cost values take precedence over the old curve.
for (const [level, cost] of Object.entries({
  1: 115, 2: 269, 3: 461, 4: 691, 5: 961,
  11: 3382, 50: 89785, 51: 93374, 100: 434739,
  150: 2096083, 200: 8858383, 300: 126095128,
  400: 6884526660,
})) {
  assert.equal(Engine.calcBloodCostForLevel(Number(level)), cost, `Warden level ${level} cost`);
  assert.equal(Engine.getBloodCostSource(Number(level)), 'api-observed');
}

// Unknown levels are not interpolated or presented as API-confirmed.
assert.equal(Engine.getBloodCostSource(6), 'estimated');
assert.equal(
  Engine.calcBloodCostForLevel(6),
  Math.round(100 * Math.pow(1.065, 5)),
  'unobserved levels retain the explicitly estimated fallback'
);

// The level-up calculator sums the same observed step costs.
{
  const warden = GAME_DB.wardens[0];
  const result = Engine.calcWardenLevelsUpgrade(
    warden, 1, 3, 1, GAME_DB.warden_promotes, {}, {}
  );
  assert.equal(result.bloodSpent, 115 + 269);
  assert.deepEqual(result.bloodCostEvidence, {
    apiObservedSteps: 2,
    estimatedSteps: 0,
  });
}

// Flat bond level 1 is free in the captured API response. The following
// observed steps differ by branch type and must not share one generic curve.
assert.equal(Engine.calcBondLevelCost(1, 'default'), 0);
assert.equal(Engine.calcBondLevelCost(2, 'default'), 20);
assert.equal(Engine.calcBondLevelCost(2, 'one'), 54);
assert.equal(Engine.calcBondLevelCost(2, 'two'), 37);
assert.equal(Engine.calcBondLevelCost(2, 'all'), 28);
assert.equal(Engine.calcBondLevelCost(9, 'default'), 76);
assert.equal(Engine.calcBondLevelCost(3, 'one'), 64);
assert.equal(Engine.calcBondLevelCost(6, 'two'), 81);
assert.equal(Engine.calcBondLevelCost(4, 'all'), 42);

assert.equal(Engine.calcBondPercentCost(1, 'default'), 20);
assert.equal(Engine.calcBondPercentCost(2, 'default'), 20);
assert.equal(Engine.calcBondPercentCost(3, 'default'), 24);
assert.equal(Engine.calcBondPercentCost(1, 'one'), 54);
assert.equal(Engine.calcBondPercentCost(1, 'two'), 37);
assert.equal(Engine.calcBondPercentCost(1, 'all'), 28);
assert.equal(Engine.getBondCostSource('flat', 2, 'one'), 'api-observed');
assert.equal(Engine.getBondCostSource('flat', 8, 'one'), 'estimated');

// End-to-end bond report uses the observed, branch-specific costs.
{
  const lover = GAME_DB.lovers.find(item => item.id === 20170);
  assert.ok(lover);
  const result = Engine.calcLoverBonds(
    lover,
    1000,
    { strength: { level: 0, targetLevel: 1, percentLevel: 0, targetPercentLevel: 2 } },
    { strength: 1000, allure: 1000, intellect: 1000, spirit: 1000 },
    200
  );
  const strength = result.details.find(item => item.attribute === 'strength');
  assert.equal(strength.costFlat, 0);
  assert.equal(strength.costPct, 40);
  assert.equal(result.spentAffinity, 40);
}

// An observed point is exact only at the observed step. No interpolation.
assert.equal(Engine.calcBondLevelCost(8, 'one'), Math.round(50 + Math.pow(8, 1.85) * 4.5));
assert.ok(GAME_DB.wardens.length > 0);

console.log('HAR-observed calculation regression tests passed.');
