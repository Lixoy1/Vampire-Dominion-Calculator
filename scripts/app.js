/**
 * VAMPIRE DOMINION v3.0 — ГЛАВНОЕ ПРИЛОЖЕНИЕ КАЛЬКУЛЯТОРА (БЕЗ VIP-ОГРАНИЧЕНИЙ)
 * Объединяет базу данных (data.js) и расчётное ядро (engine.js) со всеми вкладками.
 */
import { GAME_DB, getIconUrl } from './data.js';
import * as LocalPlanner from './local-planner.js';
import { normalizeQuickSettings, quickResponseToPlan } from './quick-settings.js';
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
    ownedWardens: GAME_DB.wardens[0] ? { [GAME_DB.wardens[0].id]: createOwnedWarden(GAME_DB.wardens[0]) } : {},
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
    version: 7,
    screen: 'home',
    currentWardenId: GAME_DB.wardens[0]?.id ?? 10010,
    currentLoverId: GAME_DB.lovers[0]?.id ?? 20010,
    wardenTab: 'attributes',
    loverTab: 'trust',
    expandedAttr: null,
    wardenListFilter: 'all',
    wardenListSearch: '',
    wardenListSort: 'name',
    loverListSearch: '',
    bagCategory: 'all',
    bagView: 'grid',
    bagShowAll: true,
    skinTab: 'wardens',
    skinSearch: '',
    wardenExpFilter: 'all',
    wardenExpSearch: '',
    calcPriority: 'dominance',
    calcEnabledBranches: {
      conclave: true, courtyard: true, summon: true, skins: true, books: true,
      levels: true, auras: true, talents: true, bonds: true, presences: true,
    },
    lastCalcReport: null,
    history: [],
    future: [],
    savedCalculations: [],
    lang: 'ru',
    preferLocalIcons: true,
    activeTab: 'dominance',
    bagFilter: 'all',
    searchQuery: '',
    profile,
    settings: { theme: 'dark', loverSex: 'female' },
    quickSettings: normalizeQuickSettings({}),
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

