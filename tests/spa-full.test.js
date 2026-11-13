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

for (const name of ['createBlankAccountData','getAccountProgressPercent','renderSpaTopbar','renderCalculationNavStrip','renderSubToolbar','renderHomeScreen','renderCalculationsHubScreen','renderDominanceTab','renderLoverDetailScreen','renderSettingsScreen','runLocalAction','saveCurrentCalculation','exportProfileJson','importProfileJson','bindSpaEvents','render']) fn(name);

const topbar = fn('renderSpaTopbar');
assert.ok(topbar.includes('id="btn-lang"'), 'language toggle is in the topbar');
assert.ok(topbar.includes('id="btn-theme"'), 'theme toggle is in the topbar');
const home = fn('renderHomeScreen');
assert.ok(home.includes('data-action="quick-calc"'));
assert.ok(!home.includes('auto-all'), 'Auto All is not shown on home');
const blankAccount = fn('createBlankAccountData');
assert.ok(blankAccount.includes('GAME_DB.wardens[0]'), 'new account starts with the first reference Warden');
assert.ok(blankAccount.includes('createOwnedWarden(GAME_DB.wardens[0])'), 'starter Warden is initialized at level 1 with catalog talent defaults');
assert.ok(blankAccount.includes('blood: 0') && blankAccount.includes('ownedLovers: {}'), 'new account begins with zero Blood and no Partners');
const progress = fn('getAccountProgressPercent');
assert.ok(progress.includes('Math.max(0'), 'empty profile can display zero-percent progress');
assert.ok(progress.includes('return Math.max(0,'), 'empty progress is not rounded up to a false one percent');
const homeDashboard = fn('renderHomeScreen');
for (const marker of ['home-resource-grid','home-primary-actions','home-profile-progress','Подсчёт Господства','Быстрый подсчёт']) {
  assert.ok(homeDashboard.includes(marker), 'reference home dashboard includes ' + marker);
}
for (const destination of ['resources','wardens_list','lovers','bag','calc_dominance']) {
  assert.ok(homeDashboard.includes('data-screen="' + destination + '"'), 'home dashboard shortcut opens ' + destination);
}

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

const loverDetail = fn('renderLoverDetailScreen');
for (const tab of ['trust','bonds','presences','skins']) {
  assert.ok(loverDetail.includes("['" + tab + "'"), 'partner detail has ' + tab + ' tab');
}
assert.ok(loverDetail.includes('data-action="set-lover-tab"'), 'partner tabs are interactive');
assert.ok(loverDetail.includes('lover-subtabs'), 'partner tabs use the compact horizontal tab strip');
const settings = fn('renderSettingsScreen');
for (const marker of ['portrait-picker-grid','setting-segment','setting-toggle','profile-region-select','data-copy-kind="user"','data-copy-kind="account"','data-action="delete-account"']) {
  assert.ok(settings.includes(marker), 'settings include ' + marker);
}
for (const value of ["'auto','dark','light'","'auto','smooth','less'","'male','female'"]) {
  assert.ok(settings.includes(value), 'settings preserve ' + value);
}
assert.ok(settings.includes('Не подключено'), 'offline app does not pretend that bot messaging is active');
assert.ok(fn('applyTheme').includes('matchMedia'), 'automatic theme and reduced-motion settings follow device preferences');

for (const selector of ['.home-resource-grid','.home-resource-card','.home-primary-actions','.home-profile-progress']) {
  assert.ok(css.includes(selector), 'Crimson home component has styles: ' + selector);
}
assert.ok(css.includes('touch-action:pan-x') || css.includes('touch-action: pan-x'), 'horizontal strip supports touch scrolling');
assert.ok(css.includes('pointer-events:none') || css.includes('pointer-events: none'), 'decorative images do not intercept taps');
assert.ok(html.includes('локально на устройстве'));
console.log('PASS local SPA actions, persistent top controls, swipe navigation and tap-through art');
