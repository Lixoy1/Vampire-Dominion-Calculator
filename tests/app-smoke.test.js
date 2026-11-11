import assert from 'node:assert/strict';

let navButtons = [];
const root = {
  _html: '',
  get innerHTML() { return this._html; },
  set innerHTML(value) {
    this._html = value;
    navButtons = [...value.matchAll(/data-nav="([^"]+)"/g)].map(match => ({
      dataset: { nav: match[1] },
      handlers: {},
      addEventListener(event, handler) { this.handlers[event] = handler; },
    }));
  },
  querySelectorAll(selector) {
    if (selector === '[data-nav]') return navButtons;
    return [];
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
globalThis.window = { scrollTo() {} };
globalThis.document = {
  addEventListener(event, handler) { if (event === 'DOMContentLoaded') readyHandler = handler; },
  getElementById(id) {
    if (id === 'app' || id === 'screen-container') return root;
    return null;
  },
  querySelectorAll() { return []; },
};

await import('../js/app.js');
assert.equal(typeof readyHandler, 'function', 'app registers DOMContentLoaded');
readyHandler();

const assertScreen = (name, expectedText) => {
  const button = navButtons.find(item => item.dataset.nav === name);
  assert.ok(button, 'bottom navigation contains ' + name);
  assert.equal(typeof button.handlers.click, 'function', 'bottom navigation ' + name + ' is wired');
  button.handlers.click();
  assert.ok(root.innerHTML.includes(expectedText), 'screen ' + name + ' renders expected content');
};

assertScreen('home', 'OPTIMIST');
assertScreen('resources', 'Смотрители');
assert.ok(root.innerHTML.includes('Партнёры'), 'resources hub includes partners');
assert.ok(root.innerHTML.includes('Сумка'), 'resources hub includes inventory');
assertScreen('calculations', 'Подсчёт Господства');
assert.ok(root.innerHTML.includes('Близость и влечение'), 'calculations hub includes intimacy/attraction calculator');
assertScreen('settings', 'Активный профиль');
assert.ok(root.innerHTML.includes('btn-import'), 'settings screen includes profile/JSON import');
assert.ok(root.innerHTML.includes('profile-avatar-select'), 'settings screen includes avatar selection');

const stored = [...localStore.values()].map(value => JSON.parse(value)).find(value => value && value.account);
assert.ok(stored, 'state is saved locally after SPA navigation');
assert.equal(Object.keys(stored.account.ownedWardens).length, 4, 'starter profile contains the four reference wardens');
assert.equal(Object.keys(stored.account.ownedLovers).length, 2, 'starter profile contains the two reference partners');
assert.ok(root.innerHTML.includes('spa-bottom-nav'), 'fixed bottom navigation is rendered');
console.log('PASS app SPA smoke: home, resources, calculations, settings, local profile');
