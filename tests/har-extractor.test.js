import assert from 'node:assert/strict';
import { extractHarObservations, parseHarText } from '../scripts/extract-har-observations.js';

const response = {
  levels: {
    wardens: [
      {
        warden_id: 10260, level: 1, target: 50, promote: 1, promote_after: 1,
        cost: 894737, gain: '49549.0000', next_cost: 89785,
      },
      {
        warden_id: 10260, level: 50, target: 50, promote: 1, promote_after: 1,
        cost: 0, gain: '0.0000', next_cost: 89785,
      },
    ],
  },
};
const entry = {
  request: {
    method: 'POST',
    url: 'https://game.example/api/v1/accounts/998877/calculations/dominance',
    headers: [{ name: 'Authorization', value: 'Bearer do-not-export' }],
  },
  response: {
    status: 200,
    content: { mimeType: 'application/json', text: JSON.stringify(response) },
  },
};
const fixture = { log: { entries: [entry, structuredClone(entry)] } };

// Simulate a HAR exporter inserting a raw line break inside a long body string.
const wrapped = JSON.stringify(fixture).replace('"cost":894737', '"cost":894\n737');
const har = parseHarText(wrapped);
const result = extractHarObservations(har);

assert.equal(result.dominance_responses, 2);
assert.equal(result.blood_intervals.length, 1);
assert.deepEqual(
  {
    warden_id: result.blood_intervals[0].warden_id,
    from_level: result.blood_intervals[0].from_level,
    to_level: result.blood_intervals[0].to_level,
    cost: result.blood_intervals[0].cost,
    occurrences: result.blood_intervals[0].occurrences,
  },
  { warden_id: 10260, from_level: 1, to_level: 50, cost: 894737, occurrences: 2 },
);
assert.equal(result.next_level_cost_observations[0].level, 50);
assert.equal(result.next_level_cost_observations[0].cost, 89785);
assert.equal('gain' in result.blood_intervals[0], false);
assert.doesNotMatch(JSON.stringify(result), /998877|do-not-export/);
assert.equal(Object.hasOwn(result, 'headers'), false);
assert.equal(Object.hasOwn(result, 'cookies'), false);

console.log('HAR extractor tests passed: line-wrap repair, exact costs, and sensitive-data exclusion.');
