import assert from 'node:assert/strict';
import { buildOraclePlan, normalizeOracleSnapshot } from '../js/oracle-engine.js';

const response = {
  total: '4651439.0000000000',
  attributes: [
    { attribute: 'strength', total: '1039868.0000000000' },
    { attribute: 'allure', total: '1248160.0000000000' },
  ],
  gain: {
    total: '1767017.0000000000',
    attributes: [{ attribute: 'strength', total: '1767017.0000000000' }],
  },
  levels: {
    blood: 100,
    spent: 0,
    left: 100,
    wardens: [
      { warden_id: 10170, level: 1, target: 1, next_cost: 5, next_gain: '30', max_target: 100, next_missing: [] },
      { warden_id: 10540, level: 5, target: 5, next_cost: 10, next_gain: '100', max_target: 100, next_missing: [] },
      { warden_id: 10660, level: 5, target: 5, next_cost: 1, next_gain: '999', max_target: 100, next_missing: [{ item_id: 9001, need: 1 }] },
      { warden_id: 10670, level: 100, target: 100, next_cost: 1, next_gain: '999', max_target: 100, next_missing: [] },
    ],
    best_path: { runs: [{ key: '10660', to: 41 }, { key: '10540', to: 6 }, { key: '10170', to: 2 }], end: null },
  },
  conclave: {
    points: 0, spent: 0, left: 0,
    attributes: [{ attribute: 'strength', level: 2, target: 2, next_cost: 1, next_gain: '500', max_target: 180 }],
    best_path: { runs: [], end: 'strength' },
  },
  bonds: {
    trust: 10, spent: 0, left: 10,
    lovers: [{
      lover_id: 20540, warden_id: 10540,
      best_path: { runs: [{ key: 'strength', to: 2 }], end: null },
      bonds: [
        { attribute: 'strength', level: { level: 0, target: 0, next_cost: 0, next_gain: '25', max_target: 1 }, percent: { level: 0, target: 0, next_cost: 20, next_gain: '0', max_target: 0 } },
        { attribute: 'allure', level: { level: 0, target: 0, next_cost: 2, next_gain: '10', max_target: 10 }, percent: { level: 0, target: 0, next_cost: 1, next_gain: '0', max_target: 0 } },
      ],
    }],
  },
};

const original = JSON.stringify(response);
const snapshot = normalizeOracleSnapshot(JSON.stringify({ data: response }));
assert.equal(snapshot.total, response.total);

const plan = buildOraclePlan(snapshot, {
  wardens: { '10170': 'Лоренцо', '10540': 'Джон' },
  lovers: { '20540': 'Майкл' },
});

assert.equal(plan.metrics.total, 4651439);
assert.equal(plan.metrics.gain, 1767017);
assert.equal(plan.metrics.attributes[0].attribute, 'strength');
assert.equal(plan.routeCount, 4);
assert.deepEqual(plan.paths.slice(0, 3).map(item => [item.key, item.target]), [
  ['10660', 41], ['10540', 6], ['10170', 2],
]);
assert.equal(plan.paths[3].section, 'bonds');
assert.equal(plan.recommendations.blood.length, 2, 'missing-item and maxed wardens are excluded');
assert.equal(plan.recommendations.blood[0].label, 'Джон', 'best efficiency is ranked first inside blood');
assert.equal(plan.recommendations.blood[0].efficiency, 10);
assert.equal(plan.recommendations.blood[1].efficiency, 6);
assert.equal(plan.recommendations.conclave, undefined, 'zero conclave balance cannot fund the next step');
assert.equal(plan.recommendations.trust.length, 2);
assert.equal(plan.recommendations.trust[0].free, true, 'zero-cost server step is preserved');
assert.equal(plan.recommendations.trust[1].cost, 2);
assert.deepEqual(JSON.stringify(response), original, 'Oracle never mutates the server response');

assert.throws(() => normalizeOracleSnapshot('{bad json'), /Некорректный JSON/);
assert.throws(() => normalizeOracleSnapshot({ unrelated: true }), /Не найдены разделы API/);

console.log('PASS Oracle API adapter, authoritative best_path, exact next_cost/next_gain ranking, resource isolation and immutability');
