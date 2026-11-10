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
globalThis.alert = () => {};
globalThis.confirm = () => false;
globalThis.document = {
  addEventListener(event, handler) { if (event === 'DOMContentLoaded') readyHandler = handler; },
  getElementById(id) { return id === 'app' ? root : null; },
  querySelectorAll(selector) { return selector === '[data-tab]' ? navButtons : []; },
};

await import('../js/app.js');
assert.equal(typeof readyHandler, 'function', 'app registers DOMContentLoaded');
readyHandler();

const expectedTabs = ['dominance', 'conclave', 'levels', 'talents', 'auras', 'bonds', 'skins', 'summon', 'bag'];
for (const expected of expectedTabs) {
  const tab = document.querySelectorAll('[data-tab]').find(item => item.dataset.tab === expected);
  assert.ok(tab, `tab ${expected} is rendered`);
  assert.equal(typeof tab.handlers.click, 'function', `tab ${expected} has a click handler`);
  tab.handlers.click();
  assert.ok(root.innerHTML.includes('class="app-shell"'), `app shell renders on ${expected}`);
}
assert.ok(root.innerHTML.includes('Инвентарь Сумки'), 'bag tab content rendered');
const dominanceTab = document.querySelectorAll('[data-tab]').find(item => item.dataset.tab === 'dominance');
dominanceTab.handlers.click();
assert.ok(root.innerHTML.includes('Проверка по серверному расчёту'), 'dominance tab explains server snapshot import');
assert.ok(root.innerHTML.includes('total, attributes и gain'), 'server response import schema is explained');
assert.ok(root.innerHTML.includes('assets/icons/'), 'local icon URLs are used');
assert.ok(localStore.size > 0, 'state is stored locally');
console.log(`PASS app render smoke: ${expectedTabs.length} tabs`);