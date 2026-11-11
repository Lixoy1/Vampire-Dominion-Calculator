import assert from 'node:assert/strict';
import { GAME_DB } from '../js/data.js';
import {
  ORACLE_VERSION,
  calculateOracle,
  autoDistributeAll,
  autoDistributeConclave,
  commitOraclePlan,
  summonWarden,
  getOracleCapabilities,
} from '../oracle.js';

const warden = GAME_DB.wardens[0];
const lover = GAME_DB.lovers.find(item => item.warden_id === warden.id);
assert.ok(warden, 'reference warden exists');
assert.ok(lover, 'reference lover exists for selected warden');

function makeAccount() {
  return {
    blood: 0,
    conclaveExp: 0,
    courtyardExp: 0,
    courtyardLvl: 10,
    conclave: { strength: 10, allure: 10, intellect: 10, spirit: 10 },
    ownedWardens: {
      [warden.id]: { level: 10, promoteId: 1, exp: 800, talents: {}, auras: {} },
    },
    ownedLovers: {
      [lover.id]: { affinity: 10000, closeness: 200, sex: 'female', presences: {}, bonds: {} },
    },
    skins: {},
    bag: {},
  };
}

function makePlan() {
  return {
    conclave: { strength: 10, allure: 10, intellect: 10, spirit: 10 },
    courtyardToLvl: 10,
    levels: {},
    promotes: {},
    bonds: {},
    skins: {},
    summons: { wardens: [], lovers: [] },
  };
}

function walkNumbers(value, path = 'root') {
  if (typeof value === 'number') {
    assert.ok(Number.isFinite(value), `finite number at ${path}`);
    return;
  }
  if (Array.isArray(value)) return value.forEach((child, index) => walkNumbers(child, `${path}[${index}]`));
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) walkNumbers(child, `${path}.${key}`);
  }
}

{
  const account = makeAccount();
  const original = structuredClone(account);
  const snapshot = calculateOracle({ account, plan: makePlan() });

  assert.equal(snapshot.meta.oracleVersion, ORACLE_VERSION);
  assert.equal(snapshot.meta.inputSource, 'player-entered');
  assert.equal(snapshot.meta.gameConnected, false);
  assert.equal(snapshot.meta.stateless, true);
  assert.ok(snapshot.report);
  assert.ok(snapshot.conclaveBranches.strength);
  assert.ok(snapshot.courtyardUpgrade);
  assert.ok(snapshot.wardens[warden.id]);
  assert.ok(snapshot.wardens[warden.id].levelUpgrade);
  assert.ok(snapshot.lovers[lover.id]);
  assert.ok(snapshot.lovers[lover.id].bondResult);
  assert.ok(snapshot.summonCandidates);
  assert.deepEqual(account, original, 'calculation does not mutate player input');
  walkNumbers(snapshot);

  const capabilities = getOracleCapabilities();
  assert.equal(capabilities.gameApiConnected, false);
  assert.ok(capabilities.sections.includes('dominance'));
  assert.ok(capabilities.sections.includes('inventory'));
}

{
  const account = makeAccount();
  const plan = makePlan();
  const candidate = GAME_DB.wardens.find(item => item.id !== warden.id);
  assert.ok(candidate);
  plan.summons.wardens = [candidate.id];

  const snapshot = calculateOracle({ account, plan });
  assert.ok(snapshot.report.gain.summon > 0);
  assert.equal(
    snapshot.report.gain.totalWithSummonEstimate,
    snapshot.report.gain.total + snapshot.report.gain.summon,
    'estimated summon value is displayed separately from the exact total'
  );
  assert.ok(snapshot.warnings.some(item => item.code === 'ESTIMATED_SUMMON_GAIN'));
}

{
  const account = makeAccount();
  const plan = makePlan();
  plan.levels[warden.id] = 11;

  const snapshot = calculateOracle({ account, plan });
  assert.ok(snapshot.report.spent.blood > 0);
  assert.ok(snapshot.warnings.some(item => item.code === 'APPROXIMATE_BLOOD_COST'));

  const blocked = commitOraclePlan({ account, plan });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.error.code, 'INSUFFICIENT_BLOOD');
}

{
  const account = makeAccount();
  const plan = makePlan();
  const auto = autoDistributeAll({ account, plan });
  assert.ok(auto.plan);
  assert.ok(auto.plan.conclave);
  assert.ok(auto.plan.levels);

  const conclave = autoDistributeConclave({ account, plan });
  assert.ok(conclave.levels);
  for (const attribute of ['strength', 'allure', 'intellect', 'spirit']) {
    assert.ok(conclave.levels[attribute] >= account.conclave[attribute]);
  }
}

{
  const account = makeAccount();
  const committed = commitOraclePlan({ account, plan: makePlan() });
  assert.equal(committed.ok, true);
  assert.ok(committed.account);
  assert.equal(account.blood, 0, 'atomic commit does not mutate the submitted object');
}

{
  const account = {
    blood: 0,
    conclaveExp: 0,
    courtyardExp: 0,
    courtyardLvl: 0,
    conclave: {},
    ownedWardens: {},
    ownedLovers: {},
    bag: {},
  };
  const summoned = summonWarden({ account, wardenId: warden.id });
  assert.equal(summoned.ok, true);
  assert.ok(summoned.account.ownedWardens[warden.id]);
  assert.deepEqual(account.ownedWardens, {}, 'summon does not mutate submitted profile');

  const duplicate = summonWarden({ account: summoned.account, wardenId: warden.id });
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.error.code, 'WARDEN_ALREADY_OWNED');
}

console.log('PASS unified server Oracle tests');
