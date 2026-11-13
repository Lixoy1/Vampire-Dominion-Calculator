import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { GAME_DB } from '../scripts/data.js';
import * as Engine from '../scripts/engine.js';
import * as Planner from '../scripts/local-planner.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const html = read('../index.html');
const app = read('../scripts/app.js');
const css = read('../assets/css/style.css');
const planner = read('../scripts/local-planner.js');

for (const id of ['screen-container','bottom-nav','modal-overlay','modal-sheet','modal-title','modal-close','modal-body','numpad-overlay','numpad-title','numpad-display']) {
  assert.ok(html.includes('id="' + id + '"'), 'index contains #' + id);
}
for (const target of ['home','resources','calculations','settings']) {
  assert.ok(html.includes('data-target="' + target + '"'), 'bottom navigation contains ' + target);
}
assert.ok(html.includes('./assets/css/style.css'));
assert.ok(html.includes('./scripts/app.js'));
assert.ok(html.includes('Формулы и распределение ресурсов выполняются локально на устройстве'));
assert.ok(app.includes("import * as LocalPlanner from './local-planner.js';"));
assert.ok(app.includes("LocalPlanner.calculateLocalSnapshot"));
assert.ok(!app.includes('/api/oracle/'));
assert.ok(!app.includes('requestOracle('));
assert.ok(!app.includes('fetch('));
assert.ok(!planner.includes('/api/'));
assert.ok(!planner.includes('fetch('));
assert.ok(planner.includes("import * as Engine from './engine.js';"));
assert.ok(planner.includes('Engine.calculateTotalDominanceReport'));
assert.equal(typeof Engine.calculateTotalDominanceReport, 'function');
assert.equal(typeof Planner.calculateLocalSnapshot, 'function');

const expected = { wardens:68, lovers:45, items:240, warden_promotes:8, conclave_levels:180, courtyard_levels:210, lover_presence_levels:155 };
for (const [key,count] of Object.entries(expected)) assert.equal(GAME_DB[key].length, count, key + ' count');
for (const path of ['../scripts/app.js','../scripts/data.js','../scripts/engine.js','../scripts/local-planner.js','../assets/css/style.css','../assets/crest.svg']) {
  assert.ok(existsSync(new URL(path, import.meta.url)), 'static file exists: ' + path);
}
for (const selector of ['.bottom-nav-bar','.modal-overlay','.numpad-overlay','.spa-topbar','.calc-section-nav']) {
  assert.ok(css.includes(selector), 'CSS contains ' + selector);
}
console.log('PASS static SPA shell, local calculation imports, catalog and no server calculation API');
