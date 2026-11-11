import assert from 'node:assert/strict';
import { GAME_DB } from '../js/data.js';
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


  const sampleLover = GAME_DB.lovers[0];
  const loverAccount = {
    blood: 0, conclaveExp: 0, courtyardExp: 0, courtyardLvl: 0,
    conclave: {}, ownedWardens: {}, ownedLovers: {}, bag: {}, skins: {},
  };
  if (sampleLover.summon_item_id && sampleLover.summon_item_count > 0) {
    loverAccount.bag[sampleLover.summon_item_id] = sampleLover.summon_item_count;
  }
  const loverSummonResponse = await post('/api/oracle/summon-lover', {
    account: loverAccount,
    loverId: sampleLover.id,
  });
  assert.equal(loverSummonResponse.status, 200);
  const loverSummon = await loverSummonResponse.json();
  assert.equal(loverSummon.ok, true);
  assert.ok(loverSummon.result.account.ownedLovers[sampleLover.id]);

  const helperImportResponse = await post('/api/oracle/import-helper', {
    account: {
      blood: 0, conclaveExp: 0, courtyardExp: 0, courtyardLvl: 0,
      conclave: {}, ownedWardens: {}, ownedLovers: {}, bag: {}, skins: {},
    },
    snapshots: [
      [{ template_id: 10270, talent_exp: 0, level: 450, promote_id: 8, filled: true, dominance: '6701429.0000000000' }],
      [{ template_id: 2603, level: 0, percent_level: 0 }, { template_id: 2601, level: 0, percent_level: 0 }],
      [{ kind: 'warden', owner_id: 10270, template_id: 10273101, level: 8 }],
      { exp: 6800, level: 11, next_level_exp: 7000 },
    ],
  });
  assert.equal(helperImportResponse.status, 200);
  const helperImport = await helperImportResponse.json();
  assert.equal(helperImport.ok, true);
  assert.equal(helperImport.result.account.ownedWardens[10270].level, 450);
  assert.equal(helperImport.result.account.ownedLovers[20260].bonds.strength.level, 0);
  assert.equal(helperImport.result.account.skins[10273101], 8);
  assert.deepEqual(helperImport.result.account.guildProgress, { exp: 6800, level: 11, nextLevelExp: 7000 });
  assert.equal(helperImport.result.account.helperImport.observedWardenDominance[10270], '6701429.0000000000');

  const talentWarden = GAME_DB.wardens.find(item => item.talents?.length);
  const talentAccount = {
    blood: 0, conclaveExp: 0, courtyardExp: 0, courtyardLvl: 0,
    conclave: {}, ownedWardens: {
      [talentWarden.id]: { level: 10, promoteId: 1, exp: 0, talents: {}, auras: {} },
    },
    ownedLovers: {}, bag: {}, skins: {},
  };
  for (const talent of talentWarden.talents) {
    talentAccount.bag[talent.scroll_item_id] = 500;
    talentAccount.bag[talent.script_item_id] = 500;
  }
  const autoTalentsResponse = await post('/api/oracle/auto-talents', {
    account: talentAccount,
    plan: {},
  });
  assert.equal(autoTalentsResponse.status, 200);
  const autoTalents = await autoTalentsResponse.json();
  assert.equal(autoTalents.ok, true);
  assert.ok(autoTalents.result.summary.plannedLevels > 0);
  assert.ok(autoTalents.result.plan.talents[talentWarden.id]);

  const expWardenApi = GAME_DB.wardens.find(item =>
    item.talents?.some(t => t.stars === 1) && item.talents?.some(t => t.stars === 2)
  );
  const expOnlyResponse = await post('/api/oracle/auto-talents', {
    account: {
      blood: 0, conclaveExp: 0, courtyardExp: 0, courtyardLvl: 0,
      conclave: {}, ownedWardens: {
        [expWardenApi.id]: { level: 20, promoteId: 1, exp: 600, talents: {}, auras: {} },
      },
      ownedLovers: {}, bag: {}, skins: {},
    },
    plan: {},
  });
  assert.equal(expOnlyResponse.status, 200);
  const expOnly = await expOnlyResponse.json();
  assert.equal(expOnly.ok, true);
  assert.equal(expOnly.result.summary.expSpentTotal, 600);
  assert.ok(expOnly.result.plan.talents[expWardenApi.id].exp_levels);

  const talentCalculateResponse = await post('/api/oracle/calculate', {
    account: talentAccount,
    plan: autoTalents.result.plan,
  });
  assert.equal(talentCalculateResponse.status, 200);
  const talentCalculated = await talentCalculateResponse.json();
  assert.ok(talentCalculated.result.report.gain.talents > 0);
  assert.equal(talentCalculated.result.talentPlan.plannedLevels, autoTalents.result.summary.plannedLevels);

  const talentCommitResponse = await post('/api/oracle/commit-plan', {
    account: talentAccount,
    plan: autoTalents.result.plan,
  });
  assert.equal(talentCommitResponse.status, 200);
  const talentCommitted = await talentCommitResponse.json();
  assert.equal(talentCommitted.ok, true);
  assert.ok(talentCommitted.result.account.ownedWardens[talentWarden.id].talents);


  const skin = GAME_DB.wardens.flatMap(item => item.skins || []).find(item => item.quality === 'a' && item.purchasable);
  const skinAccount = {
    blood: 0, conclaveExp: 0, courtyardExp: 0, courtyardLvl: 0,
    conclave: {}, ownedWardens: {}, ownedLovers: {}, bag: { 4421: 50 }, skins: {},
  };
  const skinCommitResponse = await post('/api/oracle/commit-plan', {
    account: skinAccount,
    plan: { conclave: {}, courtyardToLvl: 0, levels: {}, promotes: {}, bonds: {}, talents: {}, skins: { [skin.id]: 1 }, summons: { wardens: [], lovers: [] } },
  });
  assert.equal(skinCommitResponse.status, 200);
  const skinCommit = await skinCommitResponse.json();
  assert.equal(skinCommit.ok, true);
  assert.equal(skinCommit.result.account.skins[skin.id], 1);
  assert.equal(skinCommit.result.account.bag[4421], 0);
  assert.equal(skinCommit.result.account.skinStoreExp, skin.store_exp);


  const presenceLover = GAME_DB.lovers.find(item => (item.presences || []).some(p => p.presence_type === 'updatable'));
  const presence = presenceLover.presences.find(p => p.presence_type === 'updatable');
  const presenceAccount = {
    blood: 0, conclaveExp: 0, courtyardExp: 0, courtyardLvl: 0,
    conclave: {}, ownedWardens: {},
    ownedLovers: {
      [presenceLover.id]: { affinity: 0, closeness: 0, sex: 'female', presences: { [presence.id]: 0 }, bonds: {} },
    },
    bag: { [presence.upgrade_item_id]: 100 }, skins: {},
  };
  const autoPresenceResponse = await post('/api/oracle/auto-presences', {
    account: presenceAccount,
    plan: {},
  });
  assert.equal(autoPresenceResponse.status, 200);
  const autoPresence = await autoPresenceResponse.json();
  assert.equal(autoPresence.ok, true);
  assert.ok(autoPresence.result.summary.addedLevels > 0);
  assert.ok(autoPresence.result.plan.presences[presenceLover.id][presence.id] > 0);


  const bondLoverApi = GAME_DB.lovers.find(item => item.scarlet_bonds?.length);
  const bondAutoResponse = await post('/api/oracle/auto-bonds', {
    account: {
      blood: 0, conclaveExp: 0, courtyardExp: 0, courtyardLvl: 0,
      conclave: {}, ownedWardens: {},
      ownedLovers: {
        [bondLoverApi.id]: { affinity: 1000, closeness: 200, sex: 'female', presences: {}, bonds: {} },
      },
      bag: {}, skins: {},
    },
    plan: {},
  });
  assert.equal(bondAutoResponse.status, 200);
  const bondAuto = await bondAutoResponse.json();
  assert.equal(bondAuto.ok, true);
  assert.ok(bondAuto.result.summary.addedLevels > 0);

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