function adaptLegacyProfileSnapshot(parsed = {}) {
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

function ensureStarterWarden(account, storedVersion = 0) {
  // One-time migration: the HAR reference starts at 1/68 Wardens. Only migrate
  // genuinely untouched pre-v7 profiles; never overwrite a populated roster
  // or a profile intentionally cleared in v7+.
  if (Number(storedVersion) >= 7 || Object.keys(account.ownedWardens || {}).length) return account;
  const hasNonZero = value => Number(value || 0) > 0;
  const hasValues = values => Object.values(values || {}).some(hasNonZero);
  const conclaveHasProgress = hasValues(account.conclave);
  const guildHasProgress = hasValues(account.guildProgress);
  const pristine =
    !hasNonZero(account.blood) &&
    !hasNonZero(account.conclaveExp) &&
    !hasNonZero(account.courtyardExp) &&
    !hasNonZero(account.courtyardLvl) &&
    !conclaveHasProgress &&
    !guildHasProgress &&
    !Object.keys(account.ownedLovers || {}).length &&
    !hasValues(account.bag) &&
    !hasValues(account.skins);
  const starter = GAME_DB.wardens[0];
  if (!pristine || !starter) return account;
  return {
    ...account,
    ownedWardens: { [starter.id]: createOwnedWarden(starter) },
  };
}

export function normalizeState(parsed = {}) {
  parsed = adaptLegacyProfileSnapshot(parsed);
  const source = parsed && typeof parsed === 'object' ? parsed : {};
  const base = createDefaultState();
  const lang = source.lang || source.settings?.lang || base.lang;

  // Import profile format used by the previous multi-account v4 calculator.
  if (Array.isArray(source.accounts) && source.accounts.length) {
    const accounts = source.accounts.map((raw, index) => {
      const account = ensureStarterWarden(normalizeAccountData(raw), source.version);
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
      version: 7,
      lang,
      profile: { name: selected.name, server: selected.server, region: selected.region, avatarId: selected.avatarId },
      settings: { ...base.settings, ...(source.settings || {}) },
      quickSettings: normalizeQuickSettings(source.quickSettings || {}),
      account: selected.account,
      plan: selected.plan,
      activeAccountId: selected.id,
      accounts,
    };
  }

  // Migrate the previous v4 single-account shape and the reference v3 export.
  const account = ensureStarterWarden(normalizeAccountData(source.account || source), source.version);
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
    version: 7,
    lang,
    profile,
    settings: { ...base.settings, ...(source.settings || {}) },
    quickSettings: normalizeQuickSettings(source.quickSettings || {}),
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
  const preference = state.settings?.theme || 'dark';
  const systemLight = globalThis.matchMedia?.('(prefers-color-scheme: light)')?.matches || false;
  const light = preference === 'light' || (preference === 'auto' && systemLight);
  const motion = state.settings?.animations || 'smooth';
  document.documentElement?.classList.toggle('light-theme', light);
  document.documentElement?.classList.toggle('reduce-motion', motion === 'less' || (motion === 'auto' && globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches));
  try {
    const color = light ? '#f3eee4' : '#0b0910';
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

// Автораспределение выполняется локальным планировщиком на основе engine.js.
async function runAutoTalentDistribution() {
  try {
    const result = await runLocalAction('auto-talents', {
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
    alert(error.message || 'Локальный движок не смог распределить свитки и рукописи.');
  }
}

async function runAutoBondDistribution() {
  try {
    const result = await runLocalAction('auto-bonds', {
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
      'Потрачено Доверия: ' + (summary.affinitySpent || 0) + '\\n' +
      'Подтверждённые шаги API: ' + (summary.exactSteps || 0) + '\\n' +
      'Оценочные шаги: ' + (summary.estimatedSteps || 0) + '\\n' +
      'Прирост: +' + (summary.gain || 0) + ' Господства'
    );
  } catch (error) {
    alert(error.message || 'Локальный движок не смог распределить Доверие.');
  }
}

async function runAutoPresenceDistribution() {
  try {
    const result = await runLocalAction('auto-presences', {
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
    alert(error.message || 'Локальный движок не смог распределить жетоны Веяний.');
  }
}

async function runFullAutoDistribute() {
  try {
    const result = await runLocalAction('auto-distribute', {
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
    alert(error.message || 'Локальный движок не смог распределить ресурсы.');
  }
}

// Применение плана и проверка ресурсов выполняются локально до изменения профиля.
async function commitPlanToAccount() {
  try {
    const result = await runLocalAction('commit-plan', {
      account: state.account,
      plan: state.plan,
    });
    if (!result.ok) {
      const detail = result.error?.missingItems?.map(item => {
        const itemName = tName('item', GAME_DB.items.find(entry => entry.id === item.itemId)?.name || item.itemId);
        return `${itemName}: ещё ${item.need}`;
      }).join('\\n');
      alert(detail ? `${result.error.message}\\n${detail}` : (result.error?.message || 'Локальный движок отклонил план.'));
      return;
    }

    state.account = normalizeAccountData(result.account);
    state.plan = createBlankPlan(state.account);
    saveState();
    await render();
    alert('План проверен локальным движком и применён. Ресурсы и предметы списаны из профиля.');
  } catch (error) {
    alert(error.message || 'Локальный движок не смог применить план. Данные профиля не изменены.');
  }
}

function openAppModal(title, html) {
  const overlay = document.getElementById('modal-overlay');
  const titleNode = document.getElementById('modal-title');
  const bodyNode = document.getElementById('modal-body');
  if (!overlay || !titleNode || !bodyNode) return false;
  titleNode.textContent = title;
  bodyNode.innerHTML = html;
  overlay.classList.remove('hidden');
  return true;
}

function closeAppModal() {
  document.getElementById('modal-overlay')?.classList.add('hidden');
}

function exportProfileJson() {
  try {
    syncActiveAccountSnapshot();
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'vampire_dominion_profile.json';
    link.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  } catch (error) { alert('Не удалось экспортировать профиль: ' + (error.message || error)); }
}

function importProfileJson() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.addEventListener('change', async function () {
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      state = normalizeState(parsed);
      saveState();
      await render();
      alert('Профиль успешно импортирован.');
    } catch (error) { alert('Ошибка чтения JSON файла профиля: ' + (error.message || error)); }
  });
  input.click();
}

function saveCurrentCalculation() {
  const report = calculationSnapshot && calculationSnapshot.report;
  if (!report) { alert('Сначала выполните расчёт.'); return; }
  state.savedCalculations = Array.isArray(state.savedCalculations) ? state.savedCalculations : [];
  const saved = {
    id: 'calc-' + Date.now(),
    savedAt: new Date().toISOString(),
    profile: { ...state.profile },
    report: JSON.parse(JSON.stringify(report)),
    account: JSON.parse(JSON.stringify(state.account)),
    plan: JSON.parse(JSON.stringify(state.plan))
  };
  state.savedCalculations.unshift(saved);
  state.savedCalculations = state.savedCalculations.slice(0, 30);
  saveState();
  openAppModal('Расчёт сохранён', '<p>Снимок сохранён локально на этом устройстве.</p>' +
    '<div class="item-row"><span>Профиль</span><b>' + escHtml(saved.profile.name || 'Оптимист') + '</b></div>' +
    '<div class="item-row"><span>Прирост Господства</span><b>+' + fmt(report.gain.total || 0) + '</b></div>' +
    '<div class="row-sub">Сохранено расчётов: ' + state.savedCalculations.length + '. Для переноса используй экспорт профиля.</div>');
}


function explainGameConnection() {
  const html = '<p>Это независимый проект сообщества энтузиастов и любителей игры «Наследие Вампиров».</p>' +
    '<p>Калькулятор не запрашивает пароль и не входит в игровой аккаунт. Значения профиля вводятся вручную.</p>' +
    '<p>Все планы можно предварительно рассчитать, проверить и отменить до применения.</p>';
  openAppModal('О проекте', html);
}

// Единая точка вызова локального расчётного движка.
let calculationSnapshot = null;
let renderSerial = 0;

function runLocalAction(action, payload = {}) {
  const operations = {
    calculate: LocalPlanner.calculateLocalSnapshot,
    'auto-talents': LocalPlanner.autoDistributeTalentPlan,
    'auto-bonds': LocalPlanner.autoDistributeBondPlan,
    'auto-presences': LocalPlanner.autoDistributePresencePlan,
    'auto-distribute': LocalPlanner.autoDistributeAll,
    'auto-conclave': LocalPlanner.autoDistributeConclave,
    'commit-plan': LocalPlanner.commitLocalPlan,
    summon: LocalPlanner.summonWarden,
    'summon-lover': LocalPlanner.summonLover,
  };
  const operation = operations[action];
  if (typeof operation !== 'function') return Promise.reject(new Error('Неизвестная локальная операция: ' + action));
  try { return Promise.resolve(operation(payload)); }
  catch (error) { return Promise.reject(error); }
}

// Calculation and planning run on-device through local-planner.js and engine.js.
// Главный рендер вкладок: локальный расчёт, затем отображение результата.
function computeWardenDetailedStats(profile, wardenId) {
  const warden = GAME_DB.wardens.find(item => item.id === Number(wardenId));
  const owned = profile.ownedWardens && profile.ownedWardens[wardenId];
  const server = calculationSnapshot?.wardens?.[wardenId];
  const values = {};
  const breakdown = {};
  for (const attr of ATTRIBUTES) {
    values[attr] = Number(server?.baseAttributes?.[attr] || 0);
    let auraPct = 0;
    for (const aura of warden?.auras || []) {
      const targetAttrs = aura.attributes || [aura.attribute || aura.main_attribute];
      if (targetAttrs.includes(attr) || targetAttrs.includes('all')) {
        auraPct += Number(server?.auras?.[aura.id]?.percent || 0);
      }
    }
    breakdown[attr] = {
      oracleTalentBase: values[attr],
      enteredBooks: Number(owned?.books?.[attr] || 0),
      auraPct,
    };
  }
  return {
    values,
    breakdown,
    sum: ATTRIBUTES.reduce((sum, attr) => sum + values[attr], 0),
    estimated: true,
  };
}

function renderWardenDetailScreen(db) {
  const ownedIds = Object.keys(state.account.ownedWardens || {}).map(Number);
  if (!ownedIds.length) return renderWardensListScreen(db);
  if (!ownedIds.includes(Number(state.currentWardenId))) state.currentWardenId = ownedIds[0];
  const id = Number(state.currentWardenId);
  const index = ownedIds.indexOf(id);
  const warden = db.wardens.find(item => item.id === id);
  const owned = state.account.ownedWardens[id];
  const calculationWarden = calculationSnapshot?.wardens?.[id];
  if (!warden || !owned) return renderWardensListScreen(db);
  const stats = computeWardenDetailedStats(state.account, id);
  const prevId = ownedIds[(index - 1 + ownedIds.length) % ownedIds.length];
  const nextId = ownedIds[(index + 1) % ownedIds.length];
  const linkedLover = db.lovers.find(lover => lover.warden_id === id);
  const tabs = [['level','Уровень'],['books','Книги'],['talents','Таланты'],['auras','Вдохновения'],['skins','Облики'],['attributes','Атрибуты']];
  let body = '';

  if (state.wardenTab === 'attributes') {
    const max = Math.max(1, ...ATTRIBUTES.map(attr => stats.values[attr]));
    body = '<div class="attrs-box"><div class="row-sub">База рассчитана локально по модели талантов. Это не подтверждённое игровым сервером абсолютное Господство.</div>' +
      ATTRIBUTES.map(attr => {
        const item = stats.breakdown[attr];
        const pct = Math.min(100, Math.round(item.oracleTalentBase / max * 100));
        const expanded = state.expandedAttr === attr;
        return '<div class="attr-item"><div class="attr-line-top" data-action="toggle-attr-detail" data-attr="' + attr + '"><span><span class="dot ' + attr + '"></span> ' + tName('attribute', attr) + '</span><span>' + fmt(item.oracleTalentBase) + ' ' + (expanded ? '⌃' : '⌄') + '</span></div>' +
          '<div class="attr-bar-track"><div class="attr-bar-fill ' + attr + '" style="width:' + pct + '%"></div></div>' +
          (expanded ? '<div class="attr-breakdown">' +
            '<div class="attr-breakdown-row"><span>Расчётная база талантов / уровня</span><b>' + fmt(item.oracleTalentBase) + '</b></div>' +
            '<div class="attr-breakdown-row"><span>Книги (введённое значение)</span><b>' + fmt(item.enteredBooks) + '</b></div>' +
            '<div class="attr-breakdown-row"><span>Ауры (модификатор отдельно)</span><b>' + item.auraPct.toFixed(1) + '%</b></div>' +
            '<div class="attr-breakdown-row"><span>Конклав · текущий уровень</span><b>' + Number(state.account.conclave?.[attr] || 0) + '</b></div>' +
            '<div class="attr-breakdown-row"><span>Сад · текущий уровень</span><b>' + Number(state.account.courtyardLvl || 0) + '</b></div>' +
          '</div>' : '') + '</div>';
      }).join('') +
      '<div class="attr-total-row"><b>Сумма расчётной базы</b><b>' + fmt(stats.sum) + '</b></div>' +
      '<div class="row-sub">Книги, проценты аур, Сад и Конклав показаны отдельными величинами и не суммируются здесь в абсолютный игровой показатель.</div></div>';
  } else if (state.wardenTab === 'level') {
    const promote = db.promotes.find(item => item.id === Number(owned.promoteId || 1)) || db.promotes[0];
    const planned = state.plan.levels?.[id] ?? owned.level ?? 1;
    body = '<div class="attrs-box">' +
      '<label class="field-stack"><span>Текущий уровень (1–450)</span><input class="input" type="number" min="1" max="450" data-spa-warden-field="level" value="' + Number(owned.level || 1) + '"></label>' +
      '<label class="field-stack"><span>Плановый целевой уровень</span><input class="input lvl-target" type="number" min="' + Number(owned.level || 1) + '" max="450" data-wid="' + id + '" value="' + Number(planned) + '"></label>' +
      '<label class="field-stack"><span>Прорыв</span><select class="select" data-spa-warden-field="promoteId">' + db.promotes.map(p => '<option value="' + p.id + '"' + (p.id === Number(owned.promoteId || 1) ? ' selected' : '') + '>' + tName('warden_promote', p.name) + ' · макс. ур. ' + (p.max_warden_lvl || p.max_level || '—') + '</option>').join('') + '</select></label>' +
      '<div class="row-sub">Потолок талантов по выбранному прорыву: ' + (promote.max_talent_lvl || '—') + '</div>' +
      '<div class="row-sub">Серверный расчёт стоимости и прироста выводится в сводке господства.</div>' +
      '<button class="btn btn-danger btn-sm toggle-owned-warden" data-wid="' + id + '">Удалить смотрителя из профиля</button></div>';
  } else if (state.wardenTab === 'books') {
    body = '<div class="attrs-box"><div class="row-sub">Введи значения очков атрибутов от прочитанных книг. Эти значения хранятся как отдельные входные данные.</div><div class="grid-2">' +
      ATTRIBUTES.map(attr => '<label class="field-stack"><span><span class="dot ' + attr + '"></span> ' + tName('attribute', attr) + '</span><input class="input" type="number" min="0" data-spa-warden-book="' + attr + '" value="' + Number(owned.books?.[attr] || 0) + '"></label>').join('') +
      '</div></div>';
  } else if (state.wardenTab === 'talents') {
    const cap = Number((db.promotes.find(p => p.id === Number(owned.promoteId || 1)) || {}).max_talent_lvl || 40);
    const planned = state.plan.talents?.[id] || {};
    body = '<div class="attrs-box"><label class="field-stack"><span>Личный опыт талантов</span><input class="input warden-personal-exp" type="number" min="0" data-wid="' + id + '" data-spa-warden-exp value="' + Number(owned.exp || 0) + '"></label>' +
      '<div class="row-sub">Доступно очков по модели движка: ' + Number(calculationWarden?.talentPointsAvailable || 0) + ' · потолок ' + cap + '</div>' +
      '<div class="grid-2">' + (warden.talents || []).map((talent, index) => {
        const level = Number(owned.talents?.[index] || 1);
        const scroll = Number(planned.scrolls?.[index] || 0);
        const script = Number(planned.scripts?.[index] || 0);
        const exp = Number(planned.exp_levels?.[index] || 0);
        return '<label class="field-stack"><span><span class="dot ' + talent.attribute + '"></span> ' + tName('attribute', talent.attribute) + ' · ' + talent.stars + '★</span>' +
          '<input class="input" type="number" min="1" max="' + cap + '" data-spa-warden-talent="' + index + '" value="' + level + '">' +
          '<span class="row-sub">План: свитки ' + scroll + ' · манускрипты ' + script + ' · опыт ' + exp + '</span></label>';
      }).join('') + '</div>' +
      '<button class="btn btn-primary" id="btn-auto-talents">⚡ Локально распределить опыт и предметы</button></div>';
  } else if (state.wardenTab === 'auras') {
    body = '<div class="card-stack">' + (warden.auras || []).map(aura => {
      const level = Number(owned.auras?.[aura.id] ?? aura.min_lvl ?? 0);
      const serverAura = calculationWarden?.auras?.[aura.id];
      return '<div class="nav-card" style="cursor:default"><div class="card-body"><div class="card-title">' + escHtml(aura.name || aura.type || 'Вдохновение') + '</div><div class="card-subtitle">Локально: +' + Number(serverAura?.percent || 0).toFixed(1) + '% · уровень ' + level + ' · макс. ур. ' + (aura.max_lvl || '—') + '</div></div><input class="input stepper-input" type="number" min="0" max="' + (aura.max_lvl || 30) + '" data-spa-warden-aura="' + aura.id + '" value="' + level + '"></div>';
    }).join('') + '</div>';
  } else {
    body = '<div class="card-stack">' + (warden.skins || []).map(skin => {
      const level = Number(state.account.skins?.[skin.id] || 0);
      return '<div class="nav-card" style="cursor:default"><img src="' + getIconUrl(skin.icon_path, state.preferLocalIcons) + '" class="profile-avatar-lg skin-mini-avatar" alt=""><div class="card-body"><div class="card-title">' + tName('warden_skin', skin.name) + '</div><div class="card-subtitle">' + String(skin.quality || '').toUpperCase() + ' · макс. ' + (skin.max_lvl || 10) + ' уровней</div></div><div class="stepper-group"><button class="stepper-btn" data-action="skin-step" data-skin="' + skin.id + '" data-delta="-1">−</button><span class="stepper-val">' + level + '</span><button class="stepper-btn" data-action="skin-step" data-skin="' + skin.id + '" data-delta="1">+</button></div></div>';
    }).join('') + '</div>';
  }

  const loverLink = linkedLover ? '<button class="partner-link-btn" data-action="open-lover" data-id="' + linkedLover.id + '">♡ ' + tName('lover', linkedLover.name) + '</button>' : '';
  const previous = db.wardens.find(w => w.id === prevId);
  const next = db.wardens.find(w => w.id === nextId);
  return renderSubToolbar('wardens_list', 'Смотритель') +
    '<div class="warden-hero-card warden-art-card"><img src="' + getIconUrl(warden.icon_path, state.preferLocalIcons) + '" class="warden-avatar-lg" alt=""><div class="card-body"><div class="warden-title-serif">' + tName('warden', warden.name) + '</div><div class="card-subtitle">' + warden.attributes.map(attr => '<span class="dot ' + attr + '"></span>').join(' ') + ' · ур. ' + Number(owned.level || 1) + '</div></div>' + loverLink + '</div>' +
    '<div class="pill-tabs">' + tabs.map(tab => '<button class="pill-tab ' + (state.wardenTab === tab[0] ? 'active' : '') + '" data-action="set-warden-tab" data-tab="' + tab[0] + '">' + tab[1] + '</button>').join('') + '</div>' +
    body + '<div class="warden-pager-bar"><button class="pager-btn" data-action="open-warden" data-id="' + prevId + '">‹ ' + tName('warden', previous?.name || '') + '</button><button class="pager-btn" data-action="open-warden-picker">' + (index + 1) + ' из ' + ownedIds.length + ' ⌃</button><button class="pager-btn" data-action="open-warden" data-id="' + nextId + '">' + tName('warden', next?.name || '') + ' ›</button></div>';
}


function renderLoverDetailScreen(db) {
  const ownedIds = Object.keys(state.account.ownedLovers || {}).map(Number);
  const id = Number(state.currentLoverId);
  const lover = db.lovers.find(item => item.id === id);
  const owned = state.account.ownedLovers[id];
  if (!lover || !owned) return renderLoversScreen(db);
  const warden = db.wardens.find(item => item.id === lover.warden_id);
  const plan = getBondPlan(lover, owned);
  const serverLover = calculationSnapshot?.lovers?.[id] || {};
  const result = serverLover.bondResult;
  const tabs = [
    ['trust', 'Доверие'],
    ['bonds', 'Кровные узы'],
    ['presences', 'Веяния'],
    ['skins', 'Облики'],
  ];
  const activeTab = tabs.some(tab => tab[0] === state.loverTab) ? state.loverTab : 'trust';
  state.loverTab = activeTab;

  const trustHtml =
    '<section class="attrs-box"><div class="card-title">Доверие и близость</div>' +
    '<div class="grid-2">' +
      '<label class="field-stack"><span>Близость / откровенность</span><input class="input lover-stat-input" type="number" min="0" data-lid="' + id + '" data-field="closeness" value="' + Number(owned.closeness || 0) + '"></label>' +
      '<label class="field-stack"><span>Доверие / влечение</span><input class="input lover-stat-input" type="number" min="0" data-lid="' + id + '" data-field="affinity" value="' + Number(owned.affinity || 0) + '"></label>' +
    '</div>' +
    '<label class="field-stack"><span>Пол портрета</span><select class="select" data-spa-lover-sex="' + id + '">' +
      '<option value="female" ' + (owned.sex !== 'male' ? 'selected' : '') + '>Женский</option>' +
      '<option value="male" ' + (owned.sex === 'male' ? 'selected' : '') + '>Мужской</option>' +
    '</select></label>' +
    '<div class="row-sub">Близость открывает условия для ветвей Кровных уз. Доверие расходуется при выборе целевых уровней.</div></section>';

  const bondsHtml = (lover.scarlet_bonds || []).map(bond => {
    const statePlan = plan[bond.attribute] || { level: 0, targetLevel: 0, percentLevel: 0, targetPercentLevel: 0 };
    const detail = (result?.details || []).find(item => item.attribute === bond.attribute);
    if (!detail) {
      return '<div class="bond-row"><b>' + tName('attribute', bond.attribute) + '</b><div class="row-sub">Детальный расчёт этой ветви пока недоступен.</div></div>';
    }
    return '<div class="bond-row"><div class="bond-head"><b><span class="dot ' + bond.attribute + '"></span> ' + tName('attribute', bond.attribute) + (bond.is_advantage ? ' ★' : '') + '</b><span>+' + fmt(detail.totalAttrGain || 0) + '</span></div><div class="grid-2 bond-inputs">' +
      '<label class="field-stack"><span>Уровень связи · ' + (detail.unlockedFlat ? 'открыто' : 'закрыто до близости ' + bond.unlock_closeness) + '</span><input class="input bond-target" type="number" min="' + Number(statePlan.level || 0) + '" max="600" data-lid="' + id + '" data-attr="' + bond.attribute + '" data-kind="flat" value="' + Number(statePlan.targetLevel ?? statePlan.level ?? 0) + '" ' + (detail.unlockedFlat ? '' : 'disabled') + '></label>' +
      '<label class="field-stack"><span>Процент · ' + (detail.unlockedPct ? 'открыто' : 'закрыто до близости ' + bond.unlock_closeness_percent) + '</span><input class="input bond-target" type="number" min="' + Number(statePlan.percentLevel || 0) + '" max="600" data-lid="' + id + '" data-attr="' + bond.attribute + '" data-kind="percent" value="' + Number(statePlan.targetPercentLevel ?? statePlan.percentLevel ?? 0) + '" ' + (detail.unlockedPct ? '' : 'disabled') + '></label></div>' +
      '<div class="row-sub">Цена: ' + fmt(Number(detail.costFlat || 0) + Number(detail.costPct || 0)) + ' доверия · прирост: +' + fmt(detail.totalAttrGain || 0) + ' · ' + (detail.exactFlat && detail.exactPercent ? 'подтверждено API' : detail.exactFlat || detail.exactPercent ? 'частично подтверждено API' : 'оценка') + '</div></div>';
  }).join('');
  const bondsHtmlWithSummary =
    '<section class="attrs-box"><div class="card-title">Кровные узы</div>' +
    '<div class="row-sub">Плоский и процентный уровни считаются отдельно. Достоверность показана для каждого шага.</div>' +
    '<div class="quick-calc-actions"><button class="btn btn-primary" id="btn-auto-bonds">⚡ Распределить Кровные узы</button></div>' +
    (result ? '<div class="bond-summary">Потратится: <b>' + fmt(result.spentAffinity || 0) + '</b> · Останется: <b>' + fmt(result.leftAffinity || 0) + '</b> · Прирост: <b>+' + fmt(result.totalGain || 0) + '</b></div>' : '<div class="row-sub">Для расчёта выбери цель и обнови сводку Господства.</div>') +
    (result && result.spentAffinity > Number(owned.affinity || 0) ? '<div class="bond-warning">Недостаточно Доверия для выбранного плана.</div>' : '') +
    bondsHtml + '</section>';

  const presenceHtml = (lover.presences || []).map(presence => {
    const level = Number(owned.presences?.[presence.id] ?? presence.min_lvl ?? 0);
    const values = serverLover.presences?.[presence.id]?.percents || {};
    return '<div class="nav-card" style="cursor:default"><div class="card-body"><div class="card-title">' + escHtml(presence.name || 'Веяние') + '</div><div class="card-subtitle">Сила ' + Number(values.strength || 0) + '% · Харизма ' + Number(values.allure || 0) + '% · Интеллект ' + Number(values.intellect || 0) + '% · Воля ' + Number(values.spirit || 0) + '%</div></div><input class="input stepper-input presence-level" type="number" min="' + (presence.min_lvl || 0) + '" max="' + (presence.max_lvl || 30) + '" data-lid="' + id + '" data-pid="' + presence.id + '" value="' + level + '"></div>';
  }).join('');
  const presencesHtml =
    '<section class="attrs-box"><div class="card-title">Веяния партнёра</div>' +
    '<div class="row-sub">Проценты берутся из сохранённых кривых Веяний. Уровень меняется в пределах каталога.</div>' +
    '<div class="quick-calc-actions"><button class="btn btn-primary" id="btn-auto-presences">⚡ Распределить Веяния</button></div>' +
    (presenceHtml || '<div class="row-sub">Для партнёра нет записей Веяний.</div>') + '</section>';

  const skinsHtml = (lover.skins || []).map(skin => {
    const level = Number(state.account.skins?.[skin.id] || 0);
    return '<div class="nav-card" style="cursor:default"><img src="' + getIconUrl(skin.icon_path, state.preferLocalIcons) + '" class="profile-avatar-lg skin-mini-avatar" alt=""><div class="card-body"><div class="card-title">' + tName('lover_skin', skin.name) + '</div><div class="card-subtitle">' + String(skin.quality || '').toUpperCase() + ' · максимум ' + Number(skin.max_lvl || 10) + '</div></div><div class="stepper-group"><button class="stepper-btn" data-action="skin-step" data-skin="' + skin.id + '" data-delta="-1">−</button><span class="stepper-val">' + level + '</span><button class="stepper-btn" data-action="skin-step" data-skin="' + skin.id + '" data-delta="1">+</button></div></div>';
  }).join('');
  const skinsSection =
    '<section class="attrs-box"><div class="card-title">Облики партнёра</div>' +
    '<div class="row-sub">Уровни хранятся в профиле и учитываются в общем плане.</div>' +
    (skinsHtml || '<div class="row-sub">В каталоге этого партнёра нет отдельных обликов.</div>') +
    '<button class="btn" type="button" data-action="nav" data-screen="skins">Открыть общий каталог обликов</button></section>';

  const body = activeTab === 'trust' ? trustHtml :
    activeTab === 'bonds' ? bondsHtmlWithSummary :
    activeTab === 'presences' ? presencesHtml : skinsSection;
  const currentIndex = ownedIds.indexOf(id);
  const pager = ownedIds.length > 1
    ? '<div class="warden-pager-bar"><button class="pager-btn" data-action="open-lover" data-id="' + ownedIds[(currentIndex - 1 + ownedIds.length) % ownedIds.length] + '">‹ Предыдущий</button><button class="pager-btn" data-action="nav" data-screen="lovers">' + (currentIndex + 1) + ' из ' + ownedIds.length + ' ⌃</button><button class="pager-btn" data-action="open-lover" data-id="' + ownedIds[(currentIndex + 1) % ownedIds.length] + '">Следующий ›</button></div>'
    : '';

  return renderSubToolbar('lovers', 'Партнёр') +
    '<div class="warden-hero-card"><img src="' + getIconUrl(getLoverIconPath(lover, owned), state.preferLocalIcons) + '" class="warden-avatar-lg" alt=""><div class="card-body"><div class="warden-title-serif">' + tName('lover', lover.name) + '</div><div class="card-subtitle">' + (warden ? tName('warden', warden.name) : '') + '</div></div></div>' +
    '<div class="pill-tabs lover-subtabs">' + tabs.map(tab => '<button class="pill-tab ' + (activeTab === tab[0] ? 'active' : '') + '" data-action="set-lover-tab" data-tab="' + tab[0] + '">' + tab[1] + '</button>').join('') + '</div>' +
    body + pager;
}

function renderConclaveScreen(db, report, oracle) {
  const current = state.account.conclave || {};
  const branches = ATTRIBUTES.map(attr => {
    const level = Number(current[attr] || 0);
    const row = db.conclaveLevels.find(item => item.id === level);
    const target = Math.max(level, Number(state.plan.conclave[attr] || level));
    const calc = oracle?.conclaveBranches?.[attr] || {};
    return '<div class="conclave-branch"><div class="branch-title"><span class="dot ' + attr + '"></span>' + tName('attribute', attr) + '</div>' +
      '<label class="field-stack"><span>Текущий уровень / 180</span><input class="input" type="number" min="0" max="180" data-spa-conclave-level="' + attr + '" value="' + level + '"></label>' +
      '<label class="field-stack"><span>Целевой уровень</span><input class="input conc-target" type="number" min="' + level + '" max="180" data-attr="' + attr + '" value="' + target + '"></label>' +
      '<div class="row-sub">Бонус текущего уровня: +' + fmt(row?.attribute_bonus || 0) + ' · цена плана: ' + fmt(calc.spent || 0) + ' · модельный прирост: +' + fmt(calc.directAttributeGain || 0) + '</div></div>';
  }).join('');
  const garden = oracle?.courtyardUpgrade || {};
  const gardenTarget = Math.max(Number(state.account.courtyardLvl || 0), Number(state.plan.courtyardToLvl || state.account.courtyardLvl || 0));
  const gardenGain = garden.gain || {};
  return renderSubToolbar('resources', 'Конклав и Сад') +
    '<section class="attrs-box"><div class="card-head"><div><div class="card-title">Конклав · 180 уровней</div><div class="row-sub">Очки доступны: ' + fmt(state.account.conclaveExp || 0) + ' · потрачено: ' + fmt(report.spent.conclaveExp || 0) + '</div></div><button class="btn btn-primary btn-sm" data-action="auto-conclave">⚡ Распределить</button></div>' +
      '<label class="field-stack"><span>Очки Конклава</span><input class="input" type="number" min="0" data-resource-field="conclaveExp" value="' + Number(state.account.conclaveExp || 0) + '"></label>' +
      '<div class="grid-2">' + branches + '</div></section>' +
    '<section class="attrs-box"><div class="card-head"><div><div class="card-title">Сад · 210 уровней</div><div class="row-sub">Текущий уровень ' + Number(state.account.courtyardLvl || 0) + ' · цель ' + gardenTarget + '</div></div><span class="gain-pill">+' + fmt(garden.totalGain || 0) + '</span></div>' +
      '<div class="grid-2"><label class="field-stack"><span>Текущий уровень</span><input class="input" type="number" min="0" max="210" data-resource-field="courtyardLvl" value="' + Number(state.account.courtyardLvl || 0) + '"></label>' +
      '<label class="field-stack"><span>Очки Сада</span><input class="input" type="number" min="0" data-resource-field="courtyardExp" value="' + Number(state.account.courtyardExp || 0) + '"></label></div>' +
      '<label class="field-stack"><span>Целевой уровень</span><input class="input" id="inp-courtyard-target" type="number" min="' + Number(state.account.courtyardLvl || 0) + '" max="210" value="' + gardenTarget + '"></label>' +
      '<div class="item-row"><span>Стоимость цели</span><b>' + fmt(garden.spent || 0) + '</b></div>' +
      '<div class="item-row"><span>Прирост по модели движка</span><b>+' + fmt(garden.totalGain || 0) + '</b></div>' +
      '<div class="row-sub">Прирост Сада берётся из серверного расчёта и не пересчитывается локально.</div></section>';
}

function renderIntimacyCalcScreen(report, oracle) {
  const calculators = oracle?.eventCalculators || {};
  const cards = [
    ['Близость', calculators.intimacy],
    ['Влечение', calculators.attraction],
  ];
  return renderSubToolbar('calculations', 'Близость и влечение') +
    cards.map(card => {
      const result = card[1] || {};
      return '<section class="attrs-box"><div class="card-title">' + card[0] + '</div><div class="grid-3">' +
        '<div><div class="row-sub">Минимум</div><b>' + fmt(result.minimum || 0) + '</b></div>' +
        '<div><div class="row-sub">Ожидание</div><b>' + fmt(result.expected || 0) + '</b></div>' +
        '<div><div class="row-sub">Максимум</div><b>' + fmt(result.maximum || 0) + '</b></div>' +
      '</div></section>';
    }).join('') +
    '<section class="attrs-box"><div class="card-title">Опыт Гильдии</div><div class="dominance-number">' + fmt(calculators.guildExp?.expected || 0) + '</div>' +
    '<div class="row-sub">Расчёт по таблицам движка с трёхдневным лимитом вложений из Сумки.</div></section>' +
    '<button class="btn btn-primary" data-action="nav" data-screen="bag">Открыть Сумку</button>';
}

function renderSummonScreen(db, oracle) {
  const candidates = oracle?.summonCandidates || { wardens: [], lovers: [] };
  return renderSubToolbar('resources', 'Призыв') +
    '<div class="collection-banner summon-banner"><div><b>ЗОВ КРОВИ</b><span>Призывай смотрителей и возлюбленных</span></div></div>' +
    renderSummonTab(db, { ...oracle, summonCandidates: candidates });
}

function renderSpaScreen(db, report, oracle) {
  switch (state.screen || 'home') {
    case 'home': return renderHomeScreen();
    case 'resources': return renderResourcesScreen();
    case 'summon': return renderSummonScreen(db, oracle);
    case 'wardens_list': return renderWardensListScreen(db);
    case 'warden-detail': return renderWardenDetailScreen(db);
    case 'lovers': return renderLoversScreen(db);
    case 'lover-detail': return renderLoverDetailScreen(db);
    case 'bag': return renderBagScreen(db);
    case 'skins': return renderSkinsScreen(db);
    case 'conclave': return renderConclaveScreen(db, report, oracle);
    case 'warden_exp': return renderWardenExpScreen(db, oracle);
    case 'calculations': return renderCalculationsHubScreen();
    case 'calc_dominance': return renderDominanceCalcScreen(db, report);
    case 'calc_talents': return renderSubToolbar('calculations', 'Таланты и опыт') + renderTalentsTab(db, oracle);
    case 'calc_intimacy': return renderIntimacyCalcScreen(report, oracle);
    case 'settings': return renderSettingsScreen();
    default: return renderHomeScreen();
  }
}

const QUICK_GOAL_LABELS = {
  all: 'Всё',
  strength: 'Сила',
  allure: 'Харизма',
  intellect: 'Интеллект',
  spirit: 'Воля',
};

const QUICK_SPEND_LABELS = {
  blood: ['Кровь', 'Уровни смотрителей'],
  promote_items: ['Прорывы', 'Предметы прорыва'],
  conclave: ['Конклав', 'Очки Конклава'],
  trust: ['Доверие', 'Кровные узы'],
  group_items: ['Призыв и вдохновения', 'Предметы призыва'],
  presence_items: ['Веяния', 'Предметы Веяний'],
  talent_items: ['Свитки и рукописи', 'Предметы талантов'],
  talent_exp: ['Личный опыт', 'Опыт талантов'],
  skin_cards: ['Карточки обликов', 'Карточки'],
  fabric: ['Ткань', 'Материалы обликов'],
};

function updateQuickSettings(next) {
  state.quickSettings = normalizeQuickSettings(next);
  saveState();
}

function downloadQuickSettings() {
  const settings = normalizeQuickSettings(state.quickSettings || {});
  const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'vampire-dominion-quick-settings.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function parseQuickJsonValue(value) {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); }
  catch (error) { throw new Error('Файл не содержит корректный JSON: ' + error.message); }
}

function extractQuickResponse(parsedValue) {
  let parsed = parseQuickJsonValue(parsedValue);
  if (parsed && parsed.log && Array.isArray(parsed.log.entries)) {
    const entries = parsed.log.entries.filter(entry =>
      String(entry.request?.url || '').includes('/calculations/quick') &&
      Number(entry.response?.status) >= 200 &&
      Number(entry.response?.status) < 300 &&
      typeof entry.response?.content?.text === 'string'
    );
    if (!entries.length) throw new Error('В HAR не найден успешный ответ /calculations/quick.');
    const entry = entries[entries.length - 1];
    let body = entry.response.content.text;
    if (entry.response.content.encoding === 'base64') {
      const binary = atob(body);
      const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
      body = new TextDecoder().decode(bytes);
    }
    parsed = parseQuickJsonValue(body);
  }
  if (parsed && parsed.response?.content?.text) {
    parsed = parseQuickJsonValue(parsed.response.content.text);
  }
  if (parsed && parsed.res && typeof parsed.res === 'object') return parsed.res;
  if (parsed && parsed.result && typeof parsed.result === 'object') return parsed.result;
  if (parsed && parsed.ok === true && parsed.result && typeof parsed.result === 'object') return parsed.result;
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  throw new Error('Не удалось определить структуру ответа Quick Calculation.');
}

function quickPlanStats(plan) {
  const levels = Object.keys(plan.levels || {}).length;
  const bonds = Object.values(plan.bonds || {}).reduce((sum, value) => sum + Object.keys(value || {}).length, 0);
  const talents = Object.values(plan.talents || {}).reduce((sum, value) =>
    sum + ['scrolls', 'scripts', 'exp_levels'].reduce((inner, key) =>
      inner + Object.values(value?.[key] || {}).filter(amount => Number(amount) > 0).length, 0), 0);
  const presences = Object.values(plan.presences || {}).reduce((sum, value) => sum + Object.keys(value || {}).length, 0);
  return { levels, bonds, talents, presences, skins: Object.keys(plan.skins || {}).length,
    summons: (plan.summons?.wardens?.length || 0) + (plan.summons?.lovers?.length || 0) };
}

function importQuickResponseFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,.har,application/json';
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      alert('Файл слишком большой для мобильного импорта. Экспортируй из HAR только один JSON-ответ /calculations/quick и импортируй его.');
      return;
    }
    try {
      const parsed = JSON.parse(await file.text());
      const response = extractQuickResponse(parsed);
      const mapped = quickResponseToPlan(response, state.account, state.plan);
      const counts = quickPlanStats(mapped.plan);
      const ignoredAuraCount = Object.values(mapped.ignored.wardenAuraLevels || {})
        .reduce((sum, values) => sum + Object.keys(values || {}).length, 0);
      const ignoredExpCount = Object.values(mapped.ignored.talentExpItems || {})
        .reduce((sum, values) => sum + Object.keys(values || {}).length, 0);
      const detail = [
        'Смотрители по уровням: ' + counts.levels,
        'Партнёры / ветви уз: ' + counts.bonds,
        'Таланты: ' + counts.talents,
        'Веяния: ' + counts.presences,
        'Облики: ' + counts.skins,
        'Призывы: ' + counts.summons,
        ignoredAuraCount ? 'Вдохновения без поля в локальном плане: ' + ignoredAuraCount : '',
        ignoredExpCount ? 'Предметы опыта талантов без поля в локальном плане: ' + ignoredExpCount : '',
      ].filter(Boolean).join('\n');
      const note = ignoredAuraCount || ignoredExpCount
        ? '\n\nЧасть результата пока не поддерживается локальной моделью и не будет применена.'
        : '';
      if (!confirm('Получен серверный результат Quick Calculation.\n\n' + detail + note + '\n\nПеренести поддерживаемые значения в текущий план?')) return;
      state.plan = normalizePlan(mapped.plan, state.account);
      saveState();
      await render();
      closeAppModal();
      alert('Результат Quick перенесён в черновик плана. Профиль и ресурсы не изменены. Проверь расчёт перед применением.');
    } catch (error) {
      alert(error.message || 'Не удалось импортировать результат Quick Calculation.');
    }
  });
  input.click();
}

function renderQuickSettingsModal() {
  const settings = normalizeQuickSettings(state.quickSettings || {});
  const goals = Object.entries(QUICK_GOAL_LABELS).map(([key, label]) =>
    '<option value="' + key + '" ' + (settings.goal === key ? 'selected' : '') + '>' + label + '</option>'
  ).join('');
  const spend = Object.entries(QUICK_SPEND_LABELS).map(([key, labels]) =>
    '<label class="quick-settings-check"><input type="checkbox" data-quick-spend="' + key + '" ' +
    (settings.spend[key] !== false ? 'checked' : '') + '><span><b>' + labels[0] + '</b><small>' + labels[1] + '</small></span></label>'
  ).join('');
  const conclave = ATTRIBUTES.map(attribute =>
    '<label class="quick-settings-inline"><input type="checkbox" data-quick-conclave="' + attribute + '" ' +
    (!(settings.conclave_off || []).includes(attribute) ? 'checked' : '') + '><span>' + tName('attribute', attribute) + '</span></label>'
  ).join('');
  const renderFeatureCheckbox = (kind, id, feature, value, label, checked, extra = '') =>
    '<label class="quick-settings-inline"><input type="checkbox" class="quick-feature-checkbox" data-quick-feature-kind="' + kind +
    '" data-id="' + id + '" data-feature="' + feature + '" data-value="' + value + '" ' + extra + ' ' +
    (checked ? 'checked' : '') + '><span>' + label + '</span></label>';

  const wardenCandidates = GAME_DB.wardens.filter(entity =>
    state.account.ownedWardens[entity.id] || entity.summon_item_id != null
  );
  const wardens = wardenCandidates.map(entity => {
    const id = entity.id;
    const owned = state.account.ownedWardens[id];
    const item = settings.wardens[id] || {};
    const promotions = GAME_DB.warden_promotes
      .filter(row => !owned || row.min_warden_lvl >=
        (GAME_DB.warden_promotes.find(stage => stage.id === Number(owned.promoteId))?.max_warden_lvl ?? 1));
    const auras = (entity.auras || []).filter(row => row.aura_type === 'updatable' && row.upgrade_item_id != null);
    const talents = entity.talents || [];
    const skins = entity.skins || [];
    const promotionHtml = promotions.length
      ? '<details><summary>Прорывы (' + (promotions.length - (item.promotes_off || []).length) + '/' + promotions.length + ')</summary><div class="quick-feature-grid">' +
        promotions.map(row => renderFeatureCheckbox('warden', id, 'promotes_off', row.id,
          escHtml(tName('warden_promote', row.name)) + ' · ур. ' + row.min_warden_lvl,
          !(item.promotes_off || []).includes(row.id))).join('') + '</div></details>'
      : '';
    const talentHtml = talents.length
      ? '<details><summary>Таланты (' + (talents.length - (item.talents_off || []).length) + '/' + talents.length + ')</summary><div class="quick-feature-grid">' +
        talents.map((row, position) => renderFeatureCheckbox('warden', id, 'talents_off', position,
          escHtml(tName('attribute', row.attribute)) + ' · ' + row.stars + '★ · №' + position,
          !(item.talents_off || []).includes(position))).join('') + '</div></details>'
      : '';
    const auraHtml = auras.length
      ? '<details><summary>Вдохновения (' + (auras.length - (item.auras_off || []).length) + '/' + auras.length + ')</summary><div class="quick-feature-grid">' +
        auras.map(row => renderFeatureCheckbox('warden', id, 'auras_off', row.id,
          escHtml(tName('aura', row.name)), !(item.auras_off || []).includes(row.id))).join('') + '</div></details>'
      : '';
    const skinHtml = skins.length
      ? '<details><summary>Облики (' + (skins.length - (item.skins_off || []).length) + '/' + skins.length + ')</summary><div class="quick-feature-grid">' +
        skins.map(row => renderFeatureCheckbox('warden', id, 'skins_off', row.id,
          escHtml(tName('skin', row.name)), !(item.skins_off || []).includes(row.id))).join('') + '</div></details>'
      : '';
    const summonHtml = !owned && entity.summon_item_id != null
      ? renderFeatureCheckbox('warden', id, 'summon', 'true', 'Разрешить призыв', item.summon !== false)
      : '';
    const levelHtml = '<div class="quick-entity-control-row">' +
      '<label class="quick-settings-inline"><input type="checkbox" data-quick-warden-levels="' + id + '" ' +
      (item.levels !== false ? 'checked' : '') + '> <span>Уровни</span></label>' +
      '<label class="quick-settings-inline">Не выше <input class="input quick-settings-max" type="number" min="' +
      (Number(owned?.level) || 1) + '" max="450" placeholder="без лимита" data-quick-warden-max="' + id +
      '" value="' + (item.max_level || '') + '"></label></div>';
    return '<details class="quick-entity-settings"><summary><span>' + escHtml(tName('warden', entity.name)) +
      '</span><small>' + (owned ? 'свой · ур. ' + Number(owned.level || 1) : 'доступен для призыва') +
      (item.off ? ' · выключен' : '') + '</small></summary><div class="quick-entity-settings-body">' +
      renderFeatureCheckbox('warden', id, 'off', 'true', 'Участвует в Quick', !item.off) +
      summonHtml + levelHtml + promotionHtml + talentHtml + auraHtml + skinHtml + '</div></details>';
  }).join('') || '<p class="row-sub">Нет доступных смотрителей.</p>';

  const loverCandidates = GAME_DB.lovers.filter(entity =>
    state.account.ownedLovers[entity.id] || entity.summon_item_id != null
  );
  const lovers = loverCandidates.map(entity => {
    const id = entity.id;
    const owned = state.account.ownedLovers[id];
    const item = settings.lovers[id] || {};
    const bonds = entity.scarlet_bonds || [];
    const presences = (entity.presences || []).filter(row => row.presence_type === 'updatable' && row.upgrade_item_id != null);
    const skins = entity.skins || [];
    const bondsHtml = bonds.length
      ? '<details><summary>Кровные узы (' + (bonds.length * 2 - (item.bonds_off || []).length) + '/' + (bonds.length * 2) + ')</summary><div class="quick-feature-grid">' +
        bonds.flatMap(row => ['level', 'percent'].map(kind => {
          const excluded = (item.bonds_off || []).some(entry => entry.attribute === row.attribute && entry.kind === kind);
          return '<label class="quick-settings-inline"><input type="checkbox" class="quick-feature-checkbox" data-quick-feature-kind="lover" data-id="' + id +
            '" data-feature="bonds_off" data-attribute="' + row.attribute + '" data-kind="' + kind + '" ' +
            (!excluded ? 'checked' : '') + '><span>' + escHtml(tName('attribute', row.attribute)) + ' · ' +
            (kind === 'level' ? 'уровень' : 'процент') + '</span></label>';
        })).join('') + '</div></details>'
      : '';
    const presenceHtml = presences.length
      ? '<details><summary>Веяния (' + (presences.length - (item.presences_off || []).length) + '/' + presences.length + ')</summary><div class="quick-feature-grid">' +
        presences.map(row => renderFeatureCheckbox('lover', id, 'presences_off', row.id,
          escHtml(tName('presence', row.name)), !(item.presences_off || []).includes(row.id))).join('') + '</div></details>'
      : '';
    const skinHtml = skins.length
      ? '<details><summary>Облики (' + (skins.length - (item.skins_off || []).length) + '/' + skins.length + ')</summary><div class="quick-feature-grid">' +
        skins.map(row => renderFeatureCheckbox('lover', id, 'skins_off', row.id,
          escHtml(tName('skin', row.name)), !(item.skins_off || []).includes(row.id))).join('') + '</div></details>'
      : '';
    const summonHtml = !owned && entity.summon_item_id != null
      ? renderFeatureCheckbox('lover', id, 'summon', 'true', 'Разрешить призыв', item.summon !== false)
      : '';
    return '<details class="quick-entity-settings"><summary><span>' + escHtml(tName('lover', entity.name)) +
      '</span><small>' + (owned ? 'свой · близость ' + Number(owned.closeness || 0) : 'доступен для призыва') +
      (item.off ? ' · выключен' : '') + '</small></summary><div class="quick-entity-settings-body">' +
      renderFeatureCheckbox('lover', id, 'off', 'true', 'Участвует в Quick', !item.off) +
      summonHtml + bondsHtml + presenceHtml + skinHtml + '</div></details>';
  }).join('') || '<p class="row-sub">Нет доступных партнёров.</p>';

  const html = '<section class="quick-calc-summary">' +
    '<div class="card-title">Quick Calculation · настройки</div>' +
    '<div class="row-sub">Формат настроек восстановлен по официальному клиенту. Сам алгоритм оптимизации выполняется на сервере игры и в этой локальной копии не воспроизводится.</div>' +
    '<label class="field-stack"><span>Цель оптимизации</span><select class="select" id="quick-goal">' + goals + '</select></label>' +
    '<details open><summary>Что разрешено тратить</summary><div class="quick-settings-spend">' + spend + '</div></details>' +
    '<details><summary>Атрибуты Конклава</summary><div class="quick-settings-inline-wrap">' + conclave + '</div></details>' +
    '<details><summary>Участие смотрителей (' + Object.keys(state.account.ownedWardens || {}).length + ')</summary><div class="quick-settings-entities">' + wardens + '</div></details>' +
    '<details><summary>Участие партнёров (' + Object.keys(state.account.ownedLovers || {}).length + ')</summary><div class="quick-settings-entities">' + lovers + '</div></details>' +
    '<div class="quick-calc-actions"><button class="btn" id="quick-export-settings">Экспорт настроек JSON</button><button class="btn btn-primary" id="quick-import-response">Импортировать ответ API / HAR</button></div>' +
    '<p class="row-sub">Импорт переносит подтверждённый сервером план в черновик. Он не списывает ресурсы и не меняет профиль. Вдохновения и отдельные предметы опыта пока сохраняются в списке неподдерживаемых полей.</p>' +
    '<div class="quick-calc-actions"><button class="btn" id="quick-open-full-calc">Подробный расчёт</button><button class="btn" id="quick-close">Закрыть</button></div>' +
  '</section>';
  openAppModal('Быстрый подсчёт', html);

  const body = document.getElementById('modal-body');
  if (!body) return;
  const refresh = () => renderQuickSettingsModal();
  body.querySelector('#quick-goal')?.addEventListener('change', event => {
    updateQuickSettings({ ...state.quickSettings, goal: event.target.value });
    refresh();
  });
  body.querySelectorAll('[data-quick-spend]').forEach(input => input.addEventListener('change', event => {
    const spend = { ...state.quickSettings.spend, [event.target.dataset.quickSpend]: event.target.checked };
    updateQuickSettings({ ...state.quickSettings, spend });
    refresh();
  }));
  body.querySelectorAll('[data-quick-conclave]').forEach(input => input.addEventListener('change', () => {
    const excluded = [...body.querySelectorAll('[data-quick-conclave]:not(:checked)')]
      .map(node => node.dataset.quickConclave);
    updateQuickSettings({ ...state.quickSettings, conclave_off: excluded });
    refresh();
  }));
  body.querySelectorAll('[data-quick-entity]').forEach(input => input.addEventListener('change', event => {
    const kind = event.target.dataset.quickEntity === 'warden' ? 'wardens' : 'lovers';
    const id = event.target.dataset.id;
    const entities = { ...state.quickSettings[kind] };
    const current = { ...(entities[id] || {}) };
    if (event.target.checked) delete current.off;
    else current.off = true;
    if (Object.keys(current).length) entities[id] = current;
    else delete entities[id];
    updateQuickSettings({ ...state.quickSettings, [kind]: entities });
    refresh();
  }));
  body.querySelectorAll('[data-quick-warden-levels]').forEach(input => input.addEventListener('change', event => {
    const id = event.target.dataset.quickWardenLevels;
    const entities = { ...state.quickSettings.wardens };
    const item = { ...(entities[id] || {}) };
    if (event.target.checked) delete item.levels;
    else item.levels = false;
    entities[id] = item;
    updateQuickSettings({ ...state.quickSettings, wardens: entities });
    refresh();
  }));
  body.querySelectorAll('[data-quick-feature-kind]').forEach(input => input.addEventListener('change', event => {
    const node = event.target;
    const kind = node.dataset.quickFeatureKind === 'warden' ? 'wardens' : 'lovers';
    const id = node.dataset.id;
    const feature = node.dataset.feature;
    const entities = { ...state.quickSettings[kind] };
    const item = { ...(entities[id] || {}) };
    if (feature === 'off') {
      if (node.checked) delete item.off;
      else item.off = true;
    } else if (feature === 'summon') {
      if (node.checked) delete item.summon;
      else item.summon = false;
    } else if (feature === 'bonds_off') {
      const attribute = node.dataset.attribute;
      const bondKind = node.dataset.kind;
      const entries = [...(item.bonds_off || [])];
      const exists = entries.some(entry => entry.attribute === attribute && entry.kind === bondKind);
      item.bonds_off = node.checked
        ? entries.filter(entry => entry.attribute !== attribute || entry.kind !== bondKind)
        : (exists ? entries : [...entries, { attribute, kind: bondKind }]);
    } else {
      const value = Number(node.dataset.value || node.value);
      const values = [...(item[feature] || [])];
      item[feature] = node.checked
        ? values.filter(entry => Number(entry) !== value)
        : [...values.filter(entry => Number(entry) !== value), value];
    }
    if (Object.keys(item).length) entities[id] = item;
    else delete entities[id];
    updateQuickSettings({ ...state.quickSettings, [kind]: entities });
    refresh();
  }));
  body.querySelectorAll('[data-quick-warden-max]').forEach(input => input.addEventListener('change', event => {
    const id = event.target.dataset.quickWardenMax;
    const entities = { ...state.quickSettings.wardens };
    const item = { ...(entities[id] || {}) };
    const value = Math.max(1, Math.min(450, Math.round(Number(event.target.value) || 0)));
    if (event.target.value && Number.isFinite(value)) item.max_level = value;
    else delete item.max_level;
    if (Object.keys(item).length) entities[id] = item;
    else delete entities[id];
    updateQuickSettings({ ...state.quickSettings, wardens: entities });
    refresh();
  }));
  body.querySelector('#quick-export-settings')?.addEventListener('click', downloadQuickSettings);
  body.querySelector('#quick-import-response')?.addEventListener('click', importQuickResponseFile);
  body.querySelector('#quick-open-full-calc')?.addEventListener('click', () => {
    closeAppModal();
    navigate('calc_dominance');
  });
  body.querySelector('#quick-close')?.addEventListener('click', closeAppModal);
}

function openQuickCalculation() {
  if (!calculationSnapshot?.report) return;
  renderQuickSettingsModal();
}

function openFormulaInfo() {
  const oracle = calculationSnapshot;
  if (!oracle) return;
  const coverage = oracle.report?.coverage || {};
  const labels = {
    conclave: 'Конклав', courtyard: 'Сад', levels: 'Уровни', bonds: 'Кровные узы',
    talents: 'Таланты', auras: 'Вдохновения', presences: 'Веяния', skins: 'Облики', summons: 'Призыв'
  };
  const rows = Object.entries(coverage).map(([key, item]) => {
    const status = item.status === 'table_based' ? 'Табличный расчёт'
      : item.status === 'approximate' ? 'Оценочная формула'
      : item.status === 'partial' ? 'Частичная поддержка' : 'Не включено в точный итог';
    return '<div class="formula-status-row"><span>' + (labels[key] || key) + '</span><b>' + status + '</b></div>';
  }).join('');
  const html = '<div class="formula-info-content">' +
    '<p><strong>Локальный движок:</strong> ' + escHtml(oracle.meta?.localEngineVersion || '—') + '</p>' +
    '<p><strong>Каталог:</strong> ' + escHtml(oracle.meta?.dataVersion || '—') + '</p>' +
    '<p><strong>Проект:</strong> независимый калькулятор сообщества любителей игры «Наследие Вампиров».</p>' +
    '<div class="formula-status-list">' + rows + '</div>' +
    '<p class="row-sub">Профиль и план остаются под контролем игрока. Перед применением можно проверить каждую статью расходов.</p>' +
    '<p class="row-sub">Суммы, отмеченные как модельные или оценочные, нельзя трактовать как точные игровые значения.</p>' +
  '</div>';
  openAppModal('Формулы и точность расчётов', html);
}

function escHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
    return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]);
  });
}

