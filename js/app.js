/**
 * VAMPIRE DOMINION v3.0 — ГЛАВНОЕ ПРИЛОЖЕНИЕ КАЛЬКУЛЯТОРА (БЕЗ VIP-ОГРАНИЧЕНИЙ)
 * Объединяет базу данных (data.js) и расчётное ядро (engine.js) со всеми вкладками.
 */
import { GAME_DB, getIconUrl } from './data.js';
const ATTRIBUTES = ['strength', 'allure', 'intellect', 'spirit'];
const FABRIC_COST_BY_QUALITY = { a: 50, s: 100, ss: 200 };

const STORAGE_KEY = 'vd_crimson_obsidian_v5';
const tg = globalThis.Telegram?.WebApp ?? null;
try { tg?.expand(); tg?.ready(); } catch {}

function createBlankAccountData() {
  return {
    blood: 0,
    conclaveExp: 0,
    courtyardExp: 0,
    courtyardLvl: 0,
    guildProgress: { level: 0, exp: 0, nextLevelExp: 0 },
    conclave: { strength: 0, allure: 0, intellect: 0, spirit: 0 },
    ownedWardens: {},
    ownedLovers: {},
    skins: {},
    bag: {},
    guildProgress: { exp: 0, level: 0, nextLevelExp: 0 },
  };
}

function createBlankPlan(account = createBlankAccountData()) {
  return {
    conclave: { ...account.conclave },
    courtyardToLvl: account.courtyardLvl,
    levels: {},
    promotes: {},
    talents: {},
    bonds: {},
    presences: {},
    skins: {},
    summons: { wardens: [], lovers: [] },
  };
}

function createDefaultState() {
  const id = 'primary';
  const profile = {
    name: globalThis.Telegram?.WebApp?.initDataUnsafe?.user?.first_name || 'Оптимист',
    server: '',
    region: 'EU',
    avatarId: 10010,
  };
  const account = createBlankAccountData();
  const plan = createBlankPlan(account);
  return {
    version: 5,
    lang: 'ru',
    preferLocalIcons: true,
    activeTab: 'dominance',
    bagFilter: 'all',
    searchQuery: '',
    profile,
    settings: { theme: 'dark', loverSex: 'female' },
    account,
    plan,
    activeAccountId: id,
    accounts: [{ id, ...profile, account, plan }],
  };
}

function normalizeAccountData(incoming = {}) {
  const base = createBlankAccountData();
  return {
    ...base,
    ...(incoming || {}),
    guildProgress: { ...base.guildProgress, ...(incoming?.guildProgress || incoming?.guild || {}) },
    conclave: { ...base.conclave, ...(incoming?.conclave || {}) },
    ownedWardens: { ...(incoming?.ownedWardens || {}) },
    ownedLovers: { ...(incoming?.ownedLovers || {}) },
    skins: { ...(incoming?.skins || {}) },
    bag: { ...(incoming?.bag || {}) },
    guildProgress: {
      exp: Math.max(0, Number(incoming?.guildProgress?.exp ?? incoming?.guild?.exp) || 0),
      level: Math.max(0, Number(incoming?.guildProgress?.level ?? incoming?.guild?.level) || 0),
      nextLevelExp: Math.max(0, Number(incoming?.guildProgress?.nextLevelExp ?? incoming?.guild?.next_level_exp ?? incoming?.guild?.nextLevelExp) || 0),
    },
  };
}

function normalizePlan(incoming = {}, account = createBlankAccountData()) {
  const base = createBlankPlan(account);
  return {
    ...base,
    ...(incoming || {}),
    conclave: { ...base.conclave, ...(incoming?.conclave || {}) },
    levels: { ...(incoming?.levels || {}) },
    promotes: { ...(incoming?.promotes || {}) },
    bonds: { ...(incoming?.bonds || {}) },
    presences: Object.fromEntries(Object.entries(incoming?.presences || {}).map(([id, value]) => [id, { ...(value || {}) }])),
    talents: Object.fromEntries(Object.entries(incoming?.talents || {}).map(([id, value]) => [id, {
      scrolls: { ...(value?.scrolls || {}) },
      scripts: { ...(value?.scripts || {}) },
      exp_levels: { ...(value?.exp_levels || {}) },
      exp_levels: { ...(value?.exp_levels || {}) },
    }])),
    skins: { ...(incoming?.skins || {}) },
    summons: {
      ...base.summons,
      ...(incoming?.summons || {}),
      wardens: [...(incoming?.summons?.wardens || [])],
      lovers: [...(incoming?.summons?.lovers || [])],
    },
  };
}

function adaptDhampirSnapshot(parsed = {}) {
  const source = parsed && typeof parsed === 'object' ? parsed : {};
  const rows = Array.isArray(source.wardens) ? source.wardens : [];
  const skinRows = Array.isArray(source.skins) ? source.skins : [];
  if (!rows.some(row => row && row.template_id != null && row.level != null)
      && !skinRows.some(row => row && row.template_id != null && row.level != null)
      && !source.guild && !source.guildProgress) return source;

  const accountSource = { ...(source.account || {}) };
  const ownedWardens = { ...(accountSource.ownedWardens || {}) };
  for (const row of rows) {
    const id = Number(row?.template_id);
    if (!Number.isSafeInteger(id) || !GAME_DB.wardens.some(item => item.id === id)) continue;
    ownedWardens[id] = {
      ...(ownedWardens[id] || {}),
      level: Math.max(1, Math.min(450, Math.round(Number(row.level) || 1))),
      promoteId: Math.max(1, Math.min(8, Math.round(Number(row.promote_id) || 1))),
      exp: Math.max(0, Number(row.talent_exp) || 0),
      talents: { ...(ownedWardens[id]?.talents || {}) },
      auras: { ...(ownedWardens[id]?.auras || {}) },
      observedDominance: Math.max(0, Number(row.dominance) || 0),
      referenceFilled: Boolean(row.filled),
    };
  }

  const skins = { ...(accountSource.skins || {}) };
  for (const row of skinRows) {
    const id = Number(row?.template_id);
    if (!Number.isSafeInteger(id) || row?.kind && !['warden', 'lover'].includes(row.kind)) continue;
    skins[id] = Math.max(0, Math.min(10, Math.round(Number(row.level) || 0)));
  }

  const guild = source.guildProgress || source.guild || {};
  return {
    ...source,
    account: {
      ...accountSource,
      ownedWardens,
      skins,
      guildProgress: {
        exp: Math.max(0, Number(guild.exp) || 0),
        level: Math.max(0, Number(guild.level) || 0),
        nextLevelExp: Math.max(0, Number(guild.nextLevelExp ?? guild.next_level_exp) || 0),
      },
    },
  };
}

export function normalizeState(parsed = {}) {
  parsed = adaptDhampirSnapshot(parsed);
  const source = parsed && typeof parsed === 'object' ? parsed : {};
  const base = createDefaultState();
  const lang = source.lang || source.settings?.lang || base.lang;

  // Import profile format used by the previous multi-account v4 calculator.
  if (Array.isArray(source.accounts) && source.accounts.length) {
    const accounts = source.accounts.map((raw, index) => {
      const account = normalizeAccountData(raw);
      const profile = {
        name: raw.name || `Аккаунт ${index + 1}`,
        server: raw.server || '',
        region: raw.region || 'EU',
        avatarId: raw.avatarId || 10010,
      };
      return {
        id: String(raw.id ?? `imported-${index + 1}`),
        ...profile,
        account,
        plan: normalizePlan(raw.plan || (raw.id === source.activeAccountId ? source.plan : {}), account),
      };
    });
    const selected = accounts.find(a => a.id === String(source.activeAccountId)) || accounts[0];
    return {
      ...base,
      ...source,
      version: 5,
      lang,
      profile: { name: selected.name, server: selected.server, region: selected.region, avatarId: selected.avatarId },
      settings: { ...base.settings, ...(source.settings || {}) },
      account: selected.account,
      plan: selected.plan,
      activeAccountId: selected.id,
      accounts,
    };
  }

  // Migrate the previous v4 single-account shape and the reference v3 export.
  const account = normalizeAccountData(source.account || source);
  const profileIn = source.profile || {};
  const profile = {
    name: profileIn.name || source.name || base.profile.name,
    server: profileIn.server || source.server || '',
    region: profileIn.region || source.region || 'EU',
    avatarId: profileIn.avatarId || source.avatarId || 10010,
  };
  const plan = normalizePlan(source.plan || {}, account);
  const id = String(source.activeAccountId || 'primary');
  return {
    ...base,
    ...source,
    version: 5,
    lang,
    profile,
    settings: { ...base.settings, ...(source.settings || {}) },
    account,
    plan,
    activeAccountId: id,
    accounts: [{ id, ...profile, account, plan }],
  };
}

function loadState() {
  const keys = [
    STORAGE_KEY,
    'vd_chronicles_v4_4_clean',
    'vd_chronicles_v4_1',
    'vd_mini_app_v4_1',
    'vd_chronicles_reference_v5',
    'vampire_dominion_v3_state',
  ];
  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const normalized = normalizeState(JSON.parse(raw));
      if (key !== STORAGE_KEY) localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      return normalized;
    } catch (error) {
      console.warn(`Не удалось прочитать сохранение ${key}:`, error);
    }
  }
  return createDefaultState();
}

function syncActiveAccountSnapshot() {
  if (!Array.isArray(state.accounts)) state.accounts = [];
  const id = String(state.activeAccountId || 'primary');
  const profile = { ...(state.profile || {}) };
  const index = state.accounts.findIndex(item => String(item.id) === id);
  const snapshot = {
    id,
    name: profile.name || 'Оптимист',
    server: profile.server || '',
    region: profile.region || 'EU',
    avatarId: profile.avatarId || 10010,
    account: state.account,
    plan: state.plan,
  };
  if (index >= 0) state.accounts[index] = snapshot;
  else state.accounts.push(snapshot);
}

