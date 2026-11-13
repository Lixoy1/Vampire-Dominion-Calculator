import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  createDefaultQuickSettings,
  normalizeQuickSettings,
  serializeQuickSettings,
  mapQuickResultToPlan,
  summarizeQuickSettings,
} from '../scripts/quick-settings.js';
import { autoDistributeQuick } from '../scripts/local-planner.js';
import { GAME_DB } from '../scripts/data.js';

const fixturePath = fileURLToPath(new URL('./fixtures/quick-calculation-har.json', import.meta.url));
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));

const defaults = createDefaultQuickSettings();
assert.equal(defaults.goal, 'all');
assert.ok(Object.values(defaults.spend).every(value => value === true));
assert.deepEqual(serializeQuickSettings(defaults), {
  goal: 'all',
  spend: {
    blood: true, promote_items: true, conclave: true, trust: true, group_items: true,
    presence_items: true, talent_items: true, talent_exp: true, skin_cards: true, fabric: true,
  },
  wardens: {},
  lovers: {},
});

const normalized = normalizeQuickSettings({
  goal: 'strength',
  spend: { blood: false, talent_exp: false },
  wardens: {
    '10170': { off: true, levels: false, max_level: 999, talents_off: [3, 1, 3], promotes_off: [8, 2] },
    invalid: { off: true },
  },
  lovers: {
    '20170': {
      bonds_off: [
        { attribute: 'strength', kind: 'level' },
        { attribute: 'strength', kind: 'level' },
        { attribute: 'nonsense', kind: 'percent' },
      ],
      presences_off: [9, 3, 9],
    },
  },
  conclave_off: ['spirit'],
});
assert.equal(normalized.goal, 'strength');
assert.equal(normalized.spend.blood, false);
assert.equal(normalized.spend.talent_exp, false);
assert.equal(normalized.spend.promote_items, true);
assert.deepEqual(normalized.wardens['10170'], {
  off: true, levels: false, max_level: 450, promotes_off: [2, 8], talents_off: [1, 3],
});
assert.equal(normalized.wardens.invalid, undefined);
assert.deepEqual(normalized.lovers['20170'].bonds_off, [{ attribute: 'strength', kind: 'level' }]);
assert.deepEqual(normalized.lovers['20170'].presences_off, [3, 9]);
assert.deepEqual(normalized.conclave_off, ['spirit']);

const serialized = serializeQuickSettings({
  goal: 'all',
  conclave_off: ['strength', 'allure', 'intellect', 'spirit'],
});
assert.equal(serialized.spend.conclave, false);
assert.deepEqual(serialized.conclave_off, undefined);
assert.deepEqual(summarizeQuickSettings({ spend: { blood: false }, wardens: { 1: { off: true } } }).disabledResources, ['blood']);

const plan = mapQuickResultToPlan(fixture.response, {});
assert.deepEqual(plan.levels, { 10270: 3, 10280: 7, 10300: 10, 10960: 3 });
assert.equal(plan.bonds['20170'].strength.targetLevel, 1);
assert.equal(plan.bonds['20170'].strength.targetPercentLevel, undefined);
assert.deepEqual(plan.talents['10540'].scrolls, { 2: 2 });
assert.deepEqual(plan.talents['10540'].scripts, undefined);

const extendedPlan = mapQuickResultToPlan({
  auras: { '10270': { summon: true, levels: { '2001': 3 } } },
  presences: { '20170': { summon: true, levels: { '3001': 4 } } },
  talents: { '10270': { exp_items: { '4151': 2 }, exp_levels: { '0': 1 } } },
  skins: { '50001': 5 },
}, {});
assert.deepEqual(extendedPlan.summons.wardens, [10270]);
assert.deepEqual(extendedPlan.summons.lovers, [20170]);
assert.equal(extendedPlan.auras['10270']['2001'], 3);
assert.equal(extendedPlan.presences['20170']['3001'], 4);
assert.equal(extendedPlan.talents['10270'].exp_items['4151'], 2);
assert.equal(extendedPlan.skins['50001'], 5);

// Minimal local account fixture: disabling Blood must prevent level allocation;
// disabling Trust must prevent even a free first-step Bond from being auto-added.
const wardenId = GAME_DB.wardens[0].id;
const loverId = GAME_DB.lovers.find(item => item.scarlet_bonds?.length)?.id;
const account = {
  blood: 250000,
  conclaveExp: 50000,
  courtyardLvl: 0,
  courtyardExp: 0,
  conclave: { strength: 0, allure: 0, intellect: 0, spirit: 0 },
  ownedWardens: {
    [wardenId]: { level: 1, promoteId: 1, exp: 5000, talents: {}, auras: {} },
  },
  ownedLovers: loverId ? {
    [loverId]: { affinity: 0, closeness: 999, bonds: {}, presences: {} },
  } : {},
  bag: {},
  skins: {},
};
const accountBefore = structuredClone(account);
const protectedResult = autoDistributeQuick({
  account,
  plan: {},
  settings: {
    goal: 'all',
    spend: {
      blood: false, promote_items: false, conclave: false, trust: false,
      group_items: true, presence_items: false, talent_items: false,
      talent_exp: false, skin_cards: true, fabric: true,
    },
  },
});
assert.equal(protectedResult.plan.levels[wardenId], 1);
assert.deepEqual(account, accountBefore, 'Quick Calculation must not mutate the saved account');
assert.equal(protectedResult.precision.optimizer, 'deterministic_local_heuristic_not_server_algorithm_clone');
assert.ok(protectedResult.warnings.some(message => message.includes('Вдохновений')));
assert.ok(protectedResult.warnings.some(message => message.includes('Обликов')));

const skippedWarden = autoDistributeQuick({
  account,
  plan: {},
  settings: { wardens: { [wardenId]: { off: true } }, spend: { blood: true } },
});
assert.equal(skippedWarden.plan.levels[wardenId], 1, 'excluded Wardens must not be leveled');

console.log('PASS HAR-grounded Quick Calculation settings, result mapping and local resource guards');
