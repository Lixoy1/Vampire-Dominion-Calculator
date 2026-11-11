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
    conclave: { strength: 0, allure: 0, intellect: 0, spirit: 0 },
    ownedWardens: {},
    ownedLovers: {},
    skins: {},
    bag: {},
  };
}

function createBlankPlan(account = createBlankAccountData()) {
  return {
    conclave: { ...account.conclave },
    courtyardToLvl: account.courtyardLvl,
    levels: {},
    promotes: {},
    bonds: {},
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
    conclave: { ...base.conclave, ...(incoming?.conclave || {}) },
    ownedWardens: { ...(incoming?.ownedWardens || {}) },
    ownedLovers: { ...(incoming?.ownedLovers || {}) },
    skins: { ...(incoming?.skins || {}) },
    bag: { ...(incoming?.bag || {}) },
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
    skins: { ...(incoming?.skins || {}) },
    summons: {
      ...base.summons,
      ...(incoming?.summons || {}),
      wardens: [...(incoming?.summons?.wardens || [])],
      lovers: [...(incoming?.summons?.lovers || [])],
    },
  };
}

function normalizeState(parsed = {}) {
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
  const name = globalThis.prompt?.('Название нового аккаунта:', `Аккаунт ${state.accounts.length + 1}`);
  if (name == null) return;
  const server = globalThis.prompt?.('Сервер (например, EU S-629):', 'EU S-629');
  if (server == null) return;
  saveState();
  const id = `account-${Date.now()}`;
  const account = createBlankAccountData();
  const profile = { name: name.trim() || `Аккаунт ${state.accounts.length + 1}`, server: server.trim(), region: 'EU', avatarId: 10010 };
  const plan = createBlankPlan(account);
  state.accounts.push({ id, ...profile, account, plan });
  state.activeAccountId = id;
  state.profile = profile;
  state.account = account;
  state.plan = plan;
  saveState();
  render();
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
async function runFullAutoDistribute() {
  try {
    const result = await requestOracle('/api/oracle/auto-distribute', {
      account: state.account,
      plan: state.plan,
    });
    state.plan = normalizePlan(result.plan, state.account);
    saveState();
    await render();
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
    case 'skins': return renderSkinsTab(db);
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
          <div class="row-sub">Автоматический расчёт по всем 8 веткам прокачки</div>
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
          <div class="row-sub">200 опыта = 1 очко таланта · Расчёт Subset Sum DP для прорывов</div>
        </div>
      </div>
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
              return `<div class="row-sub presence-row">• [${p.presence_type}] Ур. ${curLvl}/${p.max_lvl}: Сила ${percs.strength}% · Хар. ${percs.allure}% · Инт. ${percs.intellect}% · Воля ${percs.spirit}%
                ${owned ? `<input class="input mini-level presence-level" type="number" min="${p.min_lvl || 0}" max="${p.max_lvl || curLvl}" data-lid="${l.id}" data-pid="${p.id}" value="${curLvl}" aria-label="Уровень веяния" />` : '<button class="btn btn-sm toggle-owned-lover" data-lid="' + l.id + '">Добавить партнёра</button>'}
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

function renderSkinsTab(db) {
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
      ${allSkins.map(s => `
        <div class="item-row">
          <img class="avatar" src="${getIconUrl(s.icon_path, state.preferLocalIcons)}" alt="" loading="lazy" />
          <div class="row-info">
            <div class="row-name">${s.ownerName} · <span class="badge badge-gold">${s.quality.toUpperCase()}</span></div>
            <div class="row-sub">${tName(s.ownerType === 'warden' ? 'warden_skin' : 'lover_skin', s.name)} · Опыт магазину: +${s.store_exp} · ${FABRIC_COST_BY_QUALITY[s.quality]}/ур. ткани · ${s.purchasable ? 'Доступен за ткань' : 'Нужна карточка'}</div>
          </div>
          <div class="row-controls"><input class="input stepper-input skin-level" type="number" min="0" max="${s.max_lvl}" data-skin-id="${s.id}" value="${state.account.skins[s.id] || 0}" aria-label="Уровень облика" /></div>
        </div>
      `).join('')}
    </section>
  `;
}

function renderSummonTab(db, oracle) {
  const cands = oracle.summonCandidates;

  return `
    <section class="card card-gold">
      <div class="card-head">
        <div class="card-title">➕ Доступные для призыва Смотрители (${cands.wardens.length})</div>
      </div>
      ${cands.wardens.map(c => {
        const w = db.wardens.find(x => x.id === c.id);
        const itemObj = c.itemId ? db.items.find(i => i.id === c.itemId) : null;
        return `
          <div class="item-row">
            <img class="avatar" src="${getIconUrl(w?.icon_path, state.preferLocalIcons)}" alt="" loading="lazy" />
            <div class="row-info">
              <div class="row-name">${tName('warden', c.name)} (${c.baseTalentStars}★)</div>
              <div class="row-sub">
                ${itemObj ? `Нужно: ${c.cost} × ${tName('item', itemObj.name)} (в сумке: ${c.have})` : 'Бесплатный призыв (Сюжет / VIP / Событие)'}
              </div>
            </div>
            <button class="btn btn-sm btn-primary summon-warden" data-wid="${c.id}" ${c.canSummon ? '' : 'disabled'}>${c.canSummon ? 'Призвать' : 'Не хватает'}</button>
          </div>
        `;
      }).join('')}
    </section>
  `;
}

function renderBagTab(db, report, oracle) {
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
        const count = state.account.bag[it.id] ?? 0;
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
  document.getElementById('btn-quick-run')?.addEventListener('click', runFullAutoDistribute);
  document.getElementById('btn-commit-plan')?.addEventListener('click', commitPlanToAccount);

  document.getElementById('btn-reset-plan')?.addEventListener('click', () => {
    state.plan = {
      conclave: { ...state.account.conclave },
      courtyardToLvl: state.account.courtyardLvl,
      levels: {},
      bonds: {},
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
}

document.addEventListener('DOMContentLoaded', render);