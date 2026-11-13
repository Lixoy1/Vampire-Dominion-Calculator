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

for (const name of ['createBlankAccountData','ensureStarterWarden','getAccountProgressPercent','renderSpaTopbar','renderCalculationNavStrip','renderSubToolbar','renderHomeScreen','renderCalculationsHubScreen','renderDominanceTab','renderLoverDetailScreen','renderSettingsScreen','renderWardensListScreen','renderLoversScreen','renderQuickSettingsModal','runLocalAction','saveCurrentCalculation','exportProfileJson','importProfileJson','bindSpaEvents','render']) fn(name);

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

const starterMigration = fn('ensureStarterWarden');
assert.ok(starterMigration.includes('Number(storedVersion) >= 7'), 'existing version-7 profiles are never changed by starter migration');
assert.ok(starterMigration.includes('Object.keys(account.ownedWardens || {}).length'), 'existing Warden rosters are preserved');
assert.ok(starterMigration.includes('account.blood') && starterMigration.includes('account.ownedLovers') && starterMigration.includes('account.bag') && starterMigration.includes('account.skins'), 'migration checks the whole profile before adding starter Warden');
assert.ok(starterMigration.includes('createOwnedWarden(starter)'), 'migration creates the catalog-defined starter Warden');
const normalizer = app.slice(app.indexOf('export function normalizeState('), app.indexOf('\n\nfunction loadState'));
assert.equal((normalizer.match(/ensureStarterWarden\(/g) || []).length, 2, 'both single-account and multi-account legacy profiles are migrated');
assert.equal((normalizer.match(/version: 7/g) || []).length, 2, 'both migrated state shapes are upgraded to version 7');

const progress = fn('getAccountProgressPercent');
assert.ok(progress.includes('Math.max(0'), 'empty profile can display zero-percent progress');
assert.ok(progress.includes('return Math.max(0,'), 'empty progress is not rounded up to a false one percent');
const homeDashboard = fn('renderHomeScreen');
for (const marker of ['home-resource-grid','home-primary-actions','home-profile-progress','Подсчёт Господства','Быстрый подсчёт']) {
  assert.ok(homeDashboard.includes(marker), 'reference home dashboard includes ' + marker);
}
for (const destination of ['resources','wardens_list','lovers','bag']) {
  assert.ok(homeDashboard.includes("screen: '" + destination + "'"), 'home dashboard shortcut opens ' + destination);
}
assert.ok(homeDashboard.includes('data-screen="calc_dominance"'), 'main dashboard has a direct dominance-calculation action');

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

const wardenCatalog = fn('renderWardensListScreen');
assert.ok(wardenCatalog.includes('Добавить смотрителя') && wardenCatalog.includes('data-action="add-warden"'), 'Warden selection uses a visible catalog');
assert.ok(wardenCatalog.includes('getIconUrl(warden.icon_path'), 'Warden catalog cards include portraits');
assert.ok(!wardenCatalog.includes('prompt(') && !app.includes("Введите ID смотрителя"), 'Warden selection never asks players to type IDs');
const loverCatalog = fn('renderLoversScreen');
assert.ok(loverCatalog.includes('Добавить партнёра') && loverCatalog.includes('data-action="add-lover"'), 'Partner selection uses a visible catalog');
assert.ok(loverCatalog.includes('getLoverIconPath(lover,null)'), 'Partner catalog cards include portraits');
assert.ok(!loverCatalog.includes('prompt(') && !app.includes("Введите ID партнёра"), 'Partner selection never asks players to type IDs');
const quickModal = fn('renderQuickSettingsModal');
assert.ok(quickModal.includes('Рассчитать быстро'), 'Quick calculation has a simple player-facing action');
for (const jargon of ['API / HAR','Экспорт настроек JSON','Формат настроек восстановлен']) assert.ok(!quickModal.includes(jargon), 'Quick calculation hides technical term: ' + jargon);
assert.ok(!fn('renderDominanceTab').includes('Подключение игрового аккаунта'), 'Dominance screen does not show the unused game-connection panel');
assert.ok(!fn('renderSettingsTab').includes('btn-game-connect-panel'), 'Settings do not show the unused game-connection action');
