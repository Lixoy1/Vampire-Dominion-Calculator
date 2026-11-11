import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const port = 18_000 + Math.floor(Math.random() * 10_000);
const baseUrl = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['server.js'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(port),
    BOT_TOKEN: '',
    APP_URL: '',
  },
  stdio: 'ignore',
});

async function waitForServer() {
  const deadline = Date.now() + 10_000;
  let lastError = null;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Server exited before becoming ready (code ${child.exitCode}).`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await delay(150);
  }
  throw new Error(`Server readiness timeout: ${lastError?.message || 'no response'}`);
}

async function post(path, body) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

try {
  await waitForServer();

  const healthResponse = await fetch(`${baseUrl}/api/health`);
  assert.equal(healthResponse.status, 200);
  const health = await healthResponse.json();
  assert.equal(health.ok, true);
  assert.equal(health.oracle.gameApiConnected, false);
  assert.equal(health.oracle.inputMode, 'manual-player-entry');

  const metaResponse = await fetch(`${baseUrl}/api/oracle/meta`);
  assert.equal(metaResponse.status, 200);
  const meta = await metaResponse.json();
  assert.equal(meta.ok, true);
  assert.equal(meta.result.stateless, true);

  const calculateResponse = await post('/api/oracle/calculate', {
    account: {
      blood: 123456,
      conclaveExp: 0,
      courtyardExp: 0,
      courtyardLvl: 0,
      conclave: {},
      ownedWardens: {},
      ownedLovers: {},
      bag: {},
      skins: {},
    },
    plan: {},
  });
  assert.equal(calculateResponse.status, 200);
  const calculated = await calculateResponse.json();
  assert.equal(calculated.ok, true);
  assert.equal(calculated.result.meta.gameConnected, false);
  assert.equal(calculated.result.meta.inputSource, 'player-entered');
  assert.ok(calculated.result.report);
  assert.ok(calculated.result.inventory);
  assert.ok(calculated.result.skins);

  const invalidResponse = await post('/api/oracle/calculate', { plan: {} });
  assert.equal(invalidResponse.status, 400);
  const invalid = await invalidResponse.json();
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error.code, 'INVALID_INPUT');

  console.log('PASS Oracle HTTP API tests');
} finally {
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGTERM');
    await Promise.race([
      new Promise(resolve => child.once('exit', resolve)),
      delay(2_000),
    ]);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
}
