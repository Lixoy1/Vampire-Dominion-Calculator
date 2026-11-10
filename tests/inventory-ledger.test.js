import assert from 'node:assert/strict';
import { createInventoryLedger } from '../js/inventory-ledger.js';

const ledger = createInventoryLedger({ 100: 5, 200: 1, 300: 0 });
assert.equal(ledger.getCount(100), 5);
assert.equal(ledger.getCount(200), 1);
assert.equal(ledger.getCount(999), 0);

const failedBatch = ledger.reserveMany([
  { itemId: 100, amount: 3, reason: 'breakthrough A' },
  { itemId: '100', amount: 3, reason: 'breakthrough B' },
  { itemId: 200, amount: 2, reason: 'summon' },
]);
assert.equal(failedBatch.ok, false);
assert.equal(failedBatch.failures.length, 2);
assert.equal(ledger.getCount(100), 5, 'failed batch must not partially deduct item 100');
assert.equal(ledger.getCount(200), 1, 'failed batch must not deduct item 200');
assert.equal(ledger.getReservations().length, 0);

const goodBatch = ledger.reserveMany([
  { itemId: 100, amount: 2, reason: 'breakthrough A' },
  { itemId: '100', amount: 2, reason: 'breakthrough B' },
  { itemId: 200, amount: 1, reason: 'summon' },
]);
assert.equal(goodBatch.ok, true);
assert.equal(ledger.getCount(100), 1);
assert.equal(ledger.getCount(200), 0);
assert.equal(ledger.getReservations().length, 3);

const failedSingle = ledger.reserve(100, 2, 'another plan step');
assert.equal(failedSingle.ok, false);
assert.equal(ledger.getCount(100), 1);

const snapshot = ledger.getRemaining();
snapshot[100] = 999;
assert.equal(ledger.getCount(100), 1, 'returned inventory snapshots must not mutate the ledger');
assert.throws(() => ledger.reserve(100, -1), RangeError);
assert.throws(() => ledger.reserve(100, Number.NaN), RangeError);

const emptyReserve = ledger.reserve(300, 0, 'no-cost action');
assert.equal(emptyReserve.ok, true);
assert.equal(ledger.getCount(300), 0);

console.log('PASS shared inventory ledger reservation safety');
