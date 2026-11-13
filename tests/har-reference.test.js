import assert from 'node:assert/strict';
import { GAME_DB } from '../scripts/data.js';
import * as Engine from '../scripts/engine.js';
import { importCommunitySnapshot } from '../scripts/local-planner.js';
import {
  API_OBSERVED_BLOOD_COSTS,
  API_OBSERVATION_META,
} from '../scripts/observed-costs.js';

assert.equal(API_OBSERVATION_META.successfulDominanceResponses, 78);
assert.equal(Object.keys(API_OBSERVED_BLOOD_COSTS).length, 32);
assert.equal(API_OBSERVATION_META.distinctBloodNextCostLevels, 32);
assert.equal(API_OBSERVATION_META.distinctBondNextCostLevels, 26);

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

// The server's next_cost belongs to target + 1, not the current stored level.
// Exact observations are sparse and branch-specific; missing steps stay estimates.
for (const [type, table] of Object.entries({
  default: { 1: 0, 2: 20, 6: 44, 7: 53, 9: 76, 11: 113, 13: 150 },
  one: { 1: 0, 2: 54, 3: 64, 11: 305 },
  two: { 2: 37, 6: 81, 7: 98 },
  all: { 1: 0, 2: 28, 4: 42 },
})) {
  for (const [level, cost] of Object.entries(table)) {
    assert.equal(Engine.calcBondLevelCost(Number(level), type), cost, `flat ${type} level ${level}`);
    assert.equal(Engine.getBondCostSource('flat', Number(level), type), 'api-observed');
  }
}
for (const [type, table] of Object.entries({
  default: { 1: 20, 3: 24, 34: 1037 },
  one: { 1: 54, 3: 64 },
  two: { 1: 37, 7: 98, 8: 118 },
  all: { 1: 28 },
})) {
  for (const [level, cost] of Object.entries(table)) {
    assert.equal(Engine.calcBondPercentCost(Number(level), type), cost, `percent ${type} level ${level}`);
    assert.equal(Engine.getBondCostSource('percent', Number(level), type), 'api-observed');
  }
}
assert.equal(Engine.getBondCostSource('flat', 1, 'two'), 'estimated', 'unobserved two-flat first step remains estimated');
assert.equal(Engine.getBondCostSource('percent', 2, 'default'), 'estimated');
assert.equal(Engine.getBondCostSource('flat', 10, 'one'), 'estimated');

// End-to-end bond report uses the observed, branch-specific costs.
{
  const lover = GAME_DB.lovers.find(item => item.id === 20170);
  assert.ok(lover);
  const result = Engine.calcLoverBonds(
    lover,
    1000,
    { strength: { level: 0, targetLevel: 1, percentLevel: 0, targetPercentLevel: 1 } },
    { strength: 1000, allure: 1000, intellect: 1000, spirit: 1000 },
    200
  );
  const strength = result.details.find(item => item.attribute === 'strength');
  assert.equal(strength.costFlat, 0);
  assert.equal(strength.costPct, 20);
  assert.equal(result.spentAffinity, 20);
}

// An observed point is exact only at the observed step. No interpolation.
assert.equal(Engine.calcBondLevelCost(8, 'one'), Math.round(50 + Math.pow(8, 1.85) * 4.5));
assert.ok(GAME_DB.wardens.length > 0);


// Exact gain observations are imported only with their Warden-level context.
{
  const account = {
    blood: 0,
    conclaveExp: 0,
    courtyardExp: 0,
    courtyardLvl: 0,
    conclave: { strength: 0, allure: 0, intellect: 0, spirit: 0 },
    ownedWardens: {
      10170: { level: 150, promoteId: 3, exp: 0, talents: {}, auras: {} },
    },
    ownedLovers: {
      20170: { affinity: 1000, closeness: 200, sex: 'female', bonds: {}, presences: {} },
    },
    bag: {},
  };
  const imported = importCommunitySnapshot({
    account,
    snapshot: {
      levels: {
        wardens: [{ warden_id: 10170, level: 150, target: 150 }],
      },
      bonds: {
        lovers: [{
          lover_id: 20170,
          warden_id: 10170,
          trust: 1000,
          bonds: [{
            attribute: 'strength',
            level: {
              level: 0, target: 1, cost: 0, gain: '123',
              next_cost: 20, next_gain: '40', max_target: 5,
            },
            percent: {
              level: 0, target: 0, cost: 0, gain: '0',
              next_cost: 20, next_gain: '10', max_target: 10,
            },
          }],
        }],
      },
    },
  });
  const observations = imported.account.communityImport.referenceObservations.bondSteps;
  const exact = observations.find(row =>
    row.loverId === 20170 && row.attribute === 'strength' && row.kind === 'flat'
  );
  assert.ok(exact, 'importer preserves exact flat bond response');
  assert.deepEqual(
    [exact.level, exact.target, exact.cost, Number(exact.gain), exact.nextCost, Number(exact.nextGain), exact.wardenLevel],
    [0, 1, 0, 123, 20, 40, 150]
  );

  const lover = GAME_DB.lovers.find(item => item.id === 20170);
  const plan = {
    strength: { level: 0, targetLevel: 1, percentLevel: 0, targetPercentLevel: 0 },
  };
  const result = Engine.calcLoverBonds(
    lover, 1000, plan,
    { strength: 1000, allure: 1000, intellect: 1000, spirit: 1000 },
    200, observations, 150
  );
  const strength = result.details.find(row => row.attribute === 'strength');
  assert.equal(strength.exactFlat, true);
  assert.equal(strength.costFlat, 0);
  assert.equal(strength.flatGain, 123);
  assert.equal(result.totalGain, 123, 'matching API gain overrides the generic flat-gain estimate');

  assert.equal(
    Engine.findObservedBondStep(observations, lover, 'strength', 'flat', 0, 1, 151),
    null,
    'an observation for another Warden level must not be reused'
  );
  const conflicting = [...observations, { ...exact, cost: 1, gain: '124' }];
  assert.equal(
    Engine.findObservedBondStep(conflicting, lover, 'strength', 'flat', 0, 1, 150),
    null,
    'conflicting observations must fail closed'
  );
}

console.log('HAR-observed calculation regression tests passed.');