function createOwnedWarden(warden) {
  const talents = {};
  (warden.talents || []).forEach(function (item, index) { talents[index] = 1; });
  const auras = {};
  (warden.auras || []).forEach(function (item) { auras[item.id] = Number(item.min_lvl || 0); });
  return {
    level: 1,
    promoteId: 1,
    exp: 0,
    books: { strength: 0, allure: 0, intellect: 0, spirit: 0 },
    talents: talents,
    auras: auras
  };
}

function createOwnedLover(lover) {
  return {
    closeness: 0,
    intimacy: 0,
    affinity: 0,
    sex: lover.fixed_sex || state.settings?.loverSex || 'female',
    bonds: {},
    presences: {}
  };
}

function navigate(screen, params) {
  Object.assign(state, params || {});
  if (screen === 'lover-detail') {
    const lover = GAME_DB.lovers.find(item => item.id === Number(state.currentLoverId));
    const owned = state.account.ownedLovers?.[Number(state.currentLoverId)];
    if (lover && owned) getBondPlan(lover, owned);
  }
  state.screen = screen;
  saveState();
  try { window.scrollTo({ top: 0, behavior: 'instant' }); } catch (error) {}
  render();
}

function getPrimaryNav(screen) {
  if (screen === 'settings') return 'settings';
  if (['resources','wardens_list','warden-detail','lovers','lover-detail','bag','skins','conclave','warden_exp'].includes(screen)) return 'resources';
  if (['calculations','calc_dominance','calc_talents','calc_intimacy'].includes(screen)) return 'calculations';
  return 'home';
}

