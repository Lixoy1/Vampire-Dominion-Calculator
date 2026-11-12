import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const app = read('../scripts/app.js');
const html = read('../index.html');
const css = read('../assets/css/style.css');

function fn(name) {
  const start = new RegExp('^(?:async\\s+)?function\\s+' + name + '\\s*\\(', 'm').exec(app);
  assert.ok(start, 'function ' + name + ' exists');
  const next = new RegExp('^(?:async\\s+)?function\\s+[A-Za-z0-9_$]+\\s*\\(', 'gm');
  next.lastIndex = start.index + 1;
  const end = next.exec(app);
  return app.slice(start.index, end ? end.index : app.length);
}

for (const name of ['renderSpaTopbar','renderCalculationNavStrip','renderSubToolbar','renderHomeScreen','renderCalculationsHubScreen','renderDominanceTab','renderSettingsScreen','runLocalAction','saveCurrentCalculation','exportProfileJson','importProfileJson','bindSpaEvents','render']) fn(name);

const topbar = fn('renderSpaTopbar');
assert.ok(topbar.includes('id="btn-lang"'), 'language toggle is in the topbar');
assert.ok(topbar.includes('id="btn-theme"'), 'theme toggle is in the topbar');
const home = fn('renderHomeScreen');
assert.ok(home.includes('data-action="quick-calc"'));
assert.ok(!home.includes('auto-all'), 'Auto All is not shown on home');
const nav = fn('renderCalculationNavStrip');
for (const target of ['calc_dominance','conclave','wardens_list','warden_exp','calc_talents','lovers','calc_intimacy','skins','bag']) assert.ok(nav.includes(target), 'horizontal nav has ' + target);
const dominance = fn('renderDominanceTab');
for (const action of ['save-calculation','reset-plan','export-profile','import-profile']) assert.ok(dominance.includes('data-action="' + action + '"'), 'calculator action ' + action + ' exists');
assert.ok(fn('renderCalculationsHubScreen').includes("data-screen=\"calc_intimacy\""), 'calculations hub renders intimacy route');
const dispatcher = fn('runLocalAction');
for (const operation of ['calculateLocalSnapshot','autoDistributeAll','autoDistributeConclave','commitLocalPlan','summonWarden','summonLover']) assert.ok(dispatcher.includes('LocalPlanner.' + operation), operation + ' wired locally');
const render = fn('render');
assert.ok(render.includes("runLocalAction('calculate'"), 'SPA render uses local calculation');
assert.ok(!render.includes('fetch('));
assert.ok(!app.includes('/api/oracle/'));
assert.ok(!app.includes('requestOracle('));
assert.ok(!app.includes('fetch('));
const events = fn('bindSpaEvents');
for (const action of ['save-calculation','reset-plan','export-profile','import-profile']) assert.ok(events.includes("action === '" + action + "'"), 'delegated handler supports ' + action);
assert.ok(css.includes('touch-action:pan-x') || css.includes('touch-action: pan-x'), 'horizontal strip supports touch scrolling');
assert.ok(css.includes('pointer-events:none') || css.includes('pointer-events: none'), 'decorative images do not intercept taps');
assert.ok(html.includes('локально на устройстве'));
console.log('PASS local SPA actions, persistent top controls, swipe navigation and tap-through art');
