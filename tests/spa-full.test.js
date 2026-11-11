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

for (const name of [
  'renderSpaTopbar', 'renderHomeScreen', 'renderResourcesScreen',
  'renderWardensListScreen', 'renderWardenDetailScreen', 'renderLoversScreen',
  'renderLoverDetailScreen', 'renderBagScreen', 'renderSkinsScreen',
  'renderConclaveScreen', 'renderWardenExpScreen', 'renderCalculationsHubScreen',
  'renderDominanceCalcScreen', 'renderIntimacyCalcScreen', 'renderSettingsScreen',
  'openQuickCalculation', 'openFormulaInfo', 'bindSpaEvents',
]) {
  fn(name);
}

const render = fn('render');
assert.ok(render.includes("requestOracle('/api/oracle/calculate'"), 'SPA render fetches the calculation from Oracle');
assert.ok(render.includes('renderSpaScreen(db, report, oracle)'), 'SPA renderer receives Oracle results');
assert.ok(render.includes('bindSpaEvents(db, report, oracle)'), 'SPA screens bind their controls');

const wardenStats = fn('computeWardenDetailedStats');
assert.ok(wardenStats.includes('oracleSnapshot?.wardens'), 'Warden stats come from the server snapshot');
assert.ok(!wardenStats.includes('calcAuraPercent('), 'Warden details do not calculate aura percentages locally');

const wardenDetail = fn('renderWardenDetailScreen');
assert.ok(wardenDetail.includes('oracleWarden?.auras'), 'Warden aura values come from Oracle');
assert.ok(wardenStats.includes('server?.baseAttributes'), 'Warden base attributes are read from Oracle');
assert.ok(!wardenDetail.includes('calcAuraPercent('), 'Warden detail has no local aura formula');

const loverDetail = fn('renderLoverDetailScreen');
assert.ok(loverDetail.includes('oracleSnapshot?.lovers'), 'Lover calculations use the Oracle snapshot');
assert.ok(!loverDetail.includes('calcLoverBonds('), 'Lover bond formulas are not recalculated locally');
assert.ok(!loverDetail.includes('calcPresencePercents('), 'Lover presence formulas are not recalculated locally');
assert.ok(loverDetail.includes('btn-auto-bonds') && loverDetail.includes('btn-auto-presences'), 'Lover detail exposes server optimizers');

const conclave = fn('renderConclaveScreen');
assert.ok(conclave.includes('oracle?.conclaveBranches'), 'Conclave branch output comes from Oracle');
assert.ok(conclave.includes('oracle?.courtyardUpgrade'), 'Courtyard upgrade output comes from Oracle');
assert.ok(!conclave.includes('calcConclaveBranch('), 'Conclave is not calculated locally');
assert.ok(!conclave.includes('calcCourtyardUpgrade('), 'Courtyard is not calculated locally');

const events = fn('bindSpaEvents');
assert.ok(events.includes("requestOracle('/api/oracle/auto-conclave'"), 'Conclave auto-allocation calls the Oracle API');
assert.ok(!events.includes('autoDistributeConclave('), 'no local Conclave optimizer fallback remains');
assert.ok(events.includes("action === 'quick-calc'"), 'quick calculation modal is interactive');
assert.ok(events.includes("action === 'formula-info'"), 'formula explanation modal is interactive');

assert.ok(fn('renderHomeScreen').includes('data-action="quick-calc"'), 'home screen opens Quick Calculation');
assert.ok(fn('renderSubToolbar').includes('data-action="formula-info"'), 'subscreens expose formula explanations');
assert.ok(fn('renderSettingsScreen').includes('renderServerSnapshotCard()'), 'settings display the source/verification panel');
assert.ok(app.includes('state.screen = destination;'), 'persistent navigation targets the new SPA screens');
assert.ok(!app.includes("document.querySelectorAll('[data-tab]')"), 'nested entity tabs do not conflict with a global tab handler');

for (const target of ['home', 'resources', 'calculations', 'settings']) {
  assert.ok(html.includes('data-target="' + target + '"'), 'static bottom navigation has ' + target);
}
assert.ok(css.includes('.spa-topbar') && css.includes('.home-hero'), 'Blood Moon styles the SPA shell and home hero');
assert.ok(css.includes('.warden-hero-card') && css.includes('.bag-grid-4'), 'Blood Moon styles entity details and inventory grid');
assert.ok(css.includes('.formula-status-list') && css.includes('.quick-calc-summary'), 'modals have complete styling');

console.log('PASS full SPA screen routes, Oracle-only detail formulas, and modal actions');