function getAccountProgressPercent(account) {
  const wPct = Object.keys(account.ownedWardens || {}).length / Math.max(1, GAME_DB.wardens.length);
  const lPct = Object.keys(account.ownedLovers || {}).length / Math.max(1, GAME_DB.lovers.length);
  const bagPct = Object.values(account.bag || {}).filter(function (value) { return Number(value) > 0; }).length / Math.max(1, GAME_DB.items.length);
  return Math.max(0, Math.min(100, Math.round(((wPct + lPct + bagPct) / 3) * 100)));
}

function renderSpaTopbar() {
  const avatar = GAME_DB.wardens.find(function (warden) {
    return warden.id === Number(state.profile.avatarId);
  }) || GAME_DB.wardens[0];
  return [
    '<header class="spa-topbar">',
      '<div class="spa-top-left">',
        '<button class="spa-icon-button spa-language-button" type="button" id="btn-lang" aria-label="Сменить язык">' + state.lang.toUpperCase() + '</button>',
        '<div class="spa-brand">',
          '<img src="./file_00000000f00c821095b68cab8b8fd574.png?v=20261112-3" class="spa-crest" alt="Герб «Наследие Вампиров»" width="44" height="44">',
          '<div class="spa-brand-copy">',
            '<div class="spa-brand-title">Vampire Dominion</div>',
            '<div class="spa-brand-sub">OPTIMIST · ' + escHtml(state.profile.server || 'сервер не указан') + ' · локальный профиль</div>',
          '</div>',
        '</div>',
      '</div>',
      '<div class="spa-top-actions">',
        '<button class="spa-icon-button spa-theme-button" type="button" id="btn-theme" aria-label="Сменить тему">' + (state.settings.theme === 'light' ? '☀' : '☾') + '</button>',
        '<button class="spa-avatar-button" type="button" data-action="nav" data-screen="settings"><img src="' + getIconUrl(avatar.icon_path, state.preferLocalIcons) + '" alt="Профиль"></button>',
        '<button class="spa-icon-button" type="button" id="btn-new-account" aria-label="Новый аккаунт">＋</button>',
      '</div>',
    '</header>'
  ].join('');
}

function renderCalculationNavStrip() {
  const links = [
    ['calc_dominance', 'Господство'],
    ['conclave', 'Конклав и Сад'],
    ['wardens_list', 'Смотрители'],
    ['warden_exp', 'Уровни'],
    ['calc_talents', 'Таланты'],
    ['lovers', 'Партнёры'],
    ['calc_intimacy', 'Близость'],
    ['skins', 'Облики'],
    ['bag', 'Сумка'],
  ];
  return '<nav class="calc-section-nav" aria-label="Разделы калькулятора">' +
    links.map(function (item) {
      return '<button type="button" class="calc-section-link ' + (state.screen === item[0] ? 'is-active' : '') + '" data-action="nav" data-screen="' + item[0] + '">' + item[1] + '</button>';
    }).join('') +
  '</nav>';
}

function renderSubToolbar(backTarget, title) {
  const calcScreens = ['calc_dominance', 'conclave', 'wardens_list', 'warden-detail', 'warden_exp', 'calc_talents', 'lovers', 'lover-detail', 'calc_intimacy', 'skins', 'bag'];
  return '<div class="spa-screen-toolbar">' +
    '<button type="button" class="back-pill" data-action="nav" data-screen="' + backTarget + '">← Назад</button>' +
    '<div class="spa-screen-title">' + title + '</div>' +
    '<div class="spa-toolbar-actions"><button class="icon-btn" type="button" data-action="formula-info" aria-label="Пояснение формул">ⓘ</button>' +
      '<button type="button" class="icon-btn" data-action="undo" ' + (state.history && state.history.length ? '' : 'disabled') + '>↶</button>' +
      '<button type="button" class="icon-btn" data-action="redo" ' + (state.future && state.future.length ? '' : 'disabled') + '>↷</button>' +
    '</div></div>' + (calcScreens.includes(state.screen) ? renderCalculationNavStrip() : '');
}

function renderHomeScreen() {
  const account = state.account;
  const progress = getAccountProgressPercent(account);
  const avatar = GAME_DB.wardens.find(function (warden) {
    return warden.id === Number(state.profile.avatarId);
  }) || GAME_DB.wardens[0];
  const wardenCount = Object.keys(account.ownedWardens || {}).length;
  const loverCount = Object.keys(account.ownedLovers || {}).length;
  const itemCount = Object.values(account.bag || {}).filter(function (value) { return Number(value) > 0; }).length;
  const stats = [
    { icon: '🩸', label: 'Кровь', value: fmt(account.blood || 0), screen: 'resources' },
    { icon: '🛡', label: 'Смотрители', value: wardenCount + '/' + GAME_DB.wardens.length, screen: 'wardens_list' },
    { icon: '♡', label: 'Партнёры', value: loverCount + '/' + GAME_DB.lovers.length, screen: 'lovers' },
    { icon: '◇', label: 'Предметы', value: itemCount + '/' + GAME_DB.items.length, screen: 'bag' },
  ];
  return '<section class="home-screen">' +
    '<div class="home-hero">' +
      '<div class="home-eyebrow">OPTIMIST · ПРОЕКТ СООБЩЕСТВА</div>' +
      '<div class="home-brand-title">Наследие<br>Вампиров</div>' +
      '<div class="home-brand-sub">Vampire Dominion · Crimson Obsidian</div>' +
      '<img src="./file_00000000f00c821095b68cab8b8fd574.png?v=20261112-3" class="home-sticker" alt="Герб «Наследие Вампиров»" width="1254" height="1254">' +
    '</div>' +
    '<div class="profile-main-card" data-action="nav" data-screen="settings">' +
      '<img src="' + getIconUrl(avatar.icon_path, state.preferLocalIcons) + '" class="profile-avatar-lg" alt="Портрет">' +
      '<div class="profile-main-info"><div class="profile-main-name">' + escHtml(state.profile.name) + '</div>' +
      '<div class="profile-main-server">' + escHtml(state.profile.server || 'сервер не указан') + ' · ' + escHtml(state.profile.region || 'EU') + '</div>' +
      '<div class="profile-badge-row"><span class="badge-pill">Локальный профиль</span><span class="badge-pill">' + progress + '% коллекции</span></div>' +
      '<div class="home-profile-progress"><div class="progress-track"><div class="progress-fill" style="width:' + progress + '%"></div></div></div></div><div class="card-right">⌄</div>' +
    '</div>' +
    '<div class="home-resource-grid">' + stats.map(function (item) {
      return '<button type="button" class="home-resource-card" data-action="nav" data-screen="' + item.screen + '"><span class="home-resource-icon">' + item.icon + '</span><span class="home-resource-label">' + item.label + '</span><b>' + item.value + '</b></button>';
    }).join('') + '</div>' +
    '<div class="home-primary-actions"><button class="btn btn-primary home-dominance-cta" type="button" data-action="nav" data-screen="calc_dominance">∑ Подсчёт Господства</button><button class="btn btn-gold" type="button" data-action="quick-calc">⚡ Быстрый подсчёт</button></div>' +
    '<div class="card-stack">' +
      '<div class="nav-card" data-action="nav" data-screen="resources"><div class="card-icon-box">✎</div><div class="card-body"><div class="card-title">Ресурсы и коллекции</div><div class="card-subtitle">Смотрители, партнёры, сумка, облики, Конклав и Сад</div></div><div class="card-right">›</div></div>' +
      '<div class="nav-card" data-action="nav" data-screen="calculations"><div class="card-icon-box">∑</div><div class="card-body"><div class="card-title">Все расчёты</div><div class="card-subtitle">Господство, таланты, близость, влечение, гильдия</div></div><div class="card-right">›</div></div>' +
      '<div class="nav-card" data-action="nav" data-screen="settings"><div class="card-icon-box">⚙</div><div class="card-body"><div class="card-title">Настройки и профили</div><div class="card-subtitle">Сервер, портрет, импорт и экспорт данных</div></div><div class="card-right">›</div></div>' +
    '</div>' +
  '</section>';
}

