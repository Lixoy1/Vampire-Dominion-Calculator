import assert from 'node:assert/strict';
import {
  QUICK_DEFAULT_SPEND,
  QUICK_GOALS,
  QUICK_SPEND_KEYS,
  normalizeQuickSettings,
  quickResponseToPlan,
} from '../scripts/quick-settings.js';

assert.deepEqual(QUICK_GOALS, ['all', 'strength', 'allure', 'intellect', 'spirit']);
assert.equal(QUICK_SPEND_KEYS.length, 10);
assert.ok(Object.values(QUICK_DEFAULT_SPEND).every(value => value === true));

// Default settings and partial spend overrides must match the official Quick client.
{
  const settings = normalizeQuickSettings({});
  assert.equal(settings.goal, 'all');
  assert.deepEqual(settings.spend, QUICK_DEFAULT_SPEND);
  assert.deepEqual(settings.wardens, {});
  assert.deepEqual(settings.lovers, {});
  assert.equal('conclave_off' in settings, false);
}

{
  const settings = normalizeQuickSettings({
    goal: 'spirit',
    spend: { blood: false, trust: false, fabric: 0 },
    conclave_off: ['strength', 'intellect'],
    wardens: {
      10170: {
        off: true,
        summon: false,
        levels: false,
        max_level: 150,
        promotes_off: [3, 1, 3, 'bad'],
        talents_off: [5, 0, 2],
        auras_off: [],
        skins_off: [8, 8],
        ignored: true,
      },
      invalid: { off: true },
      10180: {},
    },
    lovers: {
      20170: {
        summon: false,
        bonds_off: [
          { attribute: 'strength', kind: 'level' },
          { attribute: 'strength', kind: 'level' },
          { attribute: 'spirit', kind: 'percent' },
          { attribute: 'unknown', kind: 'level' },
          { attribute: 'allure', kind: 'other' },
        ],
        presences_off: [8, 3, 8],
        skins_off: [],
      },
    },
  });
  assert.equal(settings.goal, 'spirit');
  assert.deepEqual(settings.spend, {
    blood: false, promote_items: true, conclave: true, trust: false,
    group_items: true, presence_items: true, talent_items: true,
    talent_exp: true, skin_cards: true, fabric: true,
  });
  assert.deepEqual(settings.conclave_off, ['strength', 'intellect']);
  assert.deepEqual(settings.wardens, {
    10170: {
      off: true, summon: false, levels: false, max_level: 150,
      promotes_off: [1, 3], talents_off: [0, 2, 5], skins_off: [8],
    },
  });
  assert.deepEqual(settings.lovers, {
    20170: {
      summon: false,
      bonds_off: [
        { attribute: 'strength', kind: 'level' },
        { attribute: 'spirit', kind: 'percent' },
      ],
      presences_off: [3, 8],
    },
  });
}

// Selecting all four Conclave branches is canonicalized to spend.conclave=false.
{
  const settings = normalizeQuickSettings({
    spend: { conclave: true },
    conclave_off: ['strength', 'allure', 'intellect', 'spirit'],
  });
  assert.equal(settings.spend.conclave, false);
  assert.equal('conclave_off' in settings, false);
  assert.deepEqual(normalizeQuickSettings({ spend: { conclave: false }, conclave_off: ['strength'] }).conclave_off, undefined);
}

// The real Quick endpoint response shape maps to this project's plan model.
{
  const account = {
    conclave: { strength: 10, allure: 8, intellect: 4, spirit: 2 },
    ownedWardens: {
      10170: { level: 100, talents: {}, auras: {} },
    },
    ownedLovers: {
      20170: {
        affinity: 500,
        closeness: 200,
        bonds: {
          strength: { level: 4, percentLevel: 1 },
          allure: { level: 2, percentLevel: 0 },
        },
      },
    },
    bag: {},
  };
  const response = {
    conclave: { strength: null, allure: 12, intellect: null, spirit: null },
    levels: { 10170: 153 },
    bonds: {
      20170: {
        strength: { level: 12, percent_level: 2 },
        allure: { level: 8, percent_level: null },
      },
    },
    auras: { 10170: { summon: true, levels: { 2096: 5 } } },
    skins: { 10173101: 3 },
    talents: {
      10170: {
        scrolls: { 0: 1 },
        scripts: { 1: 2 },
        exp_items: { 4151: 3 },
        exp_levels: { 2: 4 },
      },
    },
    presences: { 20170: { summon: true, levels: { 7810001: 10 } } },
  };
  const { plan, ignored } = quickResponseToPlan(response, account, {
    conclave: { strength: 10, allure: 8, intellect: 4, spirit: 2 },
    levels: {}, bonds: {}, talents: {}, presences: {}, skins: {},
    summons: { wardens: [], lovers: [] },
  });

  assert.deepEqual(plan.conclave, { strength: 10, allure: 12, intellect: 4, spirit: 2 });
  assert.equal(plan.levels[10170], 153);
  assert.deepEqual(plan.bonds[20170].strength, {
    level: 4, targetLevel: 12, percentLevel: 1, targetPercentLevel: 2,
  });
  assert.deepEqual(plan.bonds[20170].allure, {
    level: 2, targetLevel: 8, percentLevel: 0,
  });
  assert.deepEqual(plan.talents[10170], {
    scrolls: { 0: 1 }, scripts: { 1: 2 }, exp_levels: { 2: 4 },
  });
  assert.deepEqual(plan.presences[20170], { 7810001: 10 });
  assert.equal(plan.skins[10173101], 3);
  assert.deepEqual(plan.summons, { wardens: [10170], lovers: [20170] });
  assert.deepEqual(ignored.wardenAuraLevels, { 10170: { 2096: 5 } });
  assert.deepEqual(ignored.talentExpItems, { 10170: { 4151: 3 } });
}

// Null branches never overwrite existing choices; response application is non-mutating.
{
  const original = {
    conclave: { strength: 7, allure: 3, intellect: 2, spirit: 1 },
    levels: { 10170: 4 },
    bonds: {}, talents: {}, presences: {}, skins: {},
    summons: { wardens: [], lovers: [] },
  };
  const before = structuredClone(original);
  const mapped = quickResponseToPlan({ conclave: { strength: null }, levels: {} }, {}, original);
  assert.deepEqual(mapped.plan, original);
  assert.deepEqual(original, before);
}

console.log('Quick Calculation request/response compatibility tests passed.');