function saveState() {
  try {
    syncActiveAccountSnapshot();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('Не удалось сохранить хроники:', error);
    alert('Не удалось сохранить данные на этом устройстве. Экспортируй резервную копию.');
  }
}

function switchAccount(id) {
  saveState();
  const selected = state.accounts.find(item => String(item.id) === String(id));
  if (!selected) return;
  state.activeAccountId = String(selected.id);
  state.profile = {
    name: selected.name,
    server: selected.server,
    region: selected.region,
    avatarId: selected.avatarId,
  };
  state.account = normalizeAccountData(selected.account);
  state.plan = normalizePlan(selected.plan, state.account);
  saveState();
  render();
}

function createNewAccount() {
  const dialog = document.createElement('div');
  dialog.className = 'account-wizard';
  dialog.innerHTML = `
    <div class="account-wizard-backdrop" data-wizard-close></div>
    <section class="account-wizard-panel" role="dialog" aria-modal="true" aria-labelledby="account-wizard-title">
      <div class="number-sheet-handle"></div>
      <div class="account-wizard-head">
        <div><div class="eyebrow">CRIMSON OBSIDIAN</div><h2 id="account-wizard-title">Новый аккаунт</h2></div>
        <button class="number-sheet-close" type="button" data-wizard-close aria-label="Закрыть">×</button>
      </div>
      <div class="account-wizard-sync"><strong>Подтянуть из игры</strong><span>Недоступно без игрового подключения. Создай профиль вручную — пароль и токены не нужны.</span></div>
      <label class="account-wizard-field">Имя аккаунта<input class="input" id="wizard-name" maxlength="40" value="Аккаунт ${state.accounts.length + 1}" autocomplete="off"></label>
      <div class="grid-2">
        <label class="account-wizard-field">Номер сервера<input class="input" id="wizard-server" inputmode="numeric" type="number" min="1" max="9999" placeholder="Например, 629"></label>
        <label class="account-wizard-field">Регион<select class="select" id="wizard-region"><option value="EU">EU</option><option value="AS">AS</option><option value="US">US</option></select></label>
      </div>
      <label class="account-wizard-field">Портрет профиля<select class="select" id="wizard-avatar">${GAME_DB.wardens.map(w => `<option value="${w.id}">${tName('warden', w.name)}</option>`).join('')}</select></label>
      <div class="account-wizard-note">После создания внеси реальные значения из игры в разделах «Ресурсы» и «Расчёты».</div>
      <div class="account-wizard-actions"><button class="btn" type="button" data-wizard-close>Отмена</button><button class="btn btn-primary" type="button" id="wizard-create">Создать аккаунт</button></div>
    </section>`;
  document.body.appendChild(dialog);
  const close = () => dialog.remove();
  dialog.querySelectorAll('[data-wizard-close]').forEach(button => button.addEventListener('click', close));
  dialog.querySelector('#wizard-create').addEventListener('click', () => {
    const name = dialog.querySelector('#wizard-name').value.trim();
    const server = String(Math.max(1, Math.min(9999, Number(dialog.querySelector('#wizard-server').value) || 0)));
    const region = dialog.querySelector('#wizard-region').value;
    const avatarId = Number(dialog.querySelector('#wizard-avatar').value) || 10010;
    if (!name || !server || server === '0') {
      alert('Укажи имя аккаунта и номер сервера.');
      return;
    }
    saveState();
    const id = `account-${Date.now()}`;
    const account = createBlankAccountData();
    const profile = { name, server, region, avatarId };
    const plan = createBlankPlan(account);
    state.accounts.push({ id, ...profile, account, plan });
    state.activeAccountId = id;
    state.profile = profile;
    state.account = account;
    state.plan = plan;
    saveState();
    close();
    render();
  });
}

let state = loadState();

function tName(type, key) {
  const dict = state.lang === 'en' ? GAME_DB.names_en : GAME_DB.names_ru;
  return dict?.[type]?.[key] ?? GAME_DB.names_ru?.[type]?.[key] ?? key;
}

function fmt(num) {
  return Number(num || 0).toLocaleString(state.lang === 'en' ? 'en-US' : 'ru-RU');
}

function applyTheme() {
  const light = state.settings?.theme === 'light';
  document.documentElement?.classList.toggle('light-theme', light);
  try {
    const color = light ? '#f5efe7' : '#12070b';
    tg?.setHeaderColor(color);
    tg?.setBackgroundColor(color);
  } catch {}
}

function editProfile() {
  const name = globalThis.prompt?.('Имя аккаунта:', state.profile.name || 'Оптимист');
  if (name == null) return;
  const server = globalThis.prompt?.('Сервер (например, EU S-629):', state.profile.server || 'EU S-629');
  if (server == null) return;
  state.profile.name = name.trim() || 'Оптимист';
  state.profile.server = server.trim();
  saveState();
  render();
}

function attrDotsHtml(attrs = []) {
  return `<span class="attr-dots">${attrs.map(a => `<i class="dot ${a}" title="${tName('attribute', a)}"></i>`).join('')}</span>`;
}

function getDbContext() {
  return {
    wardens: GAME_DB.wardens,
    lovers: GAME_DB.lovers,
    items: GAME_DB.items,
    promotes: GAME_DB.warden_promotes,
    conclaveLevels: GAME_DB.conclave_levels,
    courtyardLevels: GAME_DB.courtyard_levels,
  };
}

function getBondPlan(lover, owned) {
  const plan = state.plan.bonds[lover.id] || (state.plan.bonds[lover.id] = {});
  for (const bond of lover.scarlet_bonds || []) {
    const current = owned.bonds?.[bond.attribute] || { level: 0, percentLevel: 0 };
    plan[bond.attribute] ||= {
      level: current.level || 0,
      targetLevel: current.level || 0,
      percentLevel: current.percentLevel ?? current.pctLevel ?? 0,
      targetPercentLevel: current.percentLevel ?? current.pctLevel ?? 0,
    };
  }
  return plan;
}

function getLoverIconPath(lover, owned = null) {
  const sex = owned?.sex || lover.fixed_sex || 'female';
  return sex === 'male' ? (lover.icon_path_male || lover.icon_path_female) : (lover.icon_path_female || lover.icon_path_male);
}

// Автораспределение выполняется только серверным Oracle. Ошибки не подменяются локальными расчётами.
async function runAutoTalentDistribution() {
  try {
    const result = await requestOracle('/api/oracle/auto-talents', {
      account: state.account,
      plan: state.plan,
    });
    state.plan = normalizePlan(result.plan, state.account);
    saveState();
    await render();
    const summary = result.summary || {};
    alert(
      'План талантов готов.\\n' +
      'Уровней: ' + (summary.plannedLevels || 0) + '\\n' +
      'Свитки: ' + (summary.scrollLevels || 0) + '\\n' +
      'Рукописи: ' + (summary.scriptLevels || 0) + '\\n' +
      'За личный опыт: ' + (summary.expLevels || 0) + ' уровн. / ' + (summary.expSpentTotal || 0) + ' EXP'
    );
  } catch (error) {
    alert(error.message || 'Oracle не смог распределить свитки и рукописи.');
  }
}

async function runAutoBondDistribution() {
  try {
    const result = await requestOracle('/api/oracle/auto-bonds', {
      account: state.account,
      plan: state.plan,
    });
    state.plan = normalizePlan(result.plan, state.account);
    saveState();
    await render();
    const summary = result.summary || {};
    alert(
      'План Кровных уз рассчитан.\\n' +
      'Новых уровней: ' + (summary.addedLevels || 0) + '\\n' +
      'Доверие по расчётной формуле: ' + (summary.estimatedAffinity || 0) + '\\n' +
      'Оценка прироста: +' + (summary.estimatedGain || 0) + ' Господства'
    );
  } catch (error) {
    alert(error.message || 'Oracle не смог распределить Доверие.');
  }
}

async function runAutoPresenceDistribution() {
  try {
    const result = await requestOracle('/api/oracle/auto-presences', {
      account: state.account,
      plan: state.plan,
    });
    state.plan = normalizePlan(result.plan, state.account);
    saveState();
    await render();
    const summary = result.summary || {};
    alert(
      'План Веяний рассчитан.\\n' +
      'Новых уровней: ' + (summary.addedLevels || 0) + '\\n' +
      'Прирост модификаторов: +' + (summary.addedPercentPoints || 0) + ' п.п.'
    );
  } catch (error) {
    alert(error.message || 'Oracle не смог распределить жетоны Веяний.');
  }
}

async function runFullAutoDistribute() {
  try {
    const result = await requestOracle('/api/oracle/auto-distribute', {
      account: state.account,
      plan: state.plan,
    });
    state.plan = normalizePlan(result.plan, state.account);
    saveState();
    await render();
    const presenceAdded = result.summary?.presences?.addedLevels || 0;
    const bondAdded = result.summary?.bonds?.addedLevels || 0;
    const expLevels = result.summary?.talents?.expLevels || 0;
    if (presenceAdded || bondAdded || expLevels) alert('Авторасчёт готов.\\nВеяния: +' + presenceAdded + ' уровн.\\nКровные узы: +' + bondAdded + ' уровн.\\nТаланты за личный опыт: +' + expLevels + ' уровн.');
  } catch (error) {
    alert(error.message || 'Oracle не смог распределить ресурсы.');
  }
}