function renderResourcesScreen() {
  const account = state.account;
  const wCount = Object.keys(account.ownedWardens || {}).length;
  const lCount = Object.keys(account.ownedLovers || {}).length;
  const bagCount = Object.values(account.bag || {}).filter(function (value) { return Number(value) > 0; }).length;
  const allSkins = GAME_DB.wardens.reduce(function (sum, w) { return sum + (w.skins || []).length; }, 0) +
    GAME_DB.lovers.reduce(function (sum, l) { return sum + (l.skins || []).length; }, 0);
  const ownedSkins = Object.values(account.skins || {}).filter(function (value) { return Number(value) > 0; }).length;
  return renderSubToolbar('home', 'Ресурсы') +
    '<div class="resource-summary">' +
      '<div class="resource-chip"><span>🩸 Кровь</span><b>' + fmt(account.blood || 0) + '</b><input class="input" type="number" min="0" data-resource-field="blood" value="' + Number(account.blood || 0) + '"></div>' +
      '<div class="resource-chip"><span>🏛 Очки Конклава</span><b>' + fmt(account.conclaveExp || 0) + '</b><input class="input" type="number" min="0" data-resource-field="conclaveExp" value="' + Number(account.conclaveExp || 0) + '"></div>' +
      '<div class="resource-chip"><span>🌿 Очки Сада</span><b>' + fmt(account.courtyardExp || 0) + '</b><input class="input" type="number" min="0" data-resource-field="courtyardExp" value="' + Number(account.courtyardExp || 0) + '"></div>' +
    '</div>' +
    '<div class="collection-banner resources-banner"><div><b>СОКРОВИЩНИЦА</b><span>Ресурсы и коллекция цитадели</span></div></div>' + '<div class="card-stack">' +
      '<div class="nav-card" data-action="nav" data-screen="summon"><div class="card-icon-box">🩸</div><div class="card-body"><div class="card-title">Призыв</div><div class="card-subtitle">Доступные смотрители и возлюбленные</div></div><div class="card-right">›</div></div>' +
      '<div class="nav-card" data-action="nav" data-screen="wardens_list"><div class="card-icon-box">🛡</div><div class="card-body"><div class="card-title">Смотрители</div><div class="progress-row"><div class="progress-track"><div class="progress-fill" style="width:' + (100 * wCount / GAME_DB.wardens.length) + '%"></div></div><span>' + wCount + '/' + GAME_DB.wardens.length + '</span></div></div><div class="card-right">›</div></div>' +
      '<div class="nav-card" data-action="nav" data-screen="lovers"><div class="card-icon-box">♡</div><div class="card-body"><div class="card-title">Партнёры</div><div class="progress-row"><div class="progress-track"><div class="progress-fill" style="width:' + (100 * lCount / GAME_DB.lovers.length) + '%"></div></div><span>' + lCount + '/' + GAME_DB.lovers.length + '</span></div></div><div class="card-right">›</div></div>' +
      '<div class="nav-card" data-action="nav" data-screen="bag"><div class="card-icon-box">👜</div><div class="card-body"><div class="card-title">Сумка</div><div class="progress-row"><div class="progress-track"><div class="progress-fill" style="width:' + (100 * bagCount / GAME_DB.items.length) + '%"></div></div><span>' + bagCount + '/' + GAME_DB.items.length + '</span></div></div><div class="card-right">›</div></div>' +
      '<div class="nav-card" data-action="nav" data-screen="skins"><div class="card-icon-box">◇</div><div class="card-body"><div class="card-title">Облики</div><div class="progress-row"><div class="progress-track"><div class="progress-fill" style="width:' + (100 * ownedSkins / Math.max(1, allSkins)) + '%"></div></div><span>' + ownedSkins + '/' + allSkins + '</span></div></div><div class="card-right">›</div></div>' +
      '<div class="nav-card" data-action="nav" data-screen="conclave"><div class="card-icon-box">🏛</div><div class="card-body"><div class="card-title">Конклав и Сад</div><div class="card-subtitle">Сад ' + Number(account.courtyardLvl || 0) + ' / 210 · Конклав ' + fmt(account.conclaveExp || 0) + '</div></div><div class="card-right">›</div></div>' +
      '<div class="nav-card" data-action="nav" data-screen="warden_exp"><div class="card-icon-box">⚡</div><div class="card-body"><div class="card-title">Опыт смотрителей</div><div class="card-subtitle">Быстрый ввод опыта талантов для всей коллекции</div></div><div class="card-right">›</div></div>' +
    '</div>';
}


function renderWardensListScreen(db) {
  const ownedIds = Object.keys(state.account.ownedWardens || {}).map(Number);
  let list = ownedIds.map(function (id) { return db.wardens.find(function (warden) { return warden.id === id; }); }).filter(Boolean);
  const filter = state.wardenListFilter || 'all';
  if (filter !== 'all') list = list.filter(function (warden) { return warden.attributes.includes(filter); });
  const query = String(state.wardenListSearch || '').trim().toLocaleLowerCase();
  if (query) list = list.filter(function (warden) { return tName('warden', warden.name).toLocaleLowerCase().includes(query); });
  list.sort(function (a, b) {
    if (state.wardenListSort === 'sum') return (computeWardenDetailedStats(state.account, b.id).sum - computeWardenDetailedStats(state.account, a.id).sum);
    return tName('warden', a.name).localeCompare(tName('warden', b.name), state.lang === 'en' ? 'en' : 'ru');
  });
  return renderSubToolbar('resources', 'Смотрители') +
    '<div class="search-toolbar"><div class="search-box">🔍 <input type="search" data-spa-search="warden" placeholder="Поиск смотрителя..." value="' + escHtml(state.wardenListSearch || '') + '"></div><button class="pill-tab" data-action="toggle-warden-sort">' + (state.wardenListSort === 'sum' ? 'Сумма ↓' : 'Имя ↑') + '</button></div>' +
    '<div class="pill-tabs"><button class="pill-tab ' + (filter === 'all' ? 'active' : '') + '" data-action="warden-filter" data-val="all">Все ' + ownedIds.length + '</button>' +
    ATTRIBUTES.map(function (attr) { return '<button class="pill-tab ' + (filter === attr ? 'active' : '') + '" data-action="warden-filter" data-val="' + attr + '"><span class="dot ' + attr + '"></span>' + tName('attribute', attr) + '</button>'; }).join('') + '</div>' +
    '<div class="card-stack">' + list.map(function (warden) {
      const owned = state.account.ownedWardens[warden.id];
      const stats = computeWardenDetailedStats(state.account, warden.id);
      return '<div class="nav-card" data-action="open-warden" data-id="' + warden.id + '">' +
        '<img src="' + getIconUrl(warden.icon_path, state.preferLocalIcons) + '" class="profile-avatar-lg" style="width:48px;height:48px" alt="">' +
        '<div class="card-body"><div class="card-title">' + tName('warden', warden.name) + '</div><div class="card-subtitle">' + warden.attributes.map(function (attr) { return '<span class="dot ' + attr + '"></span>'; }).join(' ') + ' · ур. ' + Number(owned.level || 1) + ' · ' + tName('warden_promote', (db.promotes.find(function (p) { return p.id === Number(owned.promoteId || 1); }) || {}).name || '') + '</div></div>' +
        '<div class="card-right"><b>' + fmt(stats.sum) + '</b><div class="row-sub">локальная расчётная база</div>›</div></div>';
    }).join('') +
    '<button type="button" class="nav-card add-dashed" data-action="open-add-warden"><strong>＋ Добавить смотрителей (' + ownedIds.length + '/' + db.wardens.length + ')</strong></button></div>' +
    '<details class="attrs-box add-owned-details"><summary>Открыть полный каталог · ' + db.wardens.length + ' смотрителей</summary><div class="grid-2">' +
      db.wardens.filter(function (warden) { return !state.account.ownedWardens[warden.id]; }).map(function (warden) {
        return '<button type="button" class="catalog-pick" data-action="add-warden" data-id="' + warden.id + '">' +
          '<img src="' + getIconUrl(warden.icon_path, state.preferLocalIcons) + '" alt="" style="width:28px;height:28px;object-fit:contain;vertical-align:middle;margin-right:6px">' +
          tName('warden', warden.name) + '</button>';
      }).join('') + '</div></details>';
}


function renderLoversScreen(db) {
  const ownedIds = Object.keys(state.account.ownedLovers || {}).map(Number);
  let list = ownedIds.map(function (id) { return db.lovers.find(function (lover) { return lover.id === id; }); }).filter(Boolean);
  const query = String(state.loverListSearch || '').trim().toLocaleLowerCase();
  if (query) list = list.filter(function (lover) { return tName('lover', lover.name).toLocaleLowerCase().includes(query); });
  return renderSubToolbar('resources', 'Партнёры') + '<div class="collection-banner partners-banner"><div><b>КРОВНЫЕ УЗЫ</b><span>Партнёры · близость · доверие</span></div></div>' +
    '<div class="search-toolbar"><div class="search-box">🔍 <input type="search" data-spa-search="lover" placeholder="Поиск партнёра..." value="' + escHtml(state.loverListSearch || '') + '"></div></div>' +
    '<div class="card-stack">' + list.map(function (lover) {
      const owned = state.account.ownedLovers[lover.id];
      return '<div class="nav-card" data-action="open-lover" data-id="' + lover.id + '"><img src="' + getIconUrl(getLoverIconPath(lover, owned), state.preferLocalIcons) + '" class="profile-avatar-lg" style="width:48px;height:48px" alt=""><div class="card-body"><div class="card-title">' + tName('lover', lover.name) + '</div><div class="card-subtitle">♡ Близость: ' + fmt(owned.closeness || 0) + ' · Доверие: ' + fmt(owned.affinity || 0) + '</div></div><div class="card-right">›</div></div>';
    }).join('') +
    '<button class="nav-card add-dashed" data-action="open-add-lover"><strong>＋ Добавить партнёров (' + ownedIds.length + '/' + db.lovers.length + ')</strong></button>' +
    '<details class="attrs-box add-owned-details"><summary>Добавить из полного каталога</summary><div class="grid-2">' + db.lovers.filter(function (lover) { return !state.account.ownedLovers[lover.id]; }).map(function (lover) {
      return '<button class="catalog-pick" data-action="add-lover" data-id="' + lover.id + '">' + tName('lover', lover.name) + '</button>';
    }).join('') + '</div></details>';
}


function itemBelongsToCategory(item, category) {
  if (category === 'all') return true;
  const tags = item.tags || [];
  const cat = String(item.category || '').toLowerCase();
  if (category === 'lovers') return tags.includes('for_lover') || ['intimacy','attraction','lover_summon'].includes(cat);
  if (category === 'wardens') return tags.includes('for_warden') || ['talent','books','scrolls','scripts','promote','talentexp','warden_summon','rosen'].includes(cat);
  return !itemBelongsToCategory(item, 'lovers') && !itemBelongsToCategory(item, 'wardens');
}

function renderBagScreen(db) {
  const category = state.bagCategory || 'all';
  let items = db.items.filter(function (item) { return itemBelongsToCategory(item, category); });
  const query = String(state.searchQuery || '').trim().toLocaleLowerCase();
  if (query) items = items.filter(function (item) { return tName('item', item.name).toLocaleLowerCase().includes(query); });
  const filled = items.filter(function (item) { return Number(state.account.bag[item.id] || 0) > 0; }).length;
  if (!state.bagShowAll) items = items.filter(function (item) { return Number(state.account.bag[item.id] || 0) > 0; });
  const categoryButtons = [['all','Все'],['wardens','Смотрители'],['lovers','Партнёры'],['other','Другое']];
  const list = items.map(function (item) {
    const amount = Number(state.account.bag[item.id] || 0);
    const url = getIconUrl(item.icon_path, state.preferLocalIcons);
    if (state.bagView === 'grid') {
      return '<button type="button" class="bag-cell ' + (amount === 0 ? 'empty' : '') + '" data-action="edit-bag-item" data-id="' + item.id + '"><div class="bag-cell-icon-wrap"><img src="' + url + '" loading="lazy" alt=""></div><div class="bag-cell-name">' + tName('item', item.name) + '</div><div class="bag-cell-count">' + fmt(amount) + '</div></button>';
    }
    return '<div class="nav-card bag-list-row" style="cursor:default"><div class="bag-cell-icon-wrap"><img src="' + url + '" loading="lazy" alt=""></div><div class="card-body"><div class="card-title">' + tName('item', item.name) + '</div><div class="card-subtitle">' + escHtml(item.category) + ' · ID ' + item.id + '</div></div><input class="input stepper-input bag-item-input" type="number" min="0" data-iid="' + item.id + '" value="' + amount + '"></div>';
  }).join('');
  return renderSubToolbar('resources', 'Сумка') +
    '<div class="search-toolbar"><div class="search-box">🔍 <input type="search" id="inp-bag-search" placeholder="Поиск предмета..." value="' + escHtml(query) + '"></div><div class="toolbar-group"><button class="icon-btn ' + (state.bagView === 'list' ? 'selected' : '') + '" data-action="bag-view" data-view="list">☰</button><button class="icon-btn ' + (state.bagView === 'grid' ? 'selected' : '') + '" data-action="bag-view" data-view="grid">⊞</button></div></div>' +
    '<div class="pill-tabs">' + categoryButtons.map(function (item) { return '<button class="pill-tab ' + (category === item[0] ? 'active' : '') + '" data-action="bag-cat" data-cat="' + item[0] + '">' + item[1] + '</button>'; }).join('') + '</div>' +
    '<div class="bag-tools"><span>' + filled + ' из ' + items.length + ' · ' + db.items.length + ' предметов в каталоге</span><button class="toggle-pill ' + (state.bagShowAll ? 'active' : '') + '" data-action="toggle-bag-all"><span class="toggle-dot"></span>Показать все</button></div>' +
    (state.bagView === 'grid' ? '<div class="bag-grid-4">' + list + '</div>' : '<div class="card-stack">' + list + '</div>');
}

function renderSkinsScreen(db) {
  const type = state.skinTab || 'wardens';
  const isWardens = type === 'wardens';
  const entities = (isWardens ? db.wardens : db.lovers).filter(function (item) { return item.skins && item.skins.length; });
  const search = String(state.skinSearch || '').trim().toLocaleLowerCase();
  const visible = entities.filter(function (entity) { return !search || tName(isWardens ? 'warden' : 'lover', entity.name).toLocaleLowerCase().includes(search); });
  const rows = visible.map(function (entity) {
    const ownerName = tName(isWardens ? 'warden' : 'lover', entity.name);
    return '<section class="attrs-box"><div class="section-owner"><img src="' + getIconUrl(entity.icon_path || entity.icon_path_female || entity.icon_path_male, state.preferLocalIcons) + '" alt=""><b>' + ownerName + '</b><span>' + entity.skins.filter(function (skin) { return Number(state.account.skins[skin.id] || 0) > 0; }).length + '/' + entity.skins.length + '</span></div>' +
      entity.skins.map(function (skin) {
        const level = Number(state.account.skins[skin.id] || 0);
        return '<div class="skin-row"><img src="' + getIconUrl(skin.icon_path, state.preferLocalIcons) + '" alt=""><div class="card-body"><b>' + tName(isWardens ? 'warden_skin' : 'lover_skin', skin.name) + '</b><div class="row-sub">' + String(skin.quality || '').toUpperCase() + ' · макс. ур. ' + (skin.max_lvl || 10) + '</div></div><div class="stepper-group"><button class="stepper-btn" data-action="skin-step" data-skin="' + skin.id + '" data-delta="-1">−</button><span class="stepper-val">' + level + '</span><button class="stepper-btn" data-action="skin-step" data-skin="' + skin.id + '" data-delta="1">+</button></div></div>';
      }).join('') + '</section>';
  }).join('');
  return renderSubToolbar('resources', 'Облики') +
    '<section class="attrs-box"><div class="grid-2">' +
      '<label class="field-stack"><span>Магазин обликов</span><input class="input" type="number" min="0" max="30" data-spa-skin-meta="skinShopCount" value="' + Number(state.account.skinShopCount || 0) + '"></label>' +
      '<label class="field-stack"><span>Опыт магазина</span><input class="input" type="number" min="0" max="100" data-spa-skin-meta="skinShopExp" value="' + Number(state.account.skinShopExp || 0) + '"></label></div></section>' +
    '<div class="pill-tabs"><button class="pill-tab ' + (isWardens ? 'active' : '') + '" data-action="skin-tab" data-tab="wardens">Смотрители</button><button class="pill-tab ' + (!isWardens ? 'active' : '') + '" data-action="skin-tab" data-tab="lovers">Партнёры</button></div>' +
    '<div class="search-toolbar"><div class="search-box">🔍 <input type="search" data-spa-search="skin" placeholder="Поиск персонажа..." value="' + escHtml(search) + '"></div></div>' + rows;
}

