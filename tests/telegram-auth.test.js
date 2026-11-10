import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifyTelegramInitData } from '../js/telegram-auth.js';

const token = '123456789:TEST_TOKEN_FOR_UNIT_TESTS';
const now = 1_800_000_000;
const user = {
  id: 123456,
  first_name: 'Optimist',
  username: 'optimist_test',
  language_code: 'ru',
};

function sign(fields, botToken = token) {
  const params = new URLSearchParams(fields);
  const canonical = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secret).update(canonical).digest('hex');
  params.set('hash', hash);
  return params.toString();
}

const validInitData = sign([
  ['query_id', 'AAEAAAE'],
  ['user', JSON.stringify(user)],
  ['auth_date', String(now)],
]);

assert.deepEqual(
  verifyTelegramInitData(validInitData, token, { nowSeconds: now }),
  { id: 123456, first_name: 'Optimist', last_name: '', username: 'optimist_test', language_code: 'ru' }
);
assert.equal(verifyTelegramInitData(validInitData, '', { nowSeconds: now }), null);
assert.equal(verifyTelegramInitData(validInitData, 'wrong-token', { nowSeconds: now }), null);
assert.equal(verifyTelegramInitData(validInitData, token, { nowSeconds: now + 86401 }), null);
assert.equal(verifyTelegramInitData(validInitData, token, { nowSeconds: now - 61 }), null);
const futureInitData = sign([
  ['query_id', 'AAEAAAE'],
  ['user', JSON.stringify(user)],
  ['auth_date', String(now + 61)],
]);
assert.equal(verifyTelegramInitData(futureInitData, token, { nowSeconds: now }), null);
const allowedFutureInitData = sign([
  ['query_id', 'AAEAAAE'],
  ['user', JSON.stringify(user)],
  ['auth_date', String(now + 60)],
]);
assert.notEqual(verifyTelegramInitData(allowedFutureInitData, token, { nowSeconds: now }), null);

const tampered = new URLSearchParams(validInitData);
tampered.set('user', JSON.stringify({ ...user, id: 999 }));
assert.equal(verifyTelegramInitData(tampered.toString(), token, { nowSeconds: now }), null);

const duplicateKey = `${validInitData}&auth_date=${now}`;
assert.equal(verifyTelegramInitData(duplicateKey, token, { nowSeconds: now }), null);
assert.equal(verifyTelegramInitData('not a query string', token, { nowSeconds: now }), null);
assert.equal(verifyTelegramInitData('x'.repeat(32769), token, { nowSeconds: now }), null);

console.log('PASS Telegram Mini App initData authentication checks');