// Применение плана и проверка ресурсов выполняются серверным Oracle.
async function commitPlanToAccount() {
  try {
    const result = await requestOracle('/api/oracle/commit-plan', {
      account: state.account,
      plan: state.plan,
    });
    if (!result.ok) {
      const detail = result.error?.missingItems?.map(item => {
        const itemName = tName('item', GAME_DB.items.find(entry => entry.id === item.itemId)?.name || item.itemId);
        return `${itemName}: ещё ${item.need}`;
      }).join('\\n');
      alert(detail ? `${result.error.message}\\n${detail}` : (result.error?.message || 'Oracle отклонил план.'));
      return;
    }

    state.account = normalizeAccountData(result.account);
    state.plan = createBlankPlan(state.account);
    saveState();
    await render();
    alert('План проверен Oracle и применён. Ресурсы и предметы списаны из профиля.');
  } catch (error) {
    alert(error.message || 'Oracle не смог применить план. Данные профиля не изменены.');
  }
}

function explainGameConnection() {
  alert('Калькулятор не подключается к игровому аккаунту. Вручную внеси значения из игры — кровь, очки, уровни, таланты и предметы. Render Oracle рассчитает план на сервере и вернёт результат. Пароль от игры не нужен.');
}

// Единая точка вызова Oracle. При ошибке сети серверный расчёт не подменяется локальным.
let oracleSnapshot = null;
let oracleRequestSerial = 0;

async function requestOracle(endpoint, payload) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.ok) {
    throw new Error(body?.error?.message || `Oracle недоступен (HTTP ${response.status}).`);
  }
  return body.result;
}

