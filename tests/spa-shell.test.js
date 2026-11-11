import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { GAME_DB } from '../scripts/data.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const html = read('../index.html');
const app = read('../scripts/app.js');
const server = read('../server.js');
const oracle = read('../oracle.js');
const css = read('../assets/css/style.css');

for (const id of [
  'screen-container', 'bottom-nav', 'modal-overlay', 'modal-sheet',
  'modal-title', 'modal-close', 'modal-body', 'numpad-overlay',
  'numpad-title', 'numpad-display', 'calc-loader', 'calc-loader-text',
]) {
  assert.ok(html.includes(`id="${id}"`), `index.html contains #${id}`);
}

for (const target of ['home', 'resources', 'calculations', 'settings']) {
  assert.ok(html.includes(`data-target="${target}"`), `bottom navigation contains ${target}`);
}
for (const unit of ['K', 'M', 'B', 'T']) {
  assert.ok(html.includes(`data-mult="${unit}"`), `numeric keypad contains ${unit}`);
}
for (const key of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '.', 'BACK', 'CLEAR', 'DONE']) {
  assert.ok(html.includes(`data-key="${key}"`), `numeric keypad contains key ${key}`);
}

assert.ok(html.includes('./assets/css/style.css'), 'entry point loads the canonical stylesheet');
assert.ok(html.includes('./scripts/app.js'), 'entry point loads the canonical SPA client');
assert.ok(app.includes("getElementById('screen-container')"), 'client renders inside the persistent SPA screen');
assert.ok(app.includes("getElementById('numpad-overlay')"), 'client uses the static K/M/B/T keypad');
assert.ok(app.includes("getElementById('calc-loader')"), 'client controls the Oracle loading overlay');
assert.ok(app.includes('#bottom-nav [data-target]'), 'persistent bottom navigation is bound once');
assert.ok(app.includes('/api/oracle/calculate'), 'client uses the Unified Oracle API');
assert.ok(server.includes("express.static(path.join(__dirname, 'scripts')"), 'server serves canonical scripts');
assert.ok(server.includes("express.static(path.join(__dirname, 'data')"), 'server serves source JSON data');
assert.ok(oracle.includes("from './scripts/data.js'"), 'Oracle reads the same catalog as the browser');
assert.ok(oracle.includes("from './scripts/engine.js'"), 'Oracle uses the canonical calculation engine');
assert.ok(oracle.includes("status: 'not-game-verified'"), 'Helper API observations are not presented as game-verified');

const expected = {
  wardens: 68,
  lovers: 45,
  items: 237,
  warden_promotes: 8,
  conclave_levels: 180,
  courtyard_levels: 210,
  lover_presence_levels: 155,
};
for (const [key, count] of Object.entries(expected)) {
  assert.equal(GAME_DB[key].length, count, `compiled GAME_DB contains ${count} ${key}`);
}
for (const [file, key] of [
  ['wardens.json', 'wardens'],
  ['lovers.json', 'lovers'],
  ['items.json', 'items'],
  ['warden_promotes.json', 'warden_promotes'],
  ['conclave_levels.json', 'conclave_levels'],
  ['courtyard_levels.json', 'courtyard_levels'],
  ['lover_presence_levels.json', 'lover_presence_levels'],
]) {
  const rows = JSON.parse(readFileSync(new URL(`../data/${file}`, import.meta.url), 'utf8'));
  assert.equal(rows.length, expected[key], `source table ${file} contains ${expected[key]} records`);
}
for (const path of [
  '../scripts/app.js', '../scripts/data.js', '../scripts/engine.js',
  '../assets/css/style.css', '../assets/crest.svg',
]) {
  assert.ok(existsSync(new URL(path, import.meta.url)), `required canonical file exists: ${path}`);
}
for (const selector of ['.bottom-nav-bar', '.modal-overlay', '.numpad-overlay', '.calc-loader', '.crimson-spinner']) {
  assert.ok(css.includes(selector), `stylesheet styles ${selector}`);
}
console.log('PASS canonical SPA shell, data catalog, routes and Oracle provenance');