function renderWardenExpScreen(db) {
  const ownedMap = state.account.ownedWardens || {};
  const withExp = Object.values(ownedMap).filter(function (owned) { return Number(owned.exp || 0) > 0; }).length;
  const totalExp = Object.values(ownedMap).reduce(function (sum, owned) { return sum + Math.max(0, Number(owned.exp || 0)); }, 0);
  const totalPoints = Object.values(ownedMap).reduce(function (sum, owned) { return sum + Math.floor(Math.max(0, Number(owned.exp || 0)) / 200); }, 0);
  let list = db.wardens.slice();
  if (state.wardenExpFilter === 'with_exp') {
    list = list.filter(function (warden) { return Number(ownedMap[warden.id] && ownedMap[warden.id].exp || 0) > 0; });
  }
  const query = String(state.wardenExpSearch || '').trim().toLocaleLowerCase();
  if (query) list = list.filter(function (warden) { return tName('warden', warden.name).toLocaleLowerCase().includes(query); });
  return renderSubToolbar('calculations', 'Опыт смотрителей') +
    '<section class="attrs-box warden-exp-summary"><div class="card-head"><div><div class="card-title">Опыт талантов</div><div class="row-sub">200 EXP = 1 очко · расчёт отдельно для каждого смотрителя</div></div><span class="badge badge-gold">' + fmt(totalPoints) + ' очк.</span></div>' +
    '<div class="grid-2"><div><div class="row-sub">Всего личного опыта</div><b>' + fmt(totalExp) + ' EXP</b></div><div><div class="row-sub">С опытом</div><b>' + withExp + ' / ' + db.wardens.length + '</b></div></div></section>' +
    '<div class="search-toolbar"><div class="search-box">🔍 <input type="search" data-spa-search="warden-exp" placeholder="Поиск смотрителя..." value="' + escHtml(query) + '"></div></div>' +
    '<div class="pill-tabs"><button class="pill-tab ' + (state.wardenExpFilter !== 'with_exp' ? 'active' : '') + '" data-action="warden-exp-filter" data-val="all">Все ' + db.wardens.length + '</button><button class="pill-tab ' + (state.wardenExpFilter === 'with_exp' ? 'active' : '') + '" data-action="warden-exp-filter" data-val="with_exp">С опытом ' + withExp + '</button></div>' +
    '<div class="row-sub warden-exp-note">Опыт не общий: он расходуется только на таланты того смотрителя, которому записан. Остаток меньше 200 EXP сохраняется у персонажа.</div>' +
    '<div class="card-stack">' + list.map(function (warden) {
      const owned = ownedMap[warden.id];
      const exp = Math.max(0, Number(owned && owned.exp || 0));
      const points = Math.floor(exp / 200);
      const remainder = exp % 200;
      return '<div class="nav-card warden-exp-row" style="cursor:default">' +
        '<img src="' + getIconUrl(warden.icon_path, state.preferLocalIcons) + '" class="profile-avatar-lg" style="width:48px;height:48px" alt="">' +
        '<div class="card-body"><div class="card-title">' + tName('warden', warden.name) + '</div>' +
        '<div class="card-subtitle">' + points + ' очков · остаток ' + fmt(remainder) + ' EXP' + (owned ? ' · в профиле' : ' · добавится при вводе опыта') + '</div></div>' +
        '<input class="input stepper-input" type="number" min="0" step="1" aria-label="Опыт талантов: ' + escHtml(tName('warden', warden.name)) + '" data-spa-quick-exp="' + warden.id + '" value="' + exp + '">' +
      '</div>';
    }).join('') + '</div>' +
    '<div class="talent-actions"><button class="btn" data-action="nav" data-screen="calc_talents">← К талантам</button><button class="btn" data-action="nav" data-screen="resources">Ресурсы</button></div>';
}

function renderCalculationsHubScreen() {
  return renderSubToolbar('home', 'Расчёты') + '<div class="collection-banner calculations-banner"><div><b>АРХИВ РАСЧЁТОВ</b><span>Господство · оптимизация · прогноз</span></div></div>' +
    '<div class="calc-hub-card" data-action="nav" data-screen="calc_dominance"><div class="card-icon-box">∑</div><div class="card-body"><div class="card-title">Подсчёт Господства</div><div class="card-subtitle">10 направлений вложения ресурсов и проверка доступности</div></div><div class="card-right">›</div></div>' +
    '<div class="card-stack">' +
      '<div class="nav-card" data-action="nav" data-screen="calc_talents"><div class="card-icon-box">📜</div><div class="card-body"><div class="card-title">Таланты</div><div class="card-subtitle">Свитки, рукописи, звёзды и оптимизация</div></div><div class="card-right">›</div></div>' +
      '<div class="nav-card" data-action="nav" data-screen="warden_exp"><div class="card-icon-box">⚡</div><div class="card-body"><div class="card-title">Опыт смотрителей</div><div class="card-subtitle">Личный опыт, очки талантов и остаток EXP</div></div><div class="card-right">›</div></div>' +
      '<div class="nav-card" data-action="nav" data-screen="calc_intimacy"><div class="card-icon-box">♡</div><div class="card-body"><div class="card-title">Близость и влечение</div><div class="card-subtitle">Минимум, ожидание и максимум из предметов сумки</div></div><div class="card-right">›</div></div>' +
    '</div>';
}


function renderCoverageCard(report) {
  const labels = {
    conclave: 'Конклав', courtyard: 'Сад', levels: 'Уровни', bonds: 'Кровные узы',
    talents: 'Таланты', auras: 'Вдохновения', presences: 'Веяния', skins: 'Облики', summons: 'Призыв'
  };
  return '<section class="attrs-box"><div class="card-title">Покрытие расчётов</div>' +
    Object.keys(report.coverage || {}).map(function (key) {
      const item = report.coverage[key];
      const status = item.status === 'table_based' ? 'По таблице' : item.status === 'approximate' ? 'Оценочная формула' : item.status === 'partial' ? 'Частично' : 'Не включено в общий итог';
      return '<div class="item-row"><span>' + (labels[key] || key) + '</span><span class="coverage-status ' + item.status + '">' + status + '</span></div>';
    }).join('') +
    '<div class="row-sub">Итоговое Господство не суммирует неподдержанные ветки. Оценочные значения помечены отдельно и не выдаются за подтверждённые сервером.</div>' +
    (report.blockers && report.blockers.length ? '<ul class="coverage-notes">' + report.blockers.map(function (item) { return '<li>' + escHtml(item) + '</li>'; }).join('') + '</ul>' : '') +
    '</section>';
}

function renderDominanceCalcScreen(db, report) {
  return renderSubToolbar('calculations', 'Подсчёт Господства') +
    '<section class="dominance-total-card"><div><div class="card-title">Прирост Господства</div><div class="row-sub">Локальный расчёт через engine.js</div></div><div class="dominance-number">+' + fmt(report.gain.total) + '</div></section>' +
    renderDominanceTab(db, report) + renderCoverageCard(report);
}

function renderProjectInfoCard() {
  return '<section class="attrs-box project-info-card"><div class="card-title">О проекте</div>' +
    '<p class="row-sub">Vampire Dominion — независимый проект энтузиастов и любителей игры «Наследие Вампиров».</p>' +
    '<p class="row-sub">Инструменты для расчётов, планирования развития аккаунта и распределения ресурсов.</p>' +
    '<div class="item-row"><span>Версия калькулятора</span><b>' + escHtml(calculationSnapshot?.meta?.localEngineVersion || '—') + '</b></div>' +
    '<div class="item-row"><span>Версия каталога</span><b>' + escHtml(calculationSnapshot?.meta?.dataVersion || '—') + '</b></div>' +
    '<div class="row-sub">Данные профиля сохраняются локально. Перед применением плана можно проверить затраты и отменить изменения.</div></section>';
}

function renderSettingsScreen() {
  const selected = GAME_DB.wardens.find(function (warden) { return warden.id === Number(state.profile.avatarId); }) || GAME_DB.wardens[0];
  const userId = tg?.initDataUnsafe?.user?.id;
  const settings = state.settings || {};
  const segment = function (key, values, labels) {
    return '<div class="setting-segment" role="group" aria-label="' + key + '">' + values.map(function (value, index) {
      return '<button type="button" class="setting-segment-btn ' + (settings[key] === value ? 'active' : '') + '" data-action="setting-value" data-setting="' + key + '" data-value="' + value + '">' + labels[index] + '</button>';
    }).join('') + '</div>';
  };
  const toggle = function (key, label, description, fallback) {
    const checked = settings[key] === undefined ? fallback : Boolean(settings[key]);
    return '<div class="setting-toggle-row"><div><b>' + label + '</b><div class="row-sub">' + description + '</div></div><button type="button" role="switch" aria-checked="' + checked + '" class="setting-toggle ' + (checked ? 'on' : '') + '" data-action="setting-toggle" data-setting="' + key + '"><span></span></button></div>';
  };
  return renderSubToolbar('home', 'Настройки и профиль') +
    '<div class="collection-banner settings-banner"><div><b>CRIMSON OBSIDIAN</b><span>Параметры цитадели и личного профиля</span></div></div>' +
    '<section class="attrs-box"><div class="card-title">Активный профиль</div><div class="settings-profile-row"><img src="' + getIconUrl(selected.icon_path, state.preferLocalIcons) + '" class="profile-avatar-lg" alt=""><div class="card-body"><b>' + escHtml(state.profile.name) + '</b><div class="row-sub">' + escHtml(state.profile.server || 'сервер не указан') + ' · ' + escHtml(state.profile.region || 'EU') + '</div></div></div>' +
      '<label class="field-stack"><span>Имя профиля</span><input class="input" type="text" maxlength="40" data-spa-profile="name" value="' + escHtml(state.profile.name) + '"></label>' +
      '<div class="grid-2"><label class="field-stack"><span>Номер сервера</span><input class="input" type="text" inputmode="numeric" data-spa-profile="server" value="' + escHtml(state.profile.server) + '"></label>' +
      '<label class="field-stack"><span>Регион</span><select class="select" id="profile-region-select"><option value="EU" ' + (state.profile.region === 'EU' ? 'selected' : '') + '>EU</option><option value="AS" ' + (state.profile.region === 'AS' ? 'selected' : '') + '>AS</option><option value="US" ' + (state.profile.region === 'US' ? 'selected' : '') + '>US</option></select></label></div>' +
      '<details class="portrait-picker"><summary>Выбрать портрет · ' + tName('warden', selected.name) + '</summary><div class="portrait-picker-grid">' + GAME_DB.wardens.map(function (warden) {
        return '<button type="button" class="portrait-picker-item ' + (Number(state.profile.avatarId) === warden.id ? 'selected' : '') + '" data-action="profile-avatar" data-id="' + warden.id + '" aria-label="' + escHtml(tName('warden', warden.name)) + '">' +
          '<img src="' + getIconUrl(warden.icon_path, state.preferLocalIcons) + '" alt=""><span>' + escHtml(tName('warden', warden.name)) + '</span></button>';
      }).join('') + '</div></details></section>' +
    '<section class="attrs-box"><div class="card-title">Профили аккаунтов</div><select class="select account-switch" id="account-switcher">' + state.accounts.map(function (item) {
      return '<option value="' + escHtml(item.id) + '"' + (String(item.id) === String(state.activeAccountId) ? ' selected' : '') + '>' + escHtml(item.name) + ' · ' + escHtml(item.server || 'без сервера') + '</option>';
    }).join('') + '</select>' +
      '<div class="settings-actions"><button class="btn btn-primary" id="btn-create-account-settings">＋ Новый аккаунт</button><button class="btn" id="btn-export">💾 Экспорт профиля</button><button class="btn" id="btn-import">📂 Импорт профиля</button><button class="btn" id="btn-game-connect">🔗 Подключение к игре</button><button class="btn btn-danger" data-action="reset-account">🧹 Очистить калькулятор</button><button class="btn btn-danger" data-action="delete-account">Удалить аккаунт</button></div>' +
      '<div class="row-sub">Профили и ресурсы хранятся локально. Подключение к игровому аккаунту не имитируется: без официального подключения доступно ручное заполнение и импорт JSON.</div></section>' +
    '<section class="attrs-box"><div class="card-title">Вид и оформление</div><div class="setting-preference-row"><div><b>Тема</b><div class="row-sub">Палитра Crimson Obsidian</div></div>' + segment('theme', ['auto','dark','light'], ['Авто','Тёмная','Светлая']) + '</div>' +
      '<div class="setting-preference-row"><div><b>Анимации</b><div class="row-sub">Плавность переходов и движения</div></div>' + segment('animations', ['auto','smooth','less'], ['Авто','Плавно','Меньше']) + '</div>' +
      '<div class="setting-preference-row"><div><b>Пол партнёров по умолчанию</b><div class="row-sub">Применяется к новым записям, если каталог не задаёт пол</div></div>' + segment('loverSex', ['male','female'], ['Мужской','Женский']) + '</div>' +
      toggle('warnOnChoice', 'Предупреждать о выборе', 'Запрашивать подтверждение перед добавлением сущностей в профиль.', true) +
      '<div class="setting-toggle-row"><div><b>Сообщения игрового бота</b><div class="row-sub">Недоступны в автономной версии без подключения к боту. Расчёты и сохранения работают локально.</div></div><span class="badge">Не подключено</span></div>' +
    '</section>' +
    '<section class="attrs-box"><div class="card-title">Уведомления и поддержка</div>' +
      '<div class="setting-id-row"><div><b>Telegram ID</b><div class="row-sub">' + (userId ? escHtml(String(userId)) : 'Доступен только внутри Telegram') + '</div></div><button type="button" class="btn btn-sm" data-action="copy-id" data-copy-kind="user" ' + (userId ? '' : 'disabled') + '>Копировать</button></div>' +
      '<div class="setting-id-row"><div><b>ID локального профиля</b><div class="row-sub">' + escHtml(String(state.activeAccountId || 'primary')) + '</div></div><button type="button" class="btn btn-sm" data-action="copy-id" data-copy-kind="account">Копировать</button></div>' +
      '<div class="row-sub">ID профиля создан внутри этого калькулятора и не является игровым ID аккаунта.</div>' +
    '</section>' + renderProjectInfoCard();
}


