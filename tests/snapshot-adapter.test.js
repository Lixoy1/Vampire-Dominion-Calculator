import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeCalculationSnapshot, compareCalculationSnapshots, toFiniteNumber } from '../js/snapshot-adapter.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/server-calculation-snapshot.json', import.meta.url), 'utf8'));
const normalized = normalizeCalculationSnapshot(fixture);

assert.equal(normalized.total, 4651439);
assert.deepEqual(normalized.attributes, {
  strength: 1039868,
  allure: 1248160,
  intellect: 1101848,
  spirit: 1261563,
});
assert.equal(normalized.gain.total, 1767017);
assert.equal(normalized.gain.attributes.strength, 1767017);
assert.equal(normalized.gain.attributes.allure, 0);
assert.equal(normalized.sections.conclave.attributes[0].nextCost, 16588);
assert.equal(normalized.sections.conclave.attributes[0].nextGain, 1875);
assert.equal(normalized.sections.levels.wardens[0].id, 10170);
assert.equal(normalized.sections.levels.wardens[0].nextGain, 7);
assert.equal(normalized.sections.levels.wardens[0].offer, null);
assert.equal(normalized.sections.auras.items[0].entities[0].levels[0].nextGain, 28);
assert.equal(normalized.sections.auras.items[0].entities[0].summonCost, null);
assert.equal(normalized.sections.presences.items[0].entities[0].levels[0].nextCost, 100);
assert.equal(normalized.sections.skins.store.level, 3);
assert.equal(normalized.sections.talents.scripts[0].wardens[0].talents[0].nextGain, 52);
assert.equal(normalized.sections.bonds.idle.length, 3);
assert.equal(normalized.sections.books.raw.expected, '1766198.00');
assert.equal(normalized.raw, fixture, 'raw source object must remain available without mutation');
assert.equal(toFiniteNumber(null), null);
assert.equal(toFiniteNumber(''), null);
assert.equal(toFiniteNumber('not-a-number'), null);

const identicalLocal = {
  total: normalized.total,
  attributes: normalized.attributes,
  gain: normalized.gain,
};
assert.equal(compareCalculationSnapshots(identicalLocal, normalized).matches, true);

const mismatchedLocal = {
  ...identicalLocal,
  attributes: { ...identicalLocal.attributes, strength: identicalLocal.attributes.strength + 1 },
};
const comparison = compareCalculationSnapshots(mismatchedLocal, normalized);
assert.equal(comparison.matches, false);
assert.equal(comparison.attributes.strength.delta, 1);
assert.equal(comparison.attributes.strength.matches, false);

console.log('PASS server snapshot adapter fixture parity');
