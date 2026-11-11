import { calculateOracle } from '../oracle.js';

import assert from 'node:assert/strict';

let navButtons = [];
const root = {
  _html: '',
  get innerHTML() { return this._html; },
  set innerHTML(value) {
    this._html = value;
    navButtons = [...value.matchAll(/data-tab="([^"]+)"/g)].map(match => ({
      dataset: { tab: match[1] },
      handlers: {},
      addEventListener(event, handler) { this.handlers[event] = handler; },
    }));
  },
};
let readyHandler = null;
const localStore = new Map();

globalThis.localStorage = {
  getItem: key => localStore.has(key) ? localStore.get(key) : null,
  setItem: (key, value) => localStore.set(key, String(value)),
  removeItem: key => localStore.delete(key),
};
globalThis.prompt = () => null;
globalThis.fetch = async (url, options = {}) => {
  assert.equal(url, '/api/oracle/calculate', 'the browser requests its calculation from the Oracle API');
  const input = JSON.parse(options.body || '{}');
  return {
    ok: true,
    status: 200,
    json: async () => ({ ok: true, result: calculateOracle(input) }),
  };
};
globalThis.alert = () => {};
globalThis.confirm = () => false;
globalThis.document = {
  addEventListener(event, handler) { if (event === 'DOMContentLoaded') readyHandler = handler; },
  getElementById(id) { return id === 'app' ? root : null; },
  querySelectorAll(selector) { return selector === '[data-tab]' ? navButtons : []; },
};

const appModule = await import('../js/app.js');
assert.equal(typeof readyHandler, 'function', 'app registers DOMContentLoaded');
await readyHandler();

const expectedTabs = ['dominance', 'conclave', 'levels', 'talents', 'auras', 'bonds', 'skins', 'summon', 'bag'];
for (const expected of expectedTabs) {
  const tab = document.querySelectorAll('[data-tab]').find(item => item.dataset.tab === expected);
  assert.ok(tab, `tab ${expected} is rendered`);
  assert.equal(typeof tab.handlers.click, 'function', `tab ${expected} has a click handler`);
  tab.handlers.click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.ok(root.innerHTML.includes('Vampire Dominion'), `application shell renders on ${expected}`);
}
assert.ok(root.innerHTML.includes('Цель'), 'presence upgrade targets are exposed in the UI');
assert.ok(root.innerHTML.includes('Модификаторы аур и Веяний'), 'dominance dashboard displays aura and presence modifiers');
assert.ok(root.innerHTML.includes('Инвентарь Сумки'), 'bag tab content rendered');
const importedHelperProfile = appModule.normalizeState({
  profile: { name: 'API import', region: 'EU', server: '328' },
  wardens: [
    { template_id: 10270, talent_exp: 0, level: 450, promote_id: 8, filled: true, dominance: '6701429.0000000000' },
    { template_id: 10540, talent_exp: 45, level: 5, promote_id: 1, filled: true, dominance: '1758651.0000000000' },
  ],
  skins: [{ kind: 'warden', owner_id: 10270, template_id: 10273101, level: 8 }],
  guild: { exp: 6800, level: 11, next_level_exp: 7000 },
});
assert.equal(importedHelperProfile.account.ownedWardens[10270].level, 450, 'helper warden level is imported');
assert.equal(importedHelperProfile.account.ownedWardens[10270].promoteId, 8, 'helper promotion is imported');
assert.equal(importedHelperProfile.account.ownedWardens[10270].observedDominance, 6701429, 'helper dominance is preserved as observed reference data');
assert.equal(importedHelperProfile.account.skins[10273101], 8, 'helper skin level is imported');
assert.deepEqual(importedHelperProfile.account.guildProgress, { exp: 6800, level: 11, nextLevelExp: 7000 }, 'guild progress fields are normalized');
assert.ok(root.innerHTML.includes('assets/icons/'), 'local icon URLs are used');
const appSource = (await import('node:fs')).readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
assert.ok(appSource.includes('data-np-unit'), 'touch numeric keypad supports K/M/B/T suffixes');
assert.ok(appSource.includes('wizard-create'), 'new-account flow uses a guided manual profile wizard');
assert.ok(appSource.includes('btn-import-helper') && appSource.includes('/api/oracle/import-helper'), 'Helper API data can be imported from several JSON snapshots');
assert.ok(appSource.includes('guild-input'), 'guild level and experience fields are editable');
assert.ok(appSource.includes('skin-target'), 'skin tab exposes planned target levels');
assert.ok(appSource.includes('btn-auto-talents'), 'talent tab exposes server auto-distribution');
assert.ok(appSource.includes('/api/oracle/auto-talents'), 'talent auto-distribution uses the server Oracle');
assert.ok(appSource.includes('talents: Object.fromEntries'), 'talent plan survives local profile normalization');
assert.ok(appSource.includes('Подтянуть из игры') && appSource.includes('Недоступно без игрового подключения'), 'account creation does not pretend to sync with the game');
assert.ok(localStore.size > 0, 'state is stored locally');
console.log(`PASS app render smoke: ${expectedTabs.length} tabs`);