function syncBottomNav(activeMain) {
  document.querySelectorAll('#bottom-nav [data-target]').forEach(button => {
    const active = button.dataset.target === activeMain;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
}

async function render() {
  const root = document.getElementById('screen-container') || document.getElementById('app');
  if (!root) return;
  bindNumericPad();
  const renderId = ++renderSerial;
  applyTheme();
  let oracle;
  try {
    oracle = await runLocalAction('calculate', {
      account: state.account,
      plan: state.plan,
    });
  } catch (error) {
    if (renderId !== renderSerial) return;
    calculationSnapshot = null;
    root.innerHTML = '<section class="card card-gold oracle-unavailable">' +
      '<div class="card-title">Локальный расчёт не выполнен</div>' +
      '<p class="row-sub">' + escHtml(error.message || 'Не удалось получить локальный расчёт.') + '</p>' +
      '<p class="row-sub">Расчёт выполняется без сети; если локальный движок вернул ошибку, результат не подменяется фиктивными цифрами.</p>' +
      '<button class="btn btn-primary" id="oracle-retry">Повторить запрос</button></section>';
    root.querySelector('#oracle-retry')?.addEventListener('click', render);
    syncBottomNav(getPrimaryNav(state.screen || 'home'));
    return;
  }
  if (renderId !== renderSerial) return;
  calculationSnapshot = oracle;
  const db = getDbContext();
  const report = oracle.report;
  const notice = '';
  const warnings = oracle.warnings?.length
    ? '<section class="card oracle-warnings"><div class="card-title">Ограничения расчёта</div>' +
      oracle.warnings.map(item => '<div class="row-sub">⚠ ' + escHtml(item.message || item) + '</div>').join('') + '</section>'
    : '';
  root.innerHTML = renderSpaTopbar() + notice + warnings + renderSpaScreen(db, report, oracle);
  syncBottomNav(getPrimaryNav(state.screen || 'home'));
  bindEvents(db);
  bindSpaEvents(db, report, oracle);
}

function renderActiveTab(db, report, oracle) {
  switch (state.activeTab) {
    case 'settings': return renderSettingsTab();
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


function renderSettingsTab() {
  return `
    <section class="card card-gold settings-card">
      <div class="card-head">
        <div>
          <div class="card-title">Настройки профиля</div>
          <div class="row-sub">Локальные параметры приложения и аккаунта</div>
        </div>
        <span class="badge badge-gold">OPTIMIST</span>
      </div>
      <div class="settings-grid">
        <div>
          <label class="row-sub" for="profile-avatar-select">Портрет аккаунта</label>
          <div class="avatar-picker-row">
            <img class="profile-avatar-large" src="${getIconUrl(GAME_DB.wardens.find(w => w.id === Number(state.profile.avatarId))?.icon_path || GAME_DB.wardens[0]?.icon_path)}" alt="Портрет" />
            <select class="select" id="profile-avatar-select" aria-label="Портрет">
              ${GAME_DB.wardens.map(w => '<option value="' + w.id + '"' + (Number(state.profile.avatarId) === w.id ? ' selected' : '') + '>' + tName('warden', w.name) + '</option>').join('')}
            </select>
          </div>
        </div>
        <div>
          <div class="row-sub">Текущий профиль</div>
          <div class="settings-value">${state.profile.name} · ${state.profile.server || 'сервер не указан'}</div>
          <button class="btn btn-sm" id="btn-profile-edit-settings">Изменить профиль</button>
        </div>
      </div>
      <div class="settings-actions">
        <button class="btn" id="btn-export">💾 Экспорт профиля</button>
        <button class="btn" id="btn-import">📂 Импорт профиля</button>
        
        <button class="btn" id="btn-game-connect-panel">🔗 Подключение к игре</button>
        <button class="btn btn-danger" id="btn-reset-account">🧹 Очистить калькулятор</button>
      </div>
      <div class="row-sub settings-note">Профиль и введённые значения хранятся локально в браузере. Экспортируй резервную копию перед очисткой или переносом на другое устройство.</div>
    </section>
  `;
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
      <div class="calc-action-buttons">
        <button class="btn btn-gold" type="button" data-action="save-calculation">💾 Сохранить расчёт</button>
        <button class="btn" type="button" data-action="reset-plan">↺ Сбросить план</button>
        <button class="btn" type="button" data-action="export-profile">⇧ Экспорт профиля</button>
        <button class="btn" type="button" data-action="import-profile">⇩ Импорт профиля</button>
      </div>
    </section>

    <section class="card game-sync-card">
      <div class="card-head">
        <div>
          <span class="card-title">🔗 Подключение игрового аккаунта</span>
          <div class="row-sub">Прямой вход в игровой аккаунт не используется. Значения профиля вводятся вручную.</div>
        </div>
        <span class="badge">Локальный режим</span>
      </div>
      <button class="btn btn-sm" id="btn-game-connect-panel">Проверить способ подключения</button>
      <div class="row-sub" style="margin-top:8px;">Не передавай пароль от игры. Для резервной копии используй экспорт и импорт профиля.</div>
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
              <div class="row-sub">
                Источник цены: API ${upg.bloodCostEvidence?.apiObservedSteps || 0} · Excel ${upg.bloodCostEvidence?.workbookReferenceSteps || 0} · резерв ${upg.bloodCostEvidence?.estimatedSteps || 0}
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

function renderTalentsTab(db, oracle = calculationSnapshot) {
  oracle = oracle || {};
  const wardenResults = oracle.wardens || {};
  return `
    <section class="card card-gold">
      <div class="card-head">
        <div>
          <div class="card-title">📜 Таланты, Рукописи и Опыт смотрителей</div>
          <div class="row-sub">200 опыта = 1 очко таланта · планирование свитков и рукописей по приросту Господства</div>
        </div>
        <button class="btn btn-primary btn-sm" id="btn-auto-talents">⚡ Распределить таланты</button>
      </div>
      ${oracle.talentPlan?.plannedLevels ? `<div class="row-sub">В текущем плане: ${oracle.talentPlan.plannedLevels} уровней · свитки ${oracle.talentPlan.scrollLevels} · рукописи ${oracle.talentPlan.scriptLevels} · личный опыт ${oracle.talentPlan.expLevels} (${fmt(oracle.talentPlan.expSpentTotal)} EXP)</div>` : ''}
      <details class="talent-help-card" open>
        <summary>Как считаются таланты и опыт</summary>
        <div class="talent-help-section">
          <div class="talent-help-item"><b>200 опыта — 1 очко</b><span>Опыт смотрителя переводится в очки талантов по 200 EXP за звёздный пункт.</span></div>
          <div class="talent-help-item"><b>Свитки опыта</b><span>Накопленный опыт складывается в очки; остаток меньше 200 EXP остаётся у персонажа.</span></div>
          <div class="talent-help-item"><b>Свитки таланта</b><span>Свитки соответствуют звёздности таланта. Для повышения выбирай предмет нужной звёздности.</span></div>
          <div class="talent-help-item"><b>Рукописи</b><span>Рукописи срабатывают не всегда. Шанс успеха зависит от звёздности и показан в карточке таланта.</span></div>
        </div>
        <div class="talent-help-section">
          <div class="talent-help-heading">Опыт смотрителей</div>
          <div class="talent-help-item"><b>Только свои таланты</b><span>Личный опыт смотрителя расходуется только на таланты этого персонажа.</span></div>
          <div class="talent-help-item"><b>200 опыта — 1 очко</b><span>Неважно, в какой талант направить очки: личный опыт считается по одной шкале.</span></div>
          <div class="talent-help-item"><b>Сумка отдельно</b><span>Свитки и рукописи учитываются по остаткам в Сумке и не смешиваются с личным EXP.</span></div>
          <div class="talent-help-item"><b>Откуда берутся очки</b><span>Из личного опыта талантов и бонусного опыта за прорывы смотрителя.</span></div>
        </div>
        <div class="talent-help-section">
          <div class="talent-help-heading">Новые смотрители и отмена</div>
          <div class="talent-help-item"><b>Только расчёт</b><span>Планирование не списывает ресурсы. Смотритель должен быть добавлен в профиль, чтобы его таланты попали в расчёт.</span></div>
          <div class="talent-help-item"><b>Можно отменить</b><span>План можно сбросить до применения. Изменения профиля можно вернуть кнопками отмены и повтора.</span></div>
        </div>
      </details>
      <div class="talent-actions talent-actions-three">
        <button class="btn" data-action="nav" data-screen="warden_exp">⚡ Опыт смотрителей</button>
        <button class="btn" id="btn-reset-plan">↶ Отменить план</button>
      </div>
      ${db.wardens.map(w => {
        const isOwned = !!state.account.ownedWardens[w.id];
        const owned = state.account.ownedWardens[w.id];
        const talentResult = wardenResults[w.id] || {};
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
              const selected = state.plan.talents?.[w.id] || {};
              const scrolls = Number(selected.scrolls?.[index]) || 0;
              const scripts = Number(selected.scripts?.[index]) || 0;
              const expLevels = Number(selected.exp_levels?.[index]) || 0;
              const planned = scrolls + scripts + expLevels;
              const target = Math.min(maxTalentLvl, lvl + planned);
              const scrollCount = Number(state.account.bag?.[talent.scroll_item_id]) || 0;
              const scriptCount = Number(state.account.bag?.[talent.script_item_id]) || 0;
              const scriptChance = Number(talent.script_chance) || 0;
              const expCost = Number(talent.exp_cost) || 200 * Number(talent.stars || 1);
              return `<label class="talent-control"><span>${tName('attribute', talent.attribute)} · ${talent.stars}★</span><input class="input talent-level" type="number" min="1" max="${maxTalentLvl}" step="1" data-wid="${w.id}" data-pos="${index}" value="${lvl}" /><small class="row-sub">Свитки: ${fmt(scrollCount)} · Рукописи: ${fmt(scriptCount)} · шанс: ${scriptChance.toFixed(1)}% · ${fmt(expCost)} EXP за уровень</small>${planned ? `<small class="row-sub">Цель: ${target} · +${scrolls} свитки / +${scripts} рукописи / +${expLevels} уровн. за опыт</small>` : ''}</label>`;
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
          <div class="row-sub">Близость открывает ветви уз; очки Доверия расходуются на уровни. Расчёт выполняется локально в браузере.</div>
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
                    <div class="row-sub">Цена по расчёту: ${fmt((detail?.costFlat || 0) + (detail?.costPct || 0))} · Бонус: +${fmt(detail?.totalAttrGain || 0)}</div>
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
let modalControlsBound = false;
let staticNavBound = false;

function openNumericPad(input) {
  if (!input || input.disabled || input.readOnly) return;
  const overlay = document.getElementById('numpad-overlay');
  const title = document.getElementById('numpad-title');
  const display = document.getElementById('numpad-display');
  const resolved = document.getElementById('numpad-resolved');
  const directInput = document.getElementById('numpad-direct-input');
  const keypad = overlay?.querySelector('.numpad-grid');
  if (!overlay || !display || !resolved || !directInput || !keypad) return;

  const multipliers = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 };
  const min = input.min !== '' && Number.isFinite(Number(input.min)) ? Number(input.min) : 0;
  const max = input.max !== '' && Number.isFinite(Number(input.max)) ? Number(input.max) : 1e15;
  const label = input.getAttribute('aria-label')
    || input.closest('label')?.querySelector('span')?.textContent
    || input.closest('.item-row')?.querySelector('.row-name')?.textContent
    || input.dataset.res || 'Введите значение';

  function formatNumber(value) {
    return Math.max(0, Number(value) || 0).toLocaleString(state.lang === 'en' ? 'en-US' : 'ru-RU');
  }

  function parseCompact(value) {
    const match = String(value || '').trim().replace(/\s/g, '').replace(',', '.')
      .match(/^(\d+(?:\.\d+)?)([KMBT])?$/i);
    if (!match) return null;
    const factor = multipliers[String(match[2] || '').toUpperCase()] || 1;
    const result = Number(match[1]) * factor;
    return Number.isFinite(result) ? result : null;
  }

  function compactInitial(value) {
    const number = Math.max(0, Number(value) || 0);
    const units = [['T', 1e12], ['B', 1e9], ['M', 1e6], ['K', 1e3]];
    for (const [suffix, factor] of units) {
      if (number >= factor) {
        const amount = Number((number / factor).toFixed(3)).toString();
        return amount + suffix;
      }
    }
    return String(number);
  }

  let raw = compactInitial(input.value);
  let directMode = false;
  if (title) title.textContent = label;
  overlay.classList.remove('hidden');

  const close = () => {
    overlay.classList.add('hidden');
    directInput.blur();
  };

  const update = () => {
    const valueText = directMode ? directInput.value : raw;
    const parsed = parseCompact(valueText);
    display.textContent = valueText || '0';
    resolved.textContent = parsed == null ? 'Проверь формат числа' : formatNumber(Math.min(max, Math.max(0, parsed)));
    overlay.querySelectorAll('[data-mult]').forEach(button => {
      button.classList.toggle('active', new RegExp('[KMBT]$', 'i').test(valueText)
        && valueText.slice(-1).toUpperCase() === button.dataset.mult);
    });
  };

  directInput.value = raw;
  directInput.hidden = true;
  keypad.hidden = false;
  update();

  directInput.oninput = () => update();

  overlay.onclick = event => {
    if (event.target === overlay) { close(); return; }
    const button = event.target.closest('button');
    if (!button) return;
    const key = button.dataset.key;
    const unit = button.dataset.mult;

    if (key === 'CANCEL') { close(); return; }
    if (key === 'MODE') {
      directMode = !directMode;
      if (directMode) {
        directInput.value = raw;
        directInput.hidden = false;
        display.hidden = true;
        keypad.hidden = true;
        directInput.focus();
      } else {
        raw = directInput.value.trim();
        directInput.hidden = true;
        display.hidden = false;
        keypad.hidden = false;
      }
      update();
      return;
    }
    if (key === 'DONE') {
      const parsed = parseCompact(directMode ? directInput.value : raw);
      if (parsed == null) {
        resolved.textContent = 'Неверный формат. Например: 2.5M';
        return;
      }
      const value = Math.min(max, Math.max(min, parsed));
      input.value = String(Math.round(value));
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      close();
      return;
    }
    if (directMode) return;

    if (unit && multipliers[unit]) {
      const suffix = new RegExp('[KMBT]$', 'i');
      raw = suffix.test(raw) ? raw.replace(suffix, unit) : raw + unit;
    } else if (key === 'BACK') {
      raw = raw.slice(0, -1) || '0';
    } else if (key === '.') {
      const numericPart = raw.replace(/[KMBT]$/i, '');
      if (!numericPart.includes('.')) raw = numericPart + '.' + (raw.match(/[KMBT]$/i)?.[0] || '');
    } else if (/^\d$/.test(key || '')) {
      const suffix = raw.match(/[KMBT]$/i)?.[0] || '';
      const numericPart = raw.replace(/[KMBT]$/i, '');
      raw = (numericPart === '0' ? key : numericPart + key) + suffix;
    } else {
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
    if (event.key === 'Escape') {
      document.getElementById('numpad-overlay')?.classList.add('hidden');
      closeAppModal();
    }
  });

  if (!modalControlsBound) {
    modalControlsBound = true;
    document.getElementById('modal-close')?.addEventListener('click', closeAppModal);
    document.getElementById('modal-body')?.addEventListener('click', event => {
      const button = event.target.closest('[data-modal-nav]');
      if (!button) return;
      closeAppModal();
      navigate(button.dataset.modalNav);
    });
    document.getElementById('modal-overlay')?.addEventListener('click', event => {
      if (event.target === event.currentTarget) closeAppModal();
    });
  }

  if (!staticNavBound) {
    staticNavBound = true;
    document.querySelectorAll('#bottom-nav [data-target]').forEach(button => {
      button.addEventListener('click', () => {
        const destination = button.dataset.target;
        state.screen = destination;
        document.querySelectorAll('#bottom-nav [data-target]').forEach(item => {
          item.classList.toggle('active', item === button);
        });
        saveState();
        render();
      });
    });
  }
}

function pushUndoSnapshot() {
  state.history = state.history || [];
  state.future = state.future || [];
  const snapshot = JSON.stringify({ account: state.account, plan: state.plan });
  if (state.history[state.history.length - 1] !== snapshot) {
    state.history.push(snapshot);
    if (state.history.length > 30) state.history.shift();
    state.future = [];
  }
}

function undoSpa() {
  if (!state.history || !state.history.length) return;
  state.future.push(JSON.stringify({ account: state.account, plan: state.plan }));
  const snapshot = JSON.parse(state.history.pop());
  state.account = normalizeAccountData(snapshot.account);
  state.plan = normalizePlan(snapshot.plan, state.account);
  saveState();
  render();
}

function redoSpa() {
  if (!state.future || !state.future.length) return;
  state.history.push(JSON.stringify({ account: state.account, plan: state.plan }));
  const snapshot = JSON.parse(state.future.pop());
  state.account = normalizeAccountData(snapshot.account);
  state.plan = normalizePlan(snapshot.plan, state.account);
  saveState();
  render();
}

function bindSpaEvents(db, report, oracle) {
  const root = document.getElementById('screen-container');
  if (!root) return;

  root.querySelectorAll('[data-nav]').forEach(function (button) {
    button.addEventListener('click', async function () { navigate(button.dataset.nav); });
  });

  root.querySelectorAll('[data-action]').forEach(function (button) {
    button.addEventListener('click', async function () {
      const action = button.dataset.action;
      if (action === 'quick-calc') return openQuickCalculation();
      if (action === 'save-calculation') return saveCurrentCalculation();
      if (action === 'export-profile') return exportProfileJson();
      if (action === 'import-profile') return importProfileJson();
      if (action === 'reset-plan') {
        if (!globalThis.confirm('Сбросить только план? Данные профиля и ресурсы останутся без изменений.')) return;
        pushUndoSnapshot();
        state.plan = createBlankPlan(state.account);
        saveState();
        return render();
      }
      if (action === 'formula-info') return openFormulaInfo();
      if (action === 'nav') return navigate(button.dataset.screen);
      if (action === 'undo') return undoSpa();
      if (action === 'redo') return redoSpa();
      if (action === 'open-warden') {
        state.currentWardenId = Number(button.dataset.id);
        state.wardenTab = 'attributes';
        return navigate('warden-detail');
      }
      if (action === 'open-warden-picker') return navigate('wardens_list');
      if (action === 'set-warden-tab') { state.wardenTab = button.dataset.tab; return render(); }
      if (action === 'set-lover-tab') { state.loverTab = button.dataset.tab; return render(); }
      if (action === 'setting-value') {
        const key = button.dataset.setting;
        if (!['theme','animations','loverSex'].includes(key)) return;
        state.settings ||= {};
        state.settings[key] = button.dataset.value;
        saveState();
        applyTheme();
        return render();
      }
      if (action === 'setting-toggle') {
        const key = button.dataset.setting;
        if (!['warnOnChoice'].includes(key)) return;
        state.settings ||= {};
        state.settings[key] = !Boolean(state.settings[key] ?? true);
        saveState();
        return render();
      }
      if (action === 'profile-avatar') {
        state.profile.avatarId = Number(button.dataset.id) || 10010;
        saveState();
        return render();
      }
      if (action === 'copy-id') {
        const value = button.dataset.copyKind === 'user' ? String(tg?.initDataUnsafe?.user?.id || '') : String(state.activeAccountId || 'primary');
        if (!value) { alert('Telegram ID недоступен в обычном браузере.'); return; }
        const clipboard = globalThis.navigator?.clipboard;
        if (!clipboard?.writeText) { alert('Браузер не разрешил копирование. Выдели ID и скопируй его вручную.'); return; }
        try { await clipboard.writeText(value); alert('ID скопирован.'); }
        catch { alert('Браузер не разрешил копирование. Выдели ID и скопируй его вручную.'); }
        return;
      }
      if (action === 'delete-account') {
        if (!globalThis.confirm('Удалить активный профиль вместе с его ресурсами и расчётными данными?')) return;
        const activeId = String(state.activeAccountId || 'primary');
        state.accounts = (state.accounts || []).filter(item => String(item.id) !== activeId);
        if (!state.accounts.length) {
          const profile = { id: 'primary', name: 'Оптимист', server: '', region: 'EU', avatarId: 10010 };
          const account = createBlankAccountData();
          const plan = createBlankPlan(account);
          state.accounts = [{ ...profile, account, plan }];
        }
        const selected = state.accounts[0];
        state.activeAccountId = String(selected.id);
        state.profile = { name: selected.name, server: selected.server, region: selected.region, avatarId: selected.avatarId };
        state.account = normalizeAccountData(selected.account);
        state.plan = normalizePlan(selected.plan, state.account);
        state.history = [];
        state.future = [];
        saveState();
        return navigate('home');
      }
      if (action === 'toggle-attr-detail') { state.expandedAttr = state.expandedAttr === button.dataset.attr ? null : button.dataset.attr; return render(); }
      if (action === 'toggle-warden-sort') { state.wardenListSort = state.wardenListSort === 'sum' ? 'name' : 'sum'; return render(); }
      if (action === 'warden-filter') { state.wardenListFilter = button.dataset.val; return render(); }
      if (action === 'warden-exp-filter') { state.wardenExpFilter = button.dataset.val === 'with_exp' ? 'with_exp' : 'all'; return render(); }
      if (action === 'add-warden') {
        const warden = db.wardens.find(function (item) { return item.id === Number(button.dataset.id); });
        if (state.settings?.warnOnChoice && !globalThis.confirm('Добавить смотрителя в профиль?')) return;
        if (!warden || state.account.ownedWardens[warden.id]) return;
        pushUndoSnapshot();
        state.account.ownedWardens[warden.id] = createOwnedWarden(warden);
        state.currentWardenId = warden.id;
        state.wardenTab = 'attributes';
        saveState();
        return navigate('warden-detail');
      }
      if (action === 'open-add-warden') {
        const choices = db.wardens.filter(function (warden) { return !state.account.ownedWardens[warden.id]; });
        const answer = globalThis.prompt('Введите ID смотрителя:\n' + choices.slice(0, 30).map(function (warden) { return warden.id + ' — ' + tName('warden', warden.name); }).join('\n'));
        const warden = db.wardens.find(function (item) { return item.id === Number(answer); });
        if (!warden) return;
        if (state.settings?.warnOnChoice && !globalThis.confirm('Добавить смотрителя в профиль?')) return;
        pushUndoSnapshot();
        state.account.ownedWardens[warden.id] = createOwnedWarden(warden);
        state.currentWardenId = warden.id;
        saveState();
        return navigate('warden-detail');
      }
      if (action === 'delete-warden') {
        if (!globalThis.confirm('Удалить смотрителя из профиля?')) return;
        pushUndoSnapshot();
        delete state.account.ownedWardens[Number(button.dataset.id)];
        saveState();
        return navigate('wardens_list');
      }
      if (action === 'open-lover') { state.currentLoverId = Number(button.dataset.id); return navigate('lover-detail'); }
      if (action === 'open-add-lover') {
        const choices = db.lovers.filter(function (lover) { return !state.account.ownedLovers[lover.id]; });
        const answer = globalThis.prompt('Введите ID партнёра:\n' + choices.slice(0, 30).map(function (lover) { return lover.id + ' — ' + tName('lover', lover.name); }).join('\n'));
        const lover = db.lovers.find(function (item) { return item.id === Number(answer); });
        if (!lover) return;
        if (state.settings?.warnOnChoice && !globalThis.confirm('Добавить партнёра в профиль?')) return;
        pushUndoSnapshot();
        state.account.ownedLovers[lover.id] = createOwnedLover(lover);
        state.currentLoverId = lover.id;
        saveState();
        return navigate('lover-detail');
      }
      if (action === 'add-lover') {
        const lover = db.lovers.find(function (item) { return item.id === Number(button.dataset.id); });
        if (state.settings?.warnOnChoice && !globalThis.confirm('Добавить партнёра в профиль?')) return;
        if (!lover) return;
        pushUndoSnapshot();
        state.account.ownedLovers[lover.id] = createOwnedLover(lover);
        state.currentLoverId = lover.id;
        saveState();
        return navigate('lover-detail');
      }
      if (action === 'skin-step') {
        const id = Number(button.dataset.skin);
        const delta = Number(button.dataset.delta);
        const skin = db.wardens.flatMap(function (warden) { return warden.skins || []; }).concat(db.lovers.flatMap(function (lover) { return lover.skins || []; })).find(function (item) { return item.id === id; });
        if (!skin) return;
        pushUndoSnapshot();
        state.account.skins[id] = Math.min(Number(skin.max_lvl || 10), Math.max(0, Number(state.account.skins[id] || 0) + delta));
        saveState();
        return render();
      }
      if (action === 'skin-tab') { state.skinTab = button.dataset.tab; return render(); }
      if (action === 'bag-cat') { state.bagCategory = button.dataset.cat; return render(); }
      if (action === 'bag-view') { state.bagView = button.dataset.view; return render(); }
      if (action === 'toggle-bag-all') { state.bagShowAll = !state.bagShowAll; return render(); }
      if (action === 'edit-bag-item') {
        const itemId = Number(button.dataset.id);
        const current = Number(state.account.bag[itemId] || 0);
        const answer = globalThis.prompt('Количество предмета:', String(current));
        if (answer == null) return;
        pushUndoSnapshot();
        state.account.bag[itemId] = Math.max(0, Number(answer) || 0);
        saveState();
        return render();
      }
      if (action === 'auto-conclave') {
        pushUndoSnapshot();
        try {
          const result = await runLocalAction('auto-conclave', { account: state.account, plan: state.plan });
          state.plan.conclave = result.levels || result.plan?.conclave || state.plan.conclave;
          saveState();
          return render();
        } catch (error) {
          alert(error.message || 'Локальный движок не смог распределить Конклав.');
          return;
        }
      }
      if (action === 'reset-account') {
        if (!globalThis.confirm('Полностью очистить текущий профиль и все его ресурсы?')) return;
        pushUndoSnapshot();
        state.account = createBlankAccountData();
        state.plan = createBlankPlan(state.account);
        saveState();
        return navigate('resources');
      }
    });
  });

  root.querySelectorAll('[data-spa-search]').forEach(function (input) {
    input.addEventListener('change', function () {
      const key = input.dataset.spaSearch;
      if (key === 'warden') state.wardenListSearch = input.value;
      if (key === 'lover') state.loverListSearch = input.value;
      if (key === 'skin') state.skinSearch = input.value;
      if (key === 'warden-exp') state.wardenExpSearch = input.value;
      saveState();
      render();
    });
  });

  root.querySelectorAll('[data-resource-field]').forEach(function (input) {
    input.addEventListener('change', function () {
      pushUndoSnapshot();
      const key = input.dataset.resourceField;
      const value = Math.max(0, Number(input.value) || 0);
      if (key === 'blood' || key === 'conclaveExp' || key === 'courtyardExp') state.account[key] = value;
      if (key === 'courtyardLvl') state.account.courtyardLvl = Math.min(210, value);
      saveState();
      render();
    });
  });

  root.querySelectorAll('[data-spa-warden-field]').forEach(function (input) {
    input.addEventListener('change', function () {
      pushUndoSnapshot();
      const owned = state.account.ownedWardens[Number(state.currentWardenId)];
      if (!owned) return;
      const key = input.dataset.spaWardenField;
      const value = Math.max(0, Number(input.value) || 0);
      if (key === 'level') owned.level = Math.min(450, Math.max(1, value));
      if (key === 'promoteId') owned.promoteId = Math.min(8, Math.max(1, value));
      saveState();
      render();
    });
  });

  root.querySelectorAll('[data-spa-conclave-level]').forEach(function (input) {
    input.addEventListener('change', function () {
      pushUndoSnapshot();
      state.account.conclave[input.dataset.spaConclaveLevel] = Math.min(180, Math.max(0, Number(input.value) || 0));
      state.plan.conclave[input.dataset.spaConclaveLevel] = state.account.conclave[input.dataset.spaConclaveLevel];
      saveState();
      render();
    });
  });

  root.querySelectorAll('[data-spa-warden-book]').forEach(function (input) {
    input.addEventListener('change', function () {
      pushUndoSnapshot();
      const owned = state.account.ownedWardens[Number(state.currentWardenId)];
      if (!owned) return;
      owned.books = owned.books || {};
      owned.books[input.dataset.spaWardenBook] = Math.max(0, Number(input.value) || 0);
      saveState();
      render();
    });
  });

  root.querySelectorAll('[data-spa-warden-talent]').forEach(function (input) {
    input.addEventListener('change', function () {
      pushUndoSnapshot();
      const owned = state.account.ownedWardens[Number(state.currentWardenId)];
      if (!owned) return;
      owned.talents = owned.talents || {};
      owned.talents[input.dataset.spaWardenTalent] = Math.max(1, Number(input.value) || 1);
      saveState();
      render();
    });
  });

  root.querySelectorAll('[data-spa-warden-aura]').forEach(function (input) {
    input.addEventListener('change', function () {
      pushUndoSnapshot();
      const owned = state.account.ownedWardens[Number(state.currentWardenId)];
      if (!owned) return;
      owned.auras = owned.auras || {};
      owned.auras[input.dataset.spaWardenAura] = Math.max(0, Number(input.value) || 0);
      saveState();
      render();
    });
  });

  root.querySelectorAll('[data-spa-warden-exp]').forEach(function (input) {
    input.addEventListener('change', function () {
      pushUndoSnapshot();
      const owned = state.account.ownedWardens[Number(input.dataset.wid)];
      if (!owned) return;
      owned.exp = Math.max(0, Number(input.value) || 0);
      saveState();
      render();
    });
  });

  root.querySelectorAll('[data-spa-quick-exp]').forEach(function (input) {
    input.addEventListener('change', function () {
      const id = Number(input.dataset.spaQuickExp);
      const warden = db.wardens.find(function (item) { return item.id === id; });
      if (!warden) return;
      const exp = Math.max(0, Number(input.value) || 0);
      const existing = state.account.ownedWardens[id];
      if (!existing && exp === 0) return;
      pushUndoSnapshot();
      if (!existing && exp > 0) state.account.ownedWardens[id] = createOwnedWarden(warden);
      if (state.account.ownedWardens[id]) state.account.ownedWardens[id].exp = exp;
      saveState();
      render();
    });
  });

  root.querySelectorAll('[data-spa-lover-sex]').forEach(function (input) {
    input.addEventListener('change', function () {
      pushUndoSnapshot();
      const owned = state.account.ownedLovers[Number(input.dataset.spaLoverSex)];
      if (!owned) return;
      owned.sex = input.value;
      saveState();
      render();
    });
  });

  root.querySelectorAll('[data-spa-skin-meta]').forEach(function (input) {
    input.addEventListener('change', function () {
      pushUndoSnapshot();
      state.account[input.dataset.spaSkinMeta] = Math.max(0, Number(input.value) || 0);
      saveState();
      render();
    });
  });

  root.querySelectorAll('[data-spa-profile]').forEach(function (input) {
    input.addEventListener('change', function () {
      state.profile[input.dataset.spaProfile] = input.value.trim();
      saveState();
      render();
    });
  });

  root.querySelectorAll('[data-profile-field]').forEach(function (input) {
    input.addEventListener('change', function () {
      state.profile[input.dataset.profileField] = input.value.trim();
      saveState();
      render();
    });
  });

  document.getElementById('btn-create-account-settings')?.addEventListener('click', createNewAccount);

  root.querySelectorAll('#profile-avatar-select').forEach(function (input) {
    input.addEventListener('change', function () {
      state.profile.avatarId = Number(input.value) || 10010;
      saveState();
      render();
    });
  });
}

// Override the earlier tab renderer: the app now follows the multi-screen SPA flow.


function bindEvents(db) {
  document.getElementById('account-switcher')?.addEventListener('change', event => switchAccount(event.target.value));
  document.getElementById('profile-region-select')?.addEventListener('change', event => {
    state.profile.region = event.target.value;
    saveState();
    render();
  });
  document.getElementById('btn-profile-edit')?.addEventListener('click', editProfile);
  document.getElementById('btn-profile-edit-settings')?.addEventListener('click', editProfile);
  document.getElementById('btn-theme')?.addEventListener('click', () => { state.settings.theme = state.settings.theme === 'light' ? 'dark' : 'light'; saveState(); applyTheme(); render(); });
  document.getElementById('btn-new-account')?.addEventListener('click', createNewAccount);
  document.getElementById('btn-reset-account')?.addEventListener('click', () => {
    const ok = globalThis.confirm?.('Полностью очистить текущий аккаунт? Будут удалены смотрители, партнёры, уровни, ресурсы, предметы и план прокачки. Экспортируй профиль заранее, если хочешь сохранить копию.') ?? false;
    if (!ok) return;
    state.account = createBlankAccountData();
    state.plan = createBlankPlan(state.account);
    saveState();
    render();
  });
  document.getElementById('btn-game-connect')?.addEventListener('click', explainGameConnection);
  document.getElementById('btn-game-connect-panel')?.addEventListener('click', explainGameConnection);

  document.getElementById('btn-lang')?.addEventListener('click', () => {
    state.lang = state.lang === 'ru' ? 'en' : 'ru';
    saveState();
    render();
  });

  document.getElementById('btn-auto-talents')?.addEventListener('click', runAutoTalentDistribution);
  document.getElementById('btn-auto-presences')?.addEventListener('click', runAutoPresenceDistribution);
  document.getElementById('btn-auto-bonds')?.addEventListener('click', runAutoBondDistribution);

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
    runLocalAction('auto-conclave', { account: state.account, plan: state.plan }).then(res => {
      state.plan.conclave = res.levels;
      saveState();
      render();
    }).catch(error => alert(error.message || 'Локальный движок не смог распределить Конклав.'));
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
        const result = await runLocalAction('summon', { account: state.account, wardenId: id });
        if (!result.ok) { alert(result.error?.message || 'Локальный движок отклонил призыв.'); return; }
        state.account = normalizeAccountData(result.account);
        saveState();
        render();
      } catch (error) {
        alert(error.message || 'Локальный движок не смог выполнить призыв.');
      }
    });
  });

  document.querySelectorAll('.summon-lover').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.lid);
      const candidate = oracle.summonCandidates.lovers.find(item => item.id === id);
      if (!candidate?.canSummon) { alert('Не хватает предметов для призыва.'); return; }
      try {
        const result = await runLocalAction('summon-lover', { account: state.account, loverId: id });
        if (!result.ok) { alert(result.error?.message || 'Локальный движок отклонил призыв.'); return; }
        state.account = normalizeAccountData(result.account);
        saveState();
        render();
      } catch (error) {
        alert(error.message || 'Локальный движок не смог выполнить призыв.');
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
    document.querySelectorAll('.bag-cell, .bag-list-row').forEach(row => {
      const title = (row.querySelector('.bag-cell-name, .card-title')?.textContent || row.textContent || '').toLocaleLowerCase();
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

  // Экспорт и импорт выполняются локально, без отправки данных на сервер.
  document.getElementById('btn-export')?.addEventListener('click', exportProfileJson);
  document.getElementById('btn-import')?.addEventListener('click', importProfileJson);
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


}

document.addEventListener('DOMContentLoaded', render);