// Главный рендер вкладок: сначала серверный расчёт, затем отображение ответа Oracle.
async function render() {
  const root = document.getElementById('app');
  if (!root) return;
  bindNumericPad();
  const renderId = ++oracleRequestSerial;
  applyTheme();

  let oracle;
  try {
    oracle = await requestOracle('/api/oracle/calculate', {
      account: state.account,
      plan: state.plan,
    });
  } catch (error) {
    if (renderId !== oracleRequestSerial) return;
    oracleSnapshot = null;
    root.innerHTML = `
      <div class="app-shell">
        <section class="card card-gold">
          <div class="card-title">Oracle временно недоступен</div>
          <p class="row-sub">${String(error.message || 'Не удалось получить серверный расчёт.').replace(/</g, '&lt;')}</p>
          <p class="row-sub">Локальный fallback отключён: неподтверждённые цифры не будут показаны как результат Oracle.</p>
          <button class="btn btn-primary" id="oracle-retry">Повторить запрос</button>
        </section>
      </div>`;
    root.querySelector('#oracle-retry')?.addEventListener('click', render);
    return;
  }
  if (renderId !== oracleRequestSerial) return;
  oracleSnapshot = oracle;

  const db = getDbContext();
  const report = oracle.report;

  const tabs = [
    ['dominance', '👑 Господство'],
    ['conclave', '🏛 Конклав и Сад'],
    ['levels', '🩸 Уровни и Кровь'],
    ['talents', '📜 Таланты и Опыт'],
    ['auras', '✨ Вдохновения и Веяния'],
    ['bonds', '🔗 Кровные узы'],
    ['skins', '🎭 Облики'],
    ['summon', '➕ Призыв'],
    ['bag', '🎒 Сумка и Очки'],
  ];

  root.innerHTML = `
    <div class="app-shell">
      <header class="top-bar">
        <div class="brand-block">
          <div class="brand-crest">VD</div>
          <div>
            <div class="brand-title">Vampire Dominion</div>
            <div class="brand-sub">${state.profile.name} · ${state.profile.server || 'сервер не указан'} · ручной профиль · Oracle v${oracle.meta.oracleVersion}</div>
          </div>
        </div>
        <div class="top-actions">
          <img class="profile-avatar" src="${getIconUrl(GAME_DB.wardens.find(w => w.id === Number(state.profile.avatarId))?.icon_path || GAME_DB.wardens[0]?.icon_path)}" alt="Портрет" />
          <select class="select profile-avatar-select" id="profile-avatar-select" aria-label="Портрет">
            ${GAME_DB.wardens.map(w => `<option value="${w.id}" ${Number(state.profile.avatarId) === w.id ? 'selected' : ''}>${tName('warden', w.name)}</option>`).join('')}
          </select>
          <button class="btn btn-sm" id="btn-profile-edit">Профиль</button>
          <select class="select account-switch" id="account-switcher" aria-label="Аккаунт">
            ${state.accounts.map(a => `<option value="${String(a.id).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}" ${String(a.id) === String(state.activeAccountId) ? 'selected' : ''}>${String(a.name || 'Аккаунт').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')} · ${String(a.server || 'сервер не указан').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</option>`).join('')}
          </select>
          <button class="btn btn-sm" id="btn-new-account">＋ Аккаунт</button>
          <button class="btn btn-sm" id="btn-game-connect">🔗 Игра</button>
          <button class="btn btn-gold btn-sm" id="btn-auto-all">⚡ Авторасчёт</button>
          <button class="btn btn-sm" id="btn-theme">${state.settings.theme === 'light' ? '☀ Светлая' : '☾ Тёмная'}</button>
          <button class="btn btn-sm" id="btn-lang">${state.lang.toUpperCase()}</button>
          <button class="btn btn-sm" id="btn-export">💾 Экспорт</button>
          <button class="btn btn-sm" id="btn-import">📂 Импорт</button>
          <button class="btn btn-sm" id="btn-import-helper">🧩 Импорт дампа</button>
        </div>
      </header>

      <nav class="nav-tabs">
        ${tabs.map(([id, label]) => `
          <button class="tab-btn ${state.activeTab === id ? 'active' : ''}" data-tab="${id}">${label}</button>
        `).join('')}
      </nav>

      <main id="tab-view">
        ${oracle.warnings?.length ? `<section class="card"><div class="card-title">Точность расчёта</div>${oracle.warnings.map(item => `<div class="row-sub">⚠ ${item.message}</div>`).join('')}</section>` : ''}
        ${renderActiveTab(db, report, oracle)}
      </main>
      <footer class="app-footnote">
        <span>CRIMSON OBSIDIAN</span><span>Server Oracle · ручной ввод данных · без связи с игровым аккаунтом</span>
      </footer>
    </div>
  `;

  bindEvents(db);
}

function renderActiveTab(db, report, oracle) {
  switch (state.activeTab) {
    case 'dominance': return renderDominanceTab(db, report);
    case 'conclave': return renderConclaveGardenTab(db, report, oracle);
    case 'levels': return renderLevelsTab(db, report, oracle);
    case 'talents': return renderTalentsTab(db, oracle);
    case 'auras': return renderAurasPresencesTab(db, oracle);
    case 'bonds': return renderBondsTab(db, oracle);
    case 'skins': return renderSkinsTab(db, oracle);
    case 'summon': return renderSummonTab(db, oracle);
    case 'bag': return renderBagTab(db, report, oracle);
    default: return renderDominanceTab(db, report);
  }
}

function renderDominanceTab(db, report) {
  return `
    <section class="card card-gold">
      <div class="card-head">
        <div>
          <div class="card-title">Сводный прирост Господства</div>
          <div class="row-sub">Прирост Господства и отдельные процентные модификаторы</div>
        </div>
        <div class="gain-pill">+${fmt(report.gain.total)}</div>
      </div>
      <div class="grid-4" style="margin-bottom: 12px;">
        <div class="card" style="margin:0; padding:10px;">
          <div class="row-sub">Конклав</div>
          <div class="row-name" style="color:var(--ok)">+${fmt(report.gain.conclave)}</div>
        </div>
        <div class="card" style="margin:0; padding:10px;">
          <div class="row-sub">Сад (Двор)</div>
          <div class="row-name" style="color:var(--ok)">+${fmt(report.gain.courtyard)}</div>
        </div>
        <div class="card" style="margin:0; padding:10px;">
          <div class="row-sub">Уровни смотрителей</div>
          <div class="row-name" style="color:var(--ok)">+${fmt(report.gain.levels)}</div>
        </div>
        <div class="card" style="margin:0; padding:10px;">
          <div class="row-sub">Кровные узы</div>
          <div class="row-name" style="color:var(--ok)">+${fmt(report.gain.bonds)}</div>
        </div>
      </div>
      ${report.modifiers ? `
      <div class="card" style="margin:12px 0 0; padding:12px;">
        <div class="card-title">✨ Модификаторы аур и Веяний</div>
        <div class="row-sub">Отдельно от абсолютного прироста Господства — проценты не складываются с очками напрямую.</div>
        <div class="grid-4" style="margin-top:10px;">
          ${['strength','allure','intellect','spirit'].map((attr, index) => {
            const labels = ['Сила','Харизма','Интеллект','Воля'];
            const auras = report.modifiers.auras.totalByAttribute[attr] || 0;
            const presence = report.modifiers.presences[attr] || 0;
            return `<div><div class="row-sub">${labels[index]}</div><div class="row-name">Ауры ${auras.toFixed(1)}%</div><div class="row-sub">Веяния ${presence.toFixed(1)}%</div></div>`;
          }).join('')}
        </div>
        <div class="row-sub" style="margin-top:8px;">Ауры: таланты ${Object.values(report.modifiers.auras.talent).reduce((a,b)=>a+b,0).toFixed(1)}% · книги ${Object.values(report.modifiers.auras.book).reduce((a,b)=>a+b,0).toFixed(1)}%</div>
      </div>` : ''}
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button class="btn btn-gold" id="btn-quick-run">⚡ Распределить все ресурсы оптимально</button>
        <button class="btn btn-primary" id="btn-commit-plan">✅ Применить план и списать ресурсы</button>
        <button class="btn" id="btn-reset-plan">↺ Сбросить план</button>
      </div>
    </section>

    <section class="card game-sync-card">
      <div class="card-head">
        <div>
          <span class="card-title">🔗 Подключение игрового аккаунта</span>
          <div class="row-sub">Автосинхронизация требует официального API или экспорта от разработчика. В эталонном проекте такой авторизации нет.</div>
        </div>
        <span class="badge">Локальный режим</span>
      </div>
      <button class="btn btn-sm" id="btn-game-connect-panel">Проверить способ подключения</button>
      <div class="row-sub" style="margin-top:8px;">Не вводи пароль от игры в сторонний калькулятор. Импорт и экспорт JSON доступны в верхней панели.</div>
    </section>

    <section class="card">
      <div class="card-head">
        <span class="card-title">Ресурсы аккаунта</span>
        <span class="badge badge-gold">Локальное сохранение активно</span>
      </div>
      <div class="grid-2">
        <div>
          <label class="row-sub">🩸 Кровь аккаунта</label>
          <input type="number" class="input res-input" data-res="blood" value="${state.account.blood}" />
        </div>
        <div>
          <label class="row-sub">🏛 Очки Конклава</label>
          <input type="number" class="input res-input" data-res="conclaveExp" value="${state.account.conclaveExp}" />
        </div>
        <div>
          <label class="row-sub">🌿 Очки Сада</label>
          <input type="number" class="input res-input" data-res="courtyardExp" value="${state.account.courtyardExp}" />
        </div>
        <div>
          <label class="row-sub">🌿 Текущий уровень Сада (1–210)</label>
          <input type="number" class="input res-input" data-res="courtyardLvl" min="0" max="210" value="${state.account.courtyardLvl}" />
        </div>
        <div>
          <label class="row-sub">🛡 Уровень Гильдии</label>
          <input type="number" class="input guild-input" data-guild="level" min="0" max="999" value="${state.account.guildProgress?.level || 0}" />
        </div>
        <div>
          <label class="row-sub">🛡 Опыт текущего уровня</label>
          <input type="number" class="input guild-input" data-guild="exp" min="0" value="${state.account.guildProgress?.exp || 0}" />
        </div>
        <div>
          <label class="row-sub">🛡 Опыт следующего уровня</label>
          <input type="number" class="input guild-input" data-guild="nextLevelExp" min="0" value="${state.account.guildProgress?.nextLevelExp || 0}" />
        </div>
      </div>
    </section>

    <section class="card">
      <div class="card-head">
        <span class="card-title">Калькуляторы событий (из Сумки)</span>
      </div>
      <div class="grid-2">
        <div class="item-row">
          <div class="row-info">
            <div class="row-name">💖 Близость (в среднем)</div>
            <div class="row-sub">Минимум: ${fmt(report.bagCalculators.intimacy.minimum)} · Максимум: ${fmt(report.bagCalculators.intimacy.maximum)}</div>
          </div>
          <div class="gain-pill">${fmt(report.bagCalculators.intimacy.expected)}</div>
        </div>
        <div class="item-row">
          <div class="row-info">
            <div class="row-name">🌹 Влечение (в среднем)</div>
            <div class="row-sub">Минимум: ${fmt(report.bagCalculators.attraction.minimum)} · Максимум: ${fmt(report.bagCalculators.attraction.maximum)}</div>
          </div>
          <div class="gain-pill">${fmt(report.bagCalculators.attraction.expected)}</div>
        </div>
        <div class="item-row">
          <div class="row-info">
            <div class="row-name">🛡 Опыт Гильдии (с лимитом 3 дня вложений)</div>
            <div class="row-sub">Вёдра, сундуки и 3 лучших вложения</div>
          </div>
          <div class="gain-pill">${fmt(report.bagCalculators.guildExp.expected)}</div>
        </div>
      </div>
    </section>
  `;
}

function renderConclaveGardenTab(db, report, oracle) {
  const courtUpgrade = oracle.courtyardUpgrade;
  return `
    <section class="card card-gold">
      <div class="card-head">
        <div>
          <div class="card-title">🏛 Конклав (180 уровней)</div>
          <div class="row-sub">Потрачено: ${fmt(report.spent.conclaveExp)} из ${fmt(state.account.conclaveExp)} очков</div>
        </div>
        <button class="btn btn-gold btn-sm" id="btn-auto-conclave">⚡ Распределить Конклав</button>
      </div>
      ${ATTRIBUTES.map(attr => {
        const cur = state.account.conclave[attr] ?? 0;
        const tgt = Math.max(cur, state.plan.conclave[attr] ?? cur);
        const wCount = db.wardens.filter(w => state.account.ownedWardens[w.id] && w.attributes.includes(attr)).length || 1;
        const br = oracle.conclaveBranches[attr];
        return `
          <div class="item-row">
            <span class="dot ${attr}" style="width:14px;height:14px;"></span>
            <div class="row-info">
              <div class="row-name">${tName('attribute', attr)} (ур. ${cur} → ${tgt})</div>
              <div class="row-sub">Бонус смотрителям: +${fmt(br.flatBonusDelta)} · Книги: +${br.bookPercentDelta.toFixed(1)}% · Цена: ${fmt(br.spent)}</div>
            </div>
            <div class="row-controls">
              <span class="badge badge-ok">+${fmt(br.directAttributeGain)}</span>
              <input type="number" class="input stepper-input conc-target" data-attr="${attr}" min="${cur}" max="180" value="${tgt}" />
            </div>
          </div>
        `;
      }).join('')}
    </section>

    <section class="card">
      <div class="card-head">
        <div>
          <div class="card-title">🌿 Сад / Двор (210 уровней)</div>
          <div class="row-sub">Потрачено: ${fmt(courtUpgrade.spent)} из ${fmt(state.account.courtyardExp)} очков сада</div>
        </div>
        <div class="row-controls">
          <span class="gain-pill">+${fmt(courtUpgrade.totalGain)}</span>
          <input type="number" class="input stepper-input" id="inp-courtyard-target" min="${state.account.courtyardLvl}" max="210" value="${state.plan.courtyardToLvl}" />
        </div>
      </div>
      <div class="row-sub">
        Сила: +${fmt(courtUpgrade.gain.strength)} · Харизма: +${fmt(courtUpgrade.gain.allure)} · Интеллект: +${fmt(courtUpgrade.gain.intellect)} · Воля: +${fmt(courtUpgrade.gain.spirit)}
      </div>
    </section>
  `;
}

function renderLevelsTab(db, report, oracle) {
  const ownedIds = Object.keys(state.account.ownedWardens).map(Number);
  return `
    <section class="card card-gold">
      <div class="card-head">
        <div>
          <div class="card-title">🩸 Уровни и Прорывы смотрителей (${ownedIds.length} из ${db.wardens.length})</div>
          <div class="row-sub">Расход Крови: ${fmt(report.spent.blood)} из ${fmt(state.account.blood)}</div>
        </div>
        <div class="gain-pill">+${fmt(report.gain.levels)}</div>
      </div>
      ${db.wardens.filter(w => state.account.ownedWardens[w.id]).map(w => {
        const ow = state.account.ownedWardens[w.id];
        const tgt = Math.max(ow.level, state.plan.levels[w.id] ?? ow.level);
        const upg = oracle.wardens[w.id]?.levelUpgrade;
        const prom = db.promotes.find(p => p.id === (ow.promoteId || 1));
        return `
          <div class="item-row">
            <img class="avatar" src="${getIconUrl(w.icon_path, state.preferLocalIcons)}" alt="" loading="lazy" />
            <div class="row-info">
              <div class="row-name">${tName('warden', w.name)} ${attrDotsHtml(w.attributes)}</div>
              <div class="row-sub">
                Ступень: ${tName('warden_promote', prom?.name)} (до ${prom?.max_warden_lvl} ур.) · Кровь: ${fmt(upg.bloodSpent)}
                ${!upg.canPromote ? `<span style="color:var(--warn)"> · Нужны предметы прорыва</span>` : ''}
              </div>
            </div>
            <div class="row-controls">
              ${upg.baseGain > 0 ? `<span class="badge badge-ok">+${fmt(upg.baseGain)}</span>` : ''}
              <select class="select promote-select" data-wid="${w.id}" style="width:125px;">
                ${db.promotes.map(p => `<option value="${p.id}" ${p.id === (ow.promoteId || 1) ? 'selected' : ''}>${tName('warden_promote', p.name)}</option>`).join('')}
              </select>
              <input type="number" class="input stepper-input lvl-target" data-wid="${w.id}" min="${ow.level}" max="450" value="${tgt}" />
            </div>
          </div>
        `;
      }).join('')}
    </section>
  `;
}

function renderTalentsTab(db, oracle) {
  return `
    <section class="card card-gold">
      <div class="card-head">
        <div>
          <div class="card-title">📜 Таланты, Рукописи и Опыт смотрителей</div>
          <div class="row-sub">200 опыта = 1 очко таланта · планирование свитков и рукописей по приросту Господства</div>
        </div>
        <button class="btn btn-primary btn-sm" id="btn-auto-talents">⚡ Распределить таланты</button>
      </div>
      ${oracle.talentPlan?.plannedLevels ? `<div class="row-sub">В текущем плане: ${oracle.talentPlan.plannedLevels} уровней · свитки ${oracle.talentPlan.scrollLevels} · рукописи ${oracle.talentPlan.scriptLevels}</div>` : ''}
      ${db.wardens.map(w => {
        const isOwned = !!state.account.ownedWardens[w.id];
        const owned = state.account.ownedWardens[w.id];
        const talentResult = oracle.wardens[w.id];
        const baseStars = talentResult.baseTalentStars;
        const bonusExp = talentResult.promotionExp;
        const personalExp = talentResult.personalExp;
        const maxTalentLvl = talentResult.maxTalentLevel;
        const dpPoints = talentResult.talentPointsAvailable;
        const trainedStars = talentResult.talentSum;
        return `
          <div class="item-row">
            <img class="avatar" src="${getIconUrl(w.icon_path, state.preferLocalIcons)}" alt="" loading="lazy" />
            <div class="row-info">
              <div class="row-name">${tName('warden', w.name)} ${attrDotsHtml(w.attributes)} ${isOwned ? '<span class="badge badge-ok">В профиле</span>' : '<span class="badge">Не призван</span>'}</div>
              <div class="row-sub">
                Талантов: ${w.talents.length} · Звёзды: <b>${baseStars}★</b> · Текущий вес: <b>${owned ? trainedStars : '—'}</b> · Опыт талантов: ${fmt(personalExp)} + ${fmt(bonusExp)} за прорывы (${dpPoints} очк. доступно)
              </div>
            </div>
            <div class="row-controls">
              <button class="btn btn-sm toggle-owned-warden" data-wid="${w.id}">${isOwned ? 'Убрать' : 'В профиль'}</button>
            </div>
          </div>
          ${owned ? `<details class="talent-editor"><summary>Настроить уровни талантов · ${tName('warden', w.name)}</summary>
            <label class="talent-control"><span>Личный опыт талантов (бонус прорыва учитывается отдельно)</span><input class="input talent-exp" type="number" min="0" step="1" data-wid="${w.id}" value="${owned.exp || 0}" /></label>
            <div class="talent-grid">${w.talents.map((talent, index) => {
              const lvl = owned.talents?.[index] ?? 1;
              return `<label class="talent-control"><span>${tName('attribute', talent.attribute)} · ${talent.stars}★</span><input class="input talent-level" type="number" min="1" max="${maxTalentLvl}" step="1" data-wid="${w.id}" data-pos="${index}" value="${lvl}" /></label>`;
            }).join('')}</div>
          </details>` : ''}
        `;
      }).join('')}
    </section>
  `;
}

function renderAurasPresencesTab(db, oracle) {
  const wardensWithAuras = db.wardens.filter(w => w.auras && w.auras.length > 0);
  const loversWithPresences = db.lovers.filter(l => l.presences && l.presences.length > 0);

  return `
    <section class="card card-gold">
      <div class="card-head">
        <div class="card-title">✨ Вдохновения смотрителей (${wardensWithAuras.length})</div>
      </div>
      ${wardensWithAuras.map(w => `
        <div class="item-row">
          <img class="avatar" src="${getIconUrl(w.icon_path, state.preferLocalIcons)}" alt="" loading="lazy" />
          <div class="row-info">
            <div class="row-name">${tName('warden', w.name)} ${attrDotsHtml(w.attributes)}</div>
            ${w.auras.map(a => {
              const curLvl = state.account.ownedWardens[w.id]?.auras?.[a.id] ?? (a.min_lvl || 0);
              const pct = oracle.wardens[w.id]?.auras?.[a.id]?.percent ?? 0;
              const owned = state.account.ownedWardens[w.id];
              return `<div class="row-sub aura-row">• [${a.aura_type}] Бонус (${a.bonus_type}): <b>${pct.toFixed(1)}%</b> (ур. ${curLvl}${a.max_lvl ? '/' + a.max_lvl : ''})
                ${owned ? `<input class="input mini-level aura-level" type="number" min="${a.min_lvl || 0}" max="${a.max_lvl || curLvl}" data-wid="${w.id}" data-aid="${a.id}" value="${curLvl}" aria-label="Уровень вдохновения" />` : '<span class="row-sub">· добавь смотрителя в профиль для редактирования</span>'}
              </div>`;
            }).join('')}
          </div>
        </div>
      `).join('')}
    </section>

    <section class="card">
      <div class="card-head">
        <div class="card-title">💫 Веяния партнёров (${loversWithPresences.length})</div>
        <button class="btn btn-gold btn-sm" id="btn-auto-presences">⚡ Распределить жетоны</button>
      </div>
      ${loversWithPresences.map(l => `
        <div class="item-row">
          <img class="avatar" src="${getIconUrl(getLoverIconPath(l, state.account.ownedLovers[l.id]), true)}" alt="" loading="lazy" />
          <div class="row-info">
            <div class="row-name">${tName('lover', l.name)} ${attrDotsHtml(l.attributes)}</div>
            ${l.presences.map(p => {
              const curLvl = state.account.ownedLovers[l.id]?.presences?.[p.id] ?? (p.min_lvl || 0);
              const percs = oracle.lovers[l.id]?.presences?.[p.id]?.percents || { strength: 0, allure: 0, intellect: 0, spirit: 0 };
              const owned = state.account.ownedLovers[l.id];
              const targetLvl = state.plan.presences?.[l.id]?.[p.id] ?? curLvl;
              const targetPercs = oracle.lovers[l.id]?.presences?.[p.id]?.percents || percs;
              return `<div class="row-sub presence-row">• [${p.presence_type}] Ур. ${curLvl}/${p.max_lvl}: Сила ${targetPercs.strength}% · Хар. ${targetPercs.allure}% · Инт. ${targetPercs.intellect}% · Воля ${targetPercs.spirit}%
                ${owned ? `<label class="mini-field">Сейчас<input class="input mini-level presence-level" type="number" min="${p.min_lvl || 0}" max="${p.max_lvl || curLvl}" data-lid="${l.id}" data-pid="${p.id}" value="${curLvl}" aria-label="Текущий уровень веяния" /></label>` : '<button class="btn btn-sm toggle-owned-lover" data-lid="' + l.id + '">Добавить партнёра</button>'}
                ${owned && p.presence_type === 'updatable' ? `<label class="mini-field">Цель<input class="input mini-level presence-target" type="number" min="${curLvl}" max="${p.max_lvl || curLvl}" data-lid="${l.id}" data-pid="${p.id}" value="${targetLvl}" aria-label="Целевой уровень веяния" /></label>` : ''}
              </div>`;
            }).join('')}
          </div>
        </div>
      `).join('')}
    </section>
  `;
}

function renderBondsTab(db, oracle) {
  const owned = state.account.ownedLovers;
  const ownedCount = Object.keys(owned).length;
  return `
    <section class="card card-gold">
      <div class="card-head">
        <div>
          <div class="card-title">🔗 Кровные узы и спутники (${ownedCount} в профиле)</div>
          <div class="row-sub">Близость открывает ветви уз; очки Доверия расходуются на уровни. Расчёт выполняет Server Oracle.</div>
          <button class="btn btn-gold btn-sm" id="btn-auto-bonds">⚡ Распределить Доверие</button>
        </div>
      </div>
      ${db.lovers.map(l => {
        const current = owned[l.id];
        if (!current) return `
          <div class="item-row">
            <img class="avatar" src="${getIconUrl(getLoverIconPath(l), true)}" alt="" loading="lazy" />
            <div class="row-info"><div class="row-name">${tName('lover', l.name)}</div><div class="row-sub">${tName('warden', db.wardens.find(w => w.id === l.warden_id)?.name || '—')} · Не добавлен в профиль</div></div>
            <button class="btn btn-sm toggle-owned-lover" data-lid="${l.id}">Добавить</button>
          </div>`;
        const bondPlan = oracle.lovers[l.id]?.bondPlan || getBondPlan(l, current);
        const result = oracle.lovers[l.id]?.bondResult;
        const warden = db.wardens.find(w => w.id === l.warden_id);
        return `
          <details class="lover-panel" open>
            <summary>
              <img class="avatar" src="${getIconUrl(getLoverIconPath(l, current), true)}" alt="" loading="lazy" />
              <span class="lover-summary-name">${tName('lover', l.name)}</span>
              <span class="badge badge-gold">${result.totalGain.toLocaleString('ru-RU')} госп.</span>
            </summary>
            <div class="lover-panel-body">
              <div class="row-sub">Смотритель: ${warden ? tName('warden', warden.name) : '—'} · Прогноз прироста по текущим талантам и уровню</div>
              <div class="grid-2 lover-stats">
                <label><span class="row-sub">Очки Доверия (ресурс)</span><input class="input lover-stat-input" type="number" min="0" data-lid="${l.id}" data-field="affinity" value="${current.affinity || 0}" /></label>
                <label><span class="row-sub">Близость (открывает ветви)</span><input class="input lover-stat-input" type="number" min="0" max="200" data-lid="${l.id}" data-field="closeness" value="${current.closeness || 0}" /></label>
              </div>
              <div class="row-sub bond-summary">Потратится: <b>${fmt(result.spentAffinity)}</b> · Останется: <b>${fmt(result.leftAffinity)}</b> · Прирост: <b>+${fmt(result.totalGain)}</b></div>
              ${result.spentAffinity > (current.affinity || 0) ? '<div class="bond-warning">Недостаточно очков Доверия. Уменьши цели, прежде чем применять план.</div>' : ''}
              <div class="bond-list">
                ${(l.scarlet_bonds || []).map(b => {
                  const st = bondPlan[b.attribute];
                  const detail = result.details.find(x => x.attribute === b.attribute);
                  return `<div class="bond-row">
                    <div class="bond-head"><strong>${tName('attribute', b.attribute)}${b.is_advantage ? ' ★' : ''}</strong><span class="row-sub">${fmt(detail?.totalAttrGain || 0)} госп.</span></div>
                    <div class="grid-2 bond-inputs">
                      <label><span class="row-sub">Уровень ${detail?.unlockedFlat ? '' : `· закрыто до близости ${b.unlock_closeness}`}</span><input class="input bond-target" type="number" min="${st.level}" max="600" data-lid="${l.id}" data-attr="${b.attribute}" data-kind="flat" value="${st.targetLevel}" ${detail?.unlockedFlat ? '' : 'disabled'} /></label>
                      <label><span class="row-sub">Процент ${detail?.unlockedPct ? '' : `· закрыто до близости ${b.unlock_closeness_percent}`}</span><input class="input bond-target" type="number" min="${st.percentLevel}" max="600" data-lid="${l.id}" data-attr="${b.attribute}" data-kind="percent" value="${st.targetPercentLevel}" ${detail?.unlockedPct ? '' : 'disabled'} /></label>
                    </div>
                    <div class="row-sub">Цена: ${fmt((detail?.costFlat || 0) + (detail?.costPct || 0))} · Бонус: +${fmt(detail?.totalAttrGain || 0)}</div>
                  </div>`;
                }).join('')}
              </div>
              <div class="lover-actions"><button class="btn btn-sm toggle-owned-lover" data-lid="${l.id}">Убрать из профиля</button></div>
            </div>
          </details>`;
      }).join('')}
    </section>
  `;
}

function renderSkinsTab(db, oracle) {
  const allWardenSkins = db.wardens.flatMap(w => (w.skins || []).map(s => ({ ...s, ownerType: 'warden', ownerName: tName('warden', w.name) })));
  const allLoverSkins = db.lovers.flatMap(l => (l.skins || []).map(s => ({ ...s, ownerType: 'lover', ownerName: tName('lover', l.name) })));
  const allSkins = [...allWardenSkins, ...allLoverSkins];

  return `
    <section class="card card-gold">
      <div class="card-head">
        <div>
          <div class="card-title">🎭 Облики и Магазин обликов (${allSkins.length})</div>
          <div class="row-sub">Стоимость уровня в ткани: A = 50 (Атлас) · S = 100 (Кашемир) · SS = 200 (Шёлк)</div>
        </div>
      </div>
      ${allSkins.map(s => {
        const result = oracle.skins[s.id];
        return `
        <div class="item-row">
          <img class="avatar" src="${getIconUrl(s.icon_path, state.preferLocalIcons)}" alt="" loading="lazy" />
          <div class="row-info">
            <div class="row-name">${s.ownerName} · <span class="badge badge-gold">${s.quality.toUpperCase()}</span></div>
            <div class="row-sub">${tName(s.ownerType === 'warden' ? 'warden_skin' : 'lover_skin', s.name)} · Опыт магазину: +${result.storeExp} · ${result.fabricPerLevel ?? '—'}/ур. ткани · ${result.purchasable ? `До максимума: ${fmt(result.fabricToMax)} ткани` : 'Нужна карточка'} · Осталось уровней: ${result.levelsRemaining}</div>
          </div>
          <div class="row-controls skin-controls">
            <label class="mini-field">Сейчас<input class="input stepper-input skin-level" type="number" min="0" max="${s.max_lvl}" data-skin-id="${s.id}" value="${result.level}" aria-label="Текущий уровень облика" /></label>
            <label class="mini-field">Цель<input class="input stepper-input skin-target" type="number" min="${result.level}" max="${s.max_lvl}" data-skin-id="${s.id}" value="${state.plan.skins?.[s.id] ?? result.level}" aria-label="Целевой уровень облика" /></label>
          </div>
        </div>
      `;}).join('')}
    </section>
  `;
}

function renderSummonTab(db, oracle) {
  const cands = oracle.summonCandidates;
  return `
    <section class="card card-gold">
      <div class="card-head"><div class="card-title">➕ Доступные для призыва Смотрители (${cands.wardens.length})</div></div>
      ${cands.wardens.map(c => {
        const w = db.wardens.find(x => x.id === c.id);
        const itemObj = c.itemId ? db.items.find(i => i.id === c.itemId) : null;
        return `
          <div class="item-row">
            <img class="avatar" src="${getIconUrl(w?.icon_path, state.preferLocalIcons)}" alt="" loading="lazy" />
            <div class="row-info">
              <div class="row-name">${tName('warden', c.name)} (${c.baseTalentStars}★)</div>
              <div class="row-sub">${itemObj ? `Нужно: ${c.cost} × ${tName('item', itemObj.name)} (в сумке: ${c.have})` : 'Бесплатный призыв (Сюжет / VIP / Событие)'}</div>
            </div>
            <button class="btn btn-sm btn-primary summon-warden" data-wid="${c.id}" ${c.canSummon ? '' : 'disabled'}>${c.canSummon ? 'Призвать' : 'Не хватает'}</button>
          </div>`;
      }).join('')}
    </section>
    <section class="card">
      <div class="card-head"><div class="card-title">💞 Доступные для призыва Возлюбленные (${cands.lovers.length})</div></div>
      ${cands.lovers.map(c => {
        const lover = db.lovers.find(x => x.id === c.id);
        const itemObj = c.itemId ? db.items.find(i => i.id === c.itemId) : null;
        const warden = db.wardens.find(x => x.id === c.wardenId);
        return `
          <div class="item-row">
            <img class="avatar" src="${getIconUrl(getLoverIconPath(lover || {}, null), state.preferLocalIcons)}" alt="" loading="lazy" />
            <div class="row-info">
              <div class="row-name">${tName('lover', c.name)}</div>
              <div class="row-sub">${warden ? `Смотритель: ${tName('warden', warden.name)} · ` : ''}${itemObj ? `Нужно: ${c.cost} × ${tName('item', itemObj.name)} (в сумке: ${c.have})` : 'Бесплатный призыв (Сюжет / Событие)'}${c.hasWarden ? '' : ' · Смотритель ещё не добавлен в профиль'}</div>
            </div>
            <button class="btn btn-sm btn-primary summon-lover" data-lid="${c.id}" ${c.canSummon ? '' : 'disabled'}>${c.canSummon ? 'Призвать' : 'Не хватает'}</button>
          </div>`;
      }).join('')}
    </section>
  `;
}

function renderBagTab(db, report, oracle) {
  const events = oracle.eventCalculators || {};
  const catNames = {
    all: 'Все (237)',
    coins: 'Печати и Жетоны',
    talent: 'Таланты и Рукописи',
    book: 'Книги',
    guild_exp: 'Гильдия',
    clothes: 'Экипировка прорыва',
    intimacy: 'Близость',
    attraction: 'Влечение',
    skin: 'Облики и Ткань',
    league: 'Лига',
  };

  const filteredItems = db.items.filter(it =>
    (state.bagFilter === 'all' || it.category === state.bagFilter) &&
    (!state.searchQuery || tName('item', it.name).toLowerCase().includes(state.searchQuery.toLowerCase()))
  );

  return `
    <section class="card card-gold">
      <div class="card-head"><div class="card-title">🧮 Близость, Влечение и Опыт гильдии</div></div>
      <div class="guild-progress-grid">
        <label>Уровень гильдии<input class="input guild-progress-input" type="number" min="0" data-guild-field="level" value="${state.account.guildProgress?.level || 0}"></label>
        <label>Текущий опыт<input class="input guild-progress-input" type="number" min="0" data-guild-field="exp" value="${state.account.guildProgress?.exp || 0}"></label>
        <label>Опыт следующего уровня<input class="input guild-progress-input" type="number" min="0" data-guild-field="nextLevelExp" value="${state.account.guildProgress?.nextLevelExp || 0}"></label>
      </div>
      <div class="row-sub guild-progress-remaining">До следующего уровня: ${fmt(Math.max(0, (state.account.guildProgress?.nextLevelExp || 0) - (state.account.guildProgress?.exp || 0)))}</div>
      <div class="grid-3 event-calculators">
        <div class="event-metric"><div class="row-sub">Близость</div><strong>${fmt(events.intimacy?.expected || 0)}</strong><small>Мин. ${fmt(events.intimacy?.minimum || 0)} · Макс. ${fmt(events.intimacy?.maximum || 0)}</small></div>
        <div class="event-metric"><div class="row-sub">Влечение</div><strong>${fmt(events.attraction?.expected || 0)}</strong><small>Мин. ${fmt(events.attraction?.minimum || 0)} · Макс. ${fmt(events.attraction?.maximum || 0)}</small></div>
        <div class="event-metric"><div class="row-sub">Опыт гильдии</div><strong>${fmt(events.guildExp?.expected || 0)}</strong><small>Учтено вложений за 3 дня · ${fmt(events.guildExp?.items?.length || 0)} типов предметов</small></div>
      </div>
    </section>
    <section class="card">
      <div class="card-head">
        <div class="card-title">🎒 Инвентарь Сумки <span id="bag-result-count">(${filteredItems.length} предм.)</span></div>
      </div>
      <div class="nav-tabs" style="margin-bottom: 10px;">
        ${Object.entries(catNames).map(([k, label]) => `
          <button class="tab-btn bag-cat-btn ${state.bagFilter === k ? 'active' : ''}" data-cat="${k}">${label}</button>
        `).join('')}
      </div>
      <div style="margin-bottom: 10px;">
        <input type="text" class="input" id="inp-bag-search" placeholder="Поиск предмета по названию..." value="${state.searchQuery}" />
      </div>
      ${filteredItems.map(it => {
        const count = oracle.inventory[it.category]?.items.find(row => row.id === it.id)?.count ?? 0;
        return `
          <div class="item-row bag-item-row">
            <img class="avatar" src="${getIconUrl(it.icon_path, state.preferLocalIcons)}" alt="" loading="lazy" />
            <div class="row-info">
              <div class="row-name">${tName('item', it.name)}</div>
              <div class="row-sub">ID: ${it.id} · Категория: ${catNames[it.category] || it.category}</div>
            </div>
            <div class="row-controls">
              <input type="number" class="input stepper-input bag-item-input" data-iid="${it.id}" min="0" value="${count}" />
            </div>
          </div>
        `;
      }).join('')}
    </section>
  `;
}


let numericPadBound = false;
function openNumericPad(input) {
  if (!input || input.disabled || input.readOnly) return;
  let digits = String(Math.max(0, Math.round(Number(input.value) || 0)));
  let multiplier = 1;
  const min = Number.isFinite(Number(input.min)) && input.min !== '' ? Number(input.min) : 0;
  const max = Number.isFinite(Number(input.max)) && input.max !== '' ? Number(input.max) : 1_000_000_000_000_000;
  const label = input.getAttribute('aria-label')
    || input.closest('label')?.querySelector('span')?.textContent
    || input.closest('.item-row')?.querySelector('.row-name')?.textContent
    || input.dataset.res
    || 'Введите значение';

  let sheet = document.getElementById('vd-number-sheet');
  if (!sheet) {
    sheet = document.createElement('div');
    sheet.id = 'vd-number-sheet';
    sheet.className = 'number-sheet hidden';
    sheet.innerHTML = `
      <div class="number-sheet-backdrop" data-np-close></div>
      <section class="number-sheet-panel" role="dialog" aria-modal="true" aria-label="Ввод значения">
        <div class="number-sheet-handle"></div>
        <div class="number-sheet-head">
          <div><div class="number-sheet-title" id="np-title"></div><div class="number-sheet-subtitle">Точное значение или сокращённая запись</div></div>
          <button class="number-sheet-close" type="button" data-np-close aria-label="Закрыть">×</button>
        </div>
        <output class="number-sheet-display" id="np-display">0</output>
        <div class="number-sheet-units">
          <button type="button" data-np-unit="1000">K</button>
          <button type="button" data-np-unit="1000000">M</button>
          <button type="button" data-np-unit="1000000000">B</button>
          <button type="button" data-np-unit="1000000000000">T</button>
        </div>
        <div class="number-sheet-keys">
          ${[7,8,9,4,5,6,1,2,3].map(n => `<button type="button" data-np-digit="${n}">${n}</button>`).join('')}
          <button type="button" class="np-clear" data-np-clear>Очистить</button>
          <button type="button" data-np-digit="0">0</button>
          <button type="button" data-np-back>⌫</button>
        </div>
        <div class="number-sheet-actions">
          <button type="button" class="btn" data-np-close>Отмена</button>
          <button type="button" class="btn btn-primary" id="np-confirm">Готово</button>
        </div>
      </section>`;
    document.body.appendChild(sheet);
  }

  const display = sheet.querySelector('#np-display');
  const update = () => {
    const value = Math.min(max, Math.max(0, (Number(digits) || 0) * multiplier));
    display.textContent = value.toLocaleString(state.lang === 'en' ? 'en-US' : 'ru-RU');
    sheet.querySelectorAll('[data-np-unit]').forEach(button => {
      button.classList.toggle('active', Number(button.dataset.npUnit) === multiplier);
    });
  };
  sheet.querySelector('#np-title').textContent = label;
  sheet.classList.remove('hidden');
  update();

  sheet.onclick = event => {
    const target = event.target.closest('button,[data-np-close]');
    if (!target) return;
    if (target.hasAttribute('data-np-close')) {
      sheet.classList.add('hidden');
      return;
    }
    if (target.dataset.npDigit !== undefined) {
      digits = (digits === '0' ? '' : digits) + target.dataset.npDigit;
    } else if (target.hasAttribute('data-np-clear')) {
      digits = '0'; multiplier = 1;
    } else if (target.hasAttribute('data-np-back')) {
      digits = digits.length > 1 ? digits.slice(0, -1) : '0';
    } else if (target.dataset.npUnit) {
      multiplier = Number(target.dataset.npUnit);
    } else if (target.id === 'np-confirm') {
      const value = Math.min(max, Math.max(min, (Number(digits) || 0) * multiplier));
      input.value = String(Math.round(value));
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      sheet.classList.add('hidden');
      return;
    }
    update();
  };
}

function bindNumericPad() {
  if (numericPadBound) return;
  numericPadBound = true;
  document.addEventListener('pointerdown', event => {
    const input = event.target.closest('input[type="number"], input[inputmode="numeric"]');
    if (!input || input.disabled || input.readOnly || input.id === 'inp-bag-search') return;
    event.preventDefault();
    openNumericPad(input);
  }, true);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') document.getElementById('vd-number-sheet')?.classList.add('hidden');
  });
}

function bindEvents(db) {
  document.getElementById('account-switcher')?.addEventListener('change', event => switchAccount(event.target.value));
  document.getElementById('btn-profile-edit')?.addEventListener('click', editProfile);
  document.getElementById('profile-avatar-select')?.addEventListener('change', event => { state.profile.avatarId = Number(event.target.value); saveState(); render(); });
  document.getElementById('btn-theme')?.addEventListener('click', () => { state.settings.theme = state.settings.theme === 'light' ? 'dark' : 'light'; saveState(); applyTheme(); render(); });
  document.getElementById('btn-new-account')?.addEventListener('click', createNewAccount);
  document.getElementById('btn-game-connect')?.addEventListener('click', explainGameConnection);
  document.getElementById('btn-game-connect-panel')?.addEventListener('click', explainGameConnection);
  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.activeTab = btn.dataset.tab;
      saveState();
      render();
    });
  });

  document.getElementById('btn-lang')?.addEventListener('click', () => {
    state.lang = state.lang === 'ru' ? 'en' : 'ru';
    saveState();
    render();
  });

  document.getElementById('btn-auto-all')?.addEventListener('click', runFullAutoDistribute);
  document.getElementById('btn-auto-talents')?.addEventListener('click', runAutoTalentDistribution);
  document.getElementById('btn-auto-presences')?.addEventListener('click', runAutoPresenceDistribution);
  document.getElementById('btn-auto-bonds')?.addEventListener('click', runAutoBondDistribution);
  document.getElementById('btn-quick-run')?.addEventListener('click', runFullAutoDistribute);
  document.getElementById('btn-commit-plan')?.addEventListener('click', commitPlanToAccount);

  document.getElementById('btn-reset-plan')?.addEventListener('click', () => {
    state.plan = {
      conclave: { ...state.account.conclave },
      courtyardToLvl: state.account.courtyardLvl,
      levels: {},
      talents: {},
      bonds: {},
      presences: {},
      skins: {},
      summons: { wardens: [], lovers: [] },
    };
    saveState();
    render();
  });

  document.getElementById('btn-auto-conclave')?.addEventListener('click', () => {
    requestOracle('/api/oracle/auto-conclave', { account: state.account, plan: state.plan }).then(res => {
      state.plan.conclave = res.levels;
      saveState();
      render();
    }).catch(error => alert(error.message || 'Oracle не смог распределить Конклав.'));
  });

  document.querySelectorAll('.guild-progress-input').forEach(inp => {
    inp.addEventListener('change', () => {
      const field = inp.dataset.guildField;
      if (!['exp', 'level', 'nextLevelExp'].includes(field)) return;
      state.account.guildProgress ||= { exp: 0, level: 0, nextLevelExp: 0 };
      state.account.guildProgress[field] = Math.max(0, Number(inp.value) || 0);
      saveState();
      render();
    });
  });

  document.querySelectorAll('.res-input').forEach(inp => {
    inp.addEventListener('change', () => {
      const k = inp.dataset.res;
      state.account[k] = Math.max(0, Number(inp.value) || 0);
      saveState();
      render();
    });
  });

  document.querySelectorAll('.conc-target').forEach(inp => {
    inp.addEventListener('change', () => {
      const attr = inp.dataset.attr;
      state.plan.conclave[attr] = Math.min(180, Math.max(state.account.conclave[attr] || 0, Number(inp.value) || 0));
      saveState();
      render();
    });
  });

  document.getElementById('inp-courtyard-target')?.addEventListener('change', e => {
    state.plan.courtyardToLvl = Math.min(210, Math.max(state.account.courtyardLvl, Number(e.target.value) || 0));
    saveState();
    render();
  });

  document.querySelectorAll('.lvl-target').forEach(inp => {
    inp.addEventListener('change', () => {
      const wId = inp.dataset.wid;
      state.plan.levels[wId] = Math.min(450, Math.max(state.account.ownedWardens[wId]?.level || 1, Number(inp.value) || 1));
      saveState();
      render();
    });
  });

  document.querySelectorAll('.promote-select').forEach(sel => {
    sel.addEventListener('change', () => {
      const wId = sel.dataset.wid;
      if (state.account.ownedWardens[wId]) {
        state.account.ownedWardens[wId].promoteId = Number(sel.value);
        saveState();
        render();
      }
    });
  });

  document.querySelectorAll('.toggle-owned-warden').forEach(btn => {
    btn.addEventListener('click', () => {
      const wId = Number(btn.dataset.wid);
      if (state.account.ownedWardens[wId]) {
        delete state.account.ownedWardens[wId];
      } else {
        state.account.ownedWardens[wId] = { level: 1, promoteId: 1, exp: 0, talents: {}, auras: {} };
      }
      saveState();
      render();
    });
  });


  document.querySelectorAll('.talent-level').forEach(inp => {
    inp.addEventListener('change', () => {
      const wid = Number(inp.dataset.wid);
      const pos = Number(inp.dataset.pos);
      const owned = state.account.ownedWardens[wid];
      if (!owned) return;
      const w = db.wardens.find(x => x.id === wid);
      const cap = db.warden_promotes.find(p => p.id === (owned.promoteId || 1))?.max_talent_lvl ?? 40;
      owned.talents ||= {};
      owned.talents[pos] = Math.min(cap, Math.max(1, Number(inp.value) || 1));
      saveState();
      render();
    });
  });

  document.querySelectorAll('.talent-exp').forEach(inp => {
    inp.addEventListener('change', () => {
      const wid = Number(inp.dataset.wid);
      const owned = state.account.ownedWardens[wid];
      if (!owned) return;
      owned.exp = Math.max(0, Number(inp.value) || 0);
      saveState();
      render();
    });
  });

  document.querySelectorAll('.aura-level').forEach(inp => {
    inp.addEventListener('change', () => {
      const wid = Number(inp.dataset.wid), aid = Number(inp.dataset.aid);
      const owned = state.account.ownedWardens[wid];
      const template = db.wardens.find(w => w.id === wid)?.auras?.find(a => a.id === aid);
      if (!owned || !template) return;
      owned.auras ||= {};
      owned.auras[aid] = Math.min(template.max_lvl ?? 999, Math.max(template.min_lvl || 0, Number(inp.value) || 0));
      saveState();
      render();
    });
  });

  document.querySelectorAll('.presence-target').forEach(inp => {
    inp.addEventListener('change', () => {
      const lid = Number(inp.dataset.lid), pid = Number(inp.dataset.pid);
      const lover = db.lovers.find(item => item.id === lid);
      const template = lover?.presences?.find(item => item.id === pid);
      const owned = state.account.ownedLovers[lid];
      if (!template || !owned || template.presence_type !== 'updatable') return;
      const current = Math.max(template.min_lvl || 0, Number(owned.presences?.[pid] ?? template.min_lvl ?? 0));
      const target = Math.max(current, Math.min(template.max_lvl || current, Math.round(Number(inp.value) || current)));
      state.plan.presences ||= {};
      state.plan.presences[lid] ||= {};
      if (target > current) state.plan.presences[lid][pid] = target;
      else {
        delete state.plan.presences[lid][pid];
        if (!Object.keys(state.plan.presences[lid]).length) delete state.plan.presences[lid];
      }
      saveState();
      render();
    });
  });

  document.querySelectorAll('.presence-level').forEach(inp => {
    inp.addEventListener('change', () => {
      const lid = Number(inp.dataset.lid), pid = Number(inp.dataset.pid);
      const owned = state.account.ownedLovers[lid];
      const template = db.lovers.find(l => l.id === lid)?.presences?.find(p => p.id === pid);
      if (!owned || !template) return;
      owned.presences ||= {};
      owned.presences[pid] = Math.min(template.max_lvl ?? 999, Math.max(template.min_lvl || 0, Number(inp.value) || 0));
      saveState();
      render();
    });
  });

  document.querySelectorAll('.skin-target').forEach(inp => {
    inp.addEventListener('change', () => {
      const id = Number(inp.dataset.skinId);
      const skin = [...db.wardens.flatMap(w => w.skins || []), ...db.lovers.flatMap(l => l.skins || [])].find(item => item.id === id);
      if (!skin) return;
      const current = Math.max(0, Number(state.account.skins[id]) || 0);
      state.plan.skins ||= {};
      const target = Math.min(skin.max_lvl || 10, Math.max(current, Number(inp.value) || current));
      if (target > current) state.plan.skins[id] = target;
      else delete state.plan.skins[id];
      saveState();
      render();
    });
  });

  document.querySelectorAll('.skin-level').forEach(inp => {
    inp.addEventListener('change', () => {
      const id = Number(inp.dataset.skinId);
      const skin = [...db.wardens.flatMap(w => w.skins || []), ...db.lovers.flatMap(l => l.skins || [])].find(s => s.id === id);
      if (!skin) return;
      state.account.skins[id] = Math.min(skin.max_lvl || 10, Math.max(0, Number(inp.value) || 0));
      saveState();
      render();
    });
  });

  document.querySelectorAll('.summon-warden').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.wid);
      const candidate = oracle.summonCandidates.wardens.find(item => item.id === id);
      if (!candidate?.canSummon) { alert('Не хватает предметов для призыва.'); return; }
      try {
        const result = await requestOracle('/api/oracle/summon', { account: state.account, wardenId: id });
        if (!result.ok) { alert(result.error?.message || 'Oracle отклонил призыв.'); return; }
        state.account = normalizeAccountData(result.account);
        saveState();
        render();
      } catch (error) {
        alert(error.message || 'Oracle не смог выполнить призыв.');
      }
    });
  });

  document.querySelectorAll('.summon-lover').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.lid);
      const candidate = oracle.summonCandidates.lovers.find(item => item.id === id);
      if (!candidate?.canSummon) { alert('Не хватает предметов для призыва.'); return; }
      try {
        const result = await requestOracle('/api/oracle/summon-lover', { account: state.account, loverId: id });
        if (!result.ok) { alert(result.error?.message || 'Oracle отклонил призыв.'); return; }
        state.account = normalizeAccountData(result.account);
        saveState();
        render();
      } catch (error) {
        alert(error.message || 'Oracle не смог выполнить призыв.');
      }
    });
  });

  document.querySelectorAll('.toggle-owned-lover').forEach(btn => {
    btn.addEventListener('click', () => {
      const lid = Number(btn.dataset.lid);
      const lover = db.lovers.find(x => x.id === lid);
      if (!lover) return;
      if (state.account.ownedLovers[lid]) {
        delete state.account.ownedLovers[lid];
        delete state.plan.bonds[lid];
      } else {
        state.account.ownedLovers[lid] = { affinity: 0, closeness: 0, sex: lover.fixed_sex || 'female', presences: {}, bonds: {} };
      }
      saveState();
      render();
    });
  });

  document.querySelectorAll('.lover-stat-input').forEach(inp => {
    inp.addEventListener('change', () => {
      const lid = Number(inp.dataset.lid);
      const field = inp.dataset.field;
      const owned = state.account.ownedLovers[lid];
      if (!owned || !['affinity', 'closeness'].includes(field)) return;
      owned[field] = Math.max(0, Number(inp.value) || 0);
      saveState();
      render();
    });
  });

  document.querySelectorAll('.bond-target').forEach(inp => {
    inp.addEventListener('change', () => {
      const lid = Number(inp.dataset.lid);
      const attr = inp.dataset.attr;
      const kind = inp.dataset.kind;
      const lover = db.lovers.find(x => x.id === lid);
      const owned = state.account.ownedLovers[lid];
      if (!lover || !owned) return;
      const bond = (lover.scarlet_bonds || []).find(x => x.attribute === attr);
      if (!bond) return;
      const plan = getBondPlan(lover, owned);
      const value = Math.min(600, Math.max(0, Number(inp.value) || 0));
      const unlocked = kind === 'flat' ? owned.closeness >= bond.unlock_closeness : owned.closeness >= bond.unlock_closeness_percent;
      if (!unlocked) return;
      if (kind === 'flat') plan[attr].targetLevel = Math.max(plan[attr].level, value);
      else plan[attr].targetPercentLevel = Math.max(plan[attr].percentLevel, value);
      saveState();
      render();
    });
  });

  document.querySelectorAll('.bag-cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.bagFilter = btn.dataset.cat;
      render();
    });
  });

  document.getElementById('inp-bag-search')?.addEventListener('input', e => {
    state.searchQuery = e.target.value;
    const query = state.searchQuery.trim().toLocaleLowerCase();
    let visible = 0;
    document.querySelectorAll('.bag-item-row').forEach(row => {
      const title = row.querySelector('.row-name')?.textContent?.toLocaleLowerCase() || '';
      const show = !query || title.includes(query);
      row.hidden = !show;
      if (show) visible++;
    });
    const count = document.getElementById('bag-result-count');
    if (count) count.textContent = `(${visible} предм.)`;
  });

  document.querySelectorAll('.bag-item-input').forEach(inp => {
    inp.addEventListener('change', () => {
      const iId = Number(inp.dataset.iid);
      state.account.bag[iId] = Math.max(0, Number(inp.value) || 0);
      saveState();
      render();
    });
  });

  // Экспорт и Импорт JSON-профиля
  document.getElementById('btn-export')?.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'vampire_dominion_profile.json';
    a.click();
  });

  document.getElementById('btn-import')?.addEventListener('click', () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'application/json';
    inp.onchange = async () => {
      const file = inp.files?.[0];
      if (!file) return;
      try {
        const parsed = JSON.parse(await file.text());
        state = normalizeState(parsed);
        saveState();
        render();
      } catch (err) {
        alert('Ошибка чтения JSON файла профиля');
      }
    };
    inp.click();
  });
  document.querySelectorAll('.guild-input').forEach(inp => {
    inp.addEventListener('change', () => {
      const key = inp.dataset.guild;
      if (!['level', 'exp', 'nextLevelExp'].includes(key)) return;
      state.account.guildProgress ||= { level: 0, exp: 0, nextLevelExp: 0 };
      state.account.guildProgress[key] = Math.max(0, Number(inp.value) || 0);
      if (key === 'level') state.account.guildProgress.level = Math.min(999, Math.round(state.account.guildProgress.level));
      saveState();
      render();
    });
  });

  document.getElementById('btn-import-helper')?.addEventListener('click', () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'application/json,.json';
    inp.multiple = true;
    inp.onchange = async () => {
      const files = [...(inp.files || [])];
      if (!files.length) return;
      try {
        const snapshots = await Promise.all(files.map(async file => JSON.parse(await file.text())));
        const imported = await requestOracle('/api/oracle/import-helper', { account: state.account, snapshots });
        state.account = normalizeAccountData(imported.account);
        state.plan = createBlankPlan(state.account);
        saveState();
        await render();
        const sum = imported.summary || {};
        const lines = [
          'Смотрители: ' + (sum.wardens || 0),
          'Кровные узы: ' + (sum.bonds || 0),
          'Облики: ' + (sum.skins || 0),
          'Предметы сумки: ' + (sum.inventory || 0),
          'Атрибуты Конклава: ' + (sum.conclaveAttributes || 0),
          'Опыт Гильдии: ' + (sum.guildProgress ? 'импортирован' : 'без изменений'),
        ];
        alert('Импорт завершён.\\n' + lines.join('\\n') + '\\n\\nЗначения стороннего бота сохранены как справочные данные.');
      } catch (error) {
        alert(error.message || 'Не удалось прочитать JSON-дамп помощника.');
      }
    };
    inp.click();
  });

}

document.addEventListener('DOMContentLoaded', render);