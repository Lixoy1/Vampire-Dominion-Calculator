/**
 * VAMPIRE DOMINION v3.0 — ГЛАВНОЕ ПРИЛОЖЕНИЕ КАЛЬКУЛЯТОРА (БЕЗ VIP-ОГРАНИЧЕНИЙ)
 * Объединяет базу данных (data.js) и расчётное ядро (engine.js) со всеми вкладками.
 */
import { GAME_DB, getIconUrl } from './data.js';
import { buildOraclePlan, normalizeOracleSnapshot } from './oracle-engine.js';
import {
  ATTRIBUTES,
  FABRIC_COST_BY_QUALITY,
  calcAuraPercent,
  buildPresenceCurvesMap,
  calcPresencePercents,
  calcBagPoints,
  calcGuildExp,
  calcWardenBaseTalentStars,
  calcWardenTalentSum,
  calcWardenLevelMultiplier,
  calcLoverBonds,
  calcPromoteBonusExp,
  calcAchievableExpTalentPoints,
  calcConclaveBranch,
  autoDistributeConclave,
  calcCourtyardUpgrade,
  calcMaxCourtyardLevel,
  calcWardenLevelsUpgrade,
  getSummonCandidates,
  summarizeBag,
  calculateTotalDominanceReport,
} from './engine.js';

const STORAGE_KEY = 'vd_crimson_obsidian_v5';
const tg = globalThis.Telegram?.WebApp ?? null;
try { tg?.expand(); tg?.ready(); } catch {}

const presenceCurvesMap = buildPresenceCurvesMap(GAME_DB.lover_presence_levels);

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
    oracleSnapshot: null,
    oracleImportedAt: null,
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
    oracleSnapshot: incoming?.oracleSnapshot ?? null,
    oracleImportedAt: incoming?.oracleImportedAt ?? null,
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
    presenceCurvesMap,
  };
}

function getWardenBaseAttributes(wardenId) {
  const warden = GAME_DB.wardens.find(w => w.id === Number(wardenId));
  const owned = state.account.ownedWardens[wardenId];
  const result = { strength: 0, allure: 0, intellect: 0, spirit: 0 };
  if (!warden || !owned) return result;
  const multiplier = calcWardenLevelMultiplier(owned.level || 1);
  warden.talents.forEach((talent, index) => {
    const level = Number(owned.talents?.[index] ?? 1);
    result[talent.attribute] += level * talent.stars * multiplier;
  });
  return result;
}

function getBondPlan(lover, owned) {
  const plan = state.plan.bonds[lover.id] || (state.plan.bonds[lover.id] = {});
  plan.wardenBaseAttrs = getWardenBaseAttributes(lover.warden_id);
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

// Бесплатное автораспределение доступных ресурсов по всем поддерживаемым разделам.
function runFullAutoDistribute() {
  const db = getDbContext();
  const acc = state.account;

  const wardensByAttr = {};
  for (const attr of ATTRIBUTES) {
    wardensByAttr[attr] = db.wardens.filter(w => acc.ownedWardens[w.id] && w.attributes.includes(attr)).length || 1;
  }
  state.plan.conclave = autoDistributeConclave(db.conclaveLevels, acc.conclave, acc.conclaveExp, wardensByAttr).levels;
  state.plan.courtyardToLvl = calcMaxCourtyardLevel(db.courtyardLevels, acc.courtyardLvl, acc.courtyardExp).toLvl;

  // Симулируем каждый уровень и резервируем предметы прорыва в общей временной сумке.
  let bloodLeft = Math.max(0, Number(acc.blood) || 0);
  const tempBag = { ...acc.bag };
  const nextLevels = {};
  const nextPromotes = {};
  for (const [id, owned] of Object.entries(acc.ownedWardens)) {
    nextLevels[id] = Math.max(1, Number(owned.level) || 1);
    nextPromotes[id] = Math.max(1, Number(owned.promoteId) || 1);
  }

  while (bloodLeft > 0) {
    let best = null;
    let bestEfficiency = 0;
    for (const [id, owned] of Object.entries(acc.ownedWardens)) {
      const warden = db.wardens.find(item => item.id === Number(id));
      if (!warden) continue;
      const from = nextLevels[id];
      if (from >= 450) continue;
      const promoteId = nextPromotes[id];
      const step = calcWardenLevelsUpgrade(warden, from, from + 1, promoteId, db.promotes, tempBag, owned.talents || {});
      if (!step.canPromote || step.bloodSpent <= 0 || step.bloodSpent > bloodLeft) continue;
      const efficiency = step.baseGain / step.bloodSpent;
      if (efficiency > bestEfficiency) {
        bestEfficiency = efficiency;
        best = { id, step, promoteId };
      }
    }
    if (!best) break;

    nextLevels[best.id]++;
    let resultingPromoteId = best.promoteId;
    for (const promote of best.step.neededPromotes || []) {
      resultingPromoteId = Math.max(resultingPromoteId, promote.id);
      for (const itemId of promote.item_ids || []) {
        tempBag[itemId] = Math.max(0, (tempBag[itemId] || 0) - promote.price);
      }
    }
    nextPromotes[best.id] = resultingPromoteId;
    bloodLeft -= best.step.bloodSpent;
  }
  state.plan.levels = nextLevels;
  state.plan.promotes = nextPromotes;

  // Не призываем всех бесплатных персонажей автоматически; выбираем только платные,
  // доступные прямо сейчас, чтобы не менять состав аккаунта неожиданно.
  const candidates = getSummonCandidates(
    db.wardens,
    db.lovers,
    new Set(Object.keys(acc.ownedWardens).map(Number)),
    new Set(Object.keys(acc.ownedLovers).map(Number)),
    tempBag,
  );
  const summonBag = { ...tempBag };
  state.plan.summons.wardens = [];
  for (const candidate of candidates.wardens) {
    if (!candidate.canSummon || candidate.cost <= 0) continue;
    if (candidate.itemId && (summonBag[candidate.itemId] || 0) < candidate.cost) continue;
    if (candidate.itemId) summonBag[candidate.itemId] -= candidate.cost;
    state.plan.summons.wardens.push(candidate.id);
  }

  saveState();
  render();
}

// Применение плана атомарно: сначала проверяем все ресурсы, потом записываем изменения.
function commitPlanToAccount() {
  const db = getDbContext();
  const account = structuredClone(state.account);
  const plan = structuredClone(state.plan);
  for (const [loverId, bondPlan] of Object.entries(plan.bonds || {})) {
    const lover = db.lovers.find(item => item.id === Number(loverId));
    if (lover) bondPlan.wardenBaseAttrs = getWardenBaseAttributes(lover.warden_id);
  }
  const report = calculateTotalDominanceReport({ db, account, plan });
  const fail = message => { alert(message); return false; };

  if (report.spent.blood > account.blood) return fail('Недостаточно Крови для выбранного плана.');
  if (report.spent.conclaveExp > account.conclaveExp) return fail('Недостаточно очков Конклава для выбранного плана.');
  if (report.spent.courtyardExp > account.courtyardExp) return fail('Недостаточно очков Сада для выбранного плана.');

  // Резервируем предметы прорыва по каждому смотрителю в общей копии сумки.
  const wardenPromotes = {};
  for (const [id, targetLevelRaw] of Object.entries(plan.levels || {})) {
    const owned = account.ownedWardens[id];
    const warden = db.wardens.find(item => item.id === Number(id));
    const targetLevel = Math.max(Number(owned?.level) || 1, Number(targetLevelRaw) || 1);
    if (!owned || !warden || targetLevel <= (Number(owned.level) || 1)) continue;
    const currentPromoteId = Math.max(1, Number(owned.promoteId) || 1);
    const upgrade = calcWardenLevelsUpgrade(
      warden, owned.level, targetLevel, currentPromoteId, db.promotes, account.bag, owned.talents || {}
    );
    if (!upgrade.canPromote) {
      const detail = upgrade.missingItems.map(item => `${tName('item', db.items.find(i => i.id === item.itemId)?.name || item.itemId)}: ещё ${item.need}`).join('\n');
      return fail(`Нельзя применить уровни ${tName('warden', warden.name)}. Не хватает предметов прорыва:\n${detail}`);
    }
    let nextPromoteId = currentPromoteId;
    for (const promote of upgrade.neededPromotes || []) {
      nextPromoteId = Math.max(nextPromoteId, promote.id);
      for (const itemId of promote.item_ids || []) {
        const cost = Number(promote.price) || 0;
        if ((account.bag[itemId] || 0) < cost) {
          const itemName = tName('item', db.items.find(i => i.id === itemId)?.name || itemId);
          return fail(`Недостаточно предметов для прорыва ${tName('warden', warden.name)}: ${itemName}.`);
        }
        account.bag[itemId] = Math.max(0, (account.bag[itemId] || 0) - cost);
      }
    }
    wardenPromotes[id] = nextPromoteId;
  }

  // Проверяем и резервируем стоимость всех выбранных призывов.
  const summonCandidates = getSummonCandidates(
    db.wardens, db.lovers,
    new Set(Object.keys(account.ownedWardens).map(Number)),
    new Set(Object.keys(account.ownedLovers).map(Number)),
    account.bag,
  );
  const summonIds = [...new Set((plan.summons?.wardens || []).map(Number))];
  for (const id of summonIds) {
    const candidate = summonCandidates.wardens.find(item => item.id === id);
    if (!candidate || !candidate.canSummon) return fail(`Призыв ${candidate ? tName('warden', candidate.name) : id} недоступен: проверь предметы в сумке.`);
    if (candidate.itemId && candidate.cost > 0) account.bag[candidate.itemId] = Math.max(0, (account.bag[candidate.itemId] || 0) - candidate.cost);
  }

  // Проверяем очки доверия по каждому партнёру отдельно и фиксируем уровни.
  const bondUpdates = {};
  for (const [id, bondPlan] of Object.entries(plan.bonds || {})) {
    const owned = account.ownedLovers[id];
    const lover = db.lovers.find(item => item.id === Number(id));
    if (!owned || !lover) continue;
    const result = calcLoverBonds(lover, owned.affinity || 0, bondPlan, bondPlan.wardenBaseAttrs, owned.closeness || 0);
    if (result.spentAffinity > (owned.affinity || 0)) {
      return fail(`Недостаточно очков Доверия у ${tName('lover', lover.name)}: нужно ${fmt(result.spentAffinity)}, есть ${fmt(owned.affinity || 0)}.`);
    }
    bondUpdates[id] = { spent: result.spentAffinity, states: bondPlan };
  }

  // Все проверки пройдены — применяем изменения к копии аккаунта.
  account.conclave = { ...account.conclave, ...plan.conclave };
  account.conclaveExp = Math.max(0, account.conclaveExp - report.spent.conclaveExp);
  account.courtyardLvl = Math.max(account.courtyardLvl, Number(plan.courtyardToLvl) || account.courtyardLvl);
  account.courtyardExp = Math.max(0, account.courtyardExp - report.spent.courtyardExp);
  account.blood = Math.max(0, account.blood - report.spent.blood);

  for (const [id, targetLevel] of Object.entries(plan.levels || {})) {
    const owned = account.ownedWardens[id];
    if (!owned) continue;
    owned.level = Math.max(owned.level || 1, Number(targetLevel) || 1);
    owned.promoteId = wardenPromotes[id] || plan.promotes?.[id] || owned.promoteId || 1;
  }

  for (const [id, update] of Object.entries(bondUpdates)) {
    const owned = account.ownedLovers[id];
    const lover = db.lovers.find(item => item.id === Number(id));
    owned.affinity = Math.max(0, (owned.affinity || 0) - update.spent);
    owned.bonds ||= {};
    for (const bond of lover?.scarlet_bonds || []) {
      const target = update.states[bond.attribute];
      if (!target) continue;
      owned.bonds[bond.attribute] = {
        level: Number(target.targetLevel ?? target.level ?? 0),
        percentLevel: Number(target.targetPercentLevel ?? target.percentLevel ?? 0),
      };
    }
  }

  for (const id of summonIds) {
    account.ownedWardens[id] = { level: 1, promoteId: 1, exp: 0, talents: {}, auras: {} };
  }

  state.account = account;
  state.plan = createBlankPlan(account);
  saveState();
  render();
  alert('План применён. Ресурсы и предметы списаны из копии аккаунта.');
}

function explainGameConnection() {
  alert('Прямая синхронизация с Game of Vampires пока не подключена: приложенный проект не содержит авторизации или игрового API. Не вводи здесь пароль от игры. Сейчас можно вести профиль вручную и переносить его через JSON. Для автоматической синхронизации нужен официальный API или поддерживаемый разработчиком экспорт.');
}

// Главный рендер вкладок
function render() {
  const root = document.getElementById('app');
  if (!root) return;
  applyTheme();

  const db = getDbContext();
  const report = calculateTotalDominanceReport({ db, account: state.account, plan: state.plan });

  const tabs = [
    ['dominance', '👑 Господство'],
    ['oracle', '🔮 Оракул'],
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
            <div class="brand-sub">${state.profile.name} · ${state.profile.server || 'сервер не указан'} · локальный профиль</div>
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
        ${renderActiveTab(db, report)}
      </main>
      <footer class="app-footnote">
        <span>CRIMSON OBSIDIAN</span><span>Локальный помощник · без VIP-ограничений</span>
      </footer>
    </div>
  `;

  bindEvents(db);
}

function renderActiveTab(db, report) {
  switch (state.activeTab) {
    case 'dominance': return renderDominanceTab(db, report);
    case 'oracle': return renderOracleTab(db);
    case 'conclave': return renderConclaveGardenTab(db, report);
    case 'levels': return renderLevelsTab(db, report);
    case 'talents': return renderTalentsTab(db);
    case 'auras': return renderAurasPresencesTab(db);
    case 'bonds': return renderBondsTab(db);
    case 'skins': return renderSkinsTab(db);
    case 'summon': return renderSummonTab(db);
    case 'bag': return renderBagTab(db, report);
    default: return renderDominanceTab(db, report);
  }
}

function htmlSafe(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function renderOracleTab(db) {
  const snapshot = state.account.oracleSnapshot;
  let model = null;
  let modelError = '';
  if (snapshot) {
    try {
      const wardenNames = Object.fromEntries(db.wardens.map(item => [String(item.id), tName('warden', item.name)]));
      const loverNames = Object.fromEntries(db.lovers.map(item => [String(item.id), tName('lover', item.name)]));
      const itemNames = Object.fromEntries(db.items.map(item => [String(item.id), tName('item', item.name)]));
      model = buildOraclePlan(snapshot, { wardens: wardenNames, lovers: loverNames, items: itemNames });
    } catch (error) {
      modelError = error?.message || 'Не удалось разобрать снимок API.';
    }
  }

  const header = `
    <section class="card card-gold oracle-header">
      <div class="card-head">
        <div>
          <div class="card-title">🔮 OPTIMIST ORACLE</div>
          <div class="row-sub">Серверные ответы «Помощника Дампира» · без выдуманных игровых формул</div>
        </div>
        <span class="badge badge-gold">${model ? 'Данные загружены' : 'Ожидает JSON'}</span>
      </div>
      <div class="oracle-toolbar">
        <input type="file" id="oracle-json-file" accept=".json,application/json,text/json" hidden />
        <button class="btn btn-gold" id="btn-oracle-import">📥 Загрузить JSON API</button>
        <button class="btn" id="btn-oracle-export" ${model ? '' : 'disabled'}>💾 Экспорт снимка</button>
        <button class="btn" id="btn-oracle-clear" ${model ? '' : 'disabled'}>Очистить</button>
      </div>
      ${state.account.oracleImportedAt ? `<div class="row-sub oracle-stamp">Последняя загрузка: ${htmlSafe(new Date(state.account.oracleImportedAt).toLocaleString())}</div>` : ''}
    </section>
  `;

  if (modelError) {
    return header + `
      <section class="card oracle-warning">
        <div class="card-title">Не удалось прочитать сохранённый снимок</div>
        <div class="row-sub">${htmlSafe(modelError)}. Загрузите корректный JSON-ответ API.</div>
      </section>
    `;
  }

  if (!model) {
    return header + `
      <section class="card oracle-empty">
        <div class="oracle-emblem">ORACLE</div>
        <div class="card-title">Загрузите ответ из режима разработчика</div>
        <p class="row-sub">Подойдёт JSON-объект, в котором есть разделы <code>levels</code>, <code>conclave</code>, <code>bonds</code>, <code>auras</code>, <code>presences</code>, <code>skins</code> или <code>talents</code>.</p>
        <p class="row-sub">Oracle прочитает итоговое Господство, четыре атрибута, остатки ресурсов, серверный <code>best_path</code> и точные значения <code>next_cost / next_gain</code>. Файл хранится локально в выбранном профиле.</p>
        <div class="oracle-security">Не загружайте пароли, cookies, токены авторизации или полные данные входа. Нужен только JSON-ответ с расчётами.</div>
      </section>
    `;
  }

  const attrLabel = key => tName('attribute', key);
  const metric = model.metrics;
  const resourceCards = [
    ['Кровь', metric.blood.available, metric.blood.spent, metric.blood.left],
    ['Конклав', metric.conclave.available, metric.conclave.spent, metric.conclave.left],
    ['Доверие', metric.trust.available, metric.trust.spent, metric.trust.left],
  ];
  const resourceMarkup = resourceCards.map(([label, available, spent, left]) => `
    <div class="oracle-resource">
      <div class="row-sub">${label}</div>
      <div class="oracle-value">${fmt(available)}</div>
      <div class="row-sub">Потрачено: ${fmt(spent)} · Остаток: <strong>${fmt(left)}</strong></div>
    </div>
  `).join('');

  const attributesMarkup = metric.attributes.map(row => {
    const gain = metric.gains.find(item => item.attribute === row.attribute)?.total ?? 0;
    return `
      <div class="item-row oracle-attribute">
        <div class="row-info">
          <div class="row-name">${htmlSafe(attrLabel(row.attribute))}</div>
          <div class="row-sub">Прирост в ответе API: +${fmt(gain)}</div>
        </div>
        <div class="oracle-value">${fmt(row.total)}</div>
      </div>
    `;
  }).join('');

  const routeRow = item => {
    const actor = item.section === 'levels'
      ? (db.wardens.find(w => String(w.id) === item.key) ? tName('warden', db.wardens.find(w => String(w.id) === item.key).name) : `Смотритель ${item.key}`)
      : item.section === 'conclave'
        ? attrLabel(item.key)
        : item.key;
    return `
      <div class="item-row oracle-route-row">
        <span class="oracle-step">${item.index}</span>
        <div class="row-info">
          <div class="row-name">${htmlSafe(item.sectionLabel)} · ${htmlSafe(item.label)}</div>
          <div class="row-sub">${htmlSafe(actor)} → цель ${htmlSafe(item.target)}</div>
        </div>
      </div>
    `;
  };
  const visibleRoute = model.paths.slice(0, 16).map(routeRow).join('');
  const fullRoute = model.paths.length > 16 ? `
    <details class="oracle-more">
      <summary>Показать весь серверный маршрут (${model.paths.length} шагов)</summary>
      ${model.paths.slice(16).map(routeRow).join('')}
    </details>
  ` : '';

  const recommendationGroups = Object.entries(model.recommendations).filter(([, rows]) => rows.length);
  const recommendationsMarkup = recommendationGroups.length
    ? recommendationGroups.map(([resource, rows]) => `
      <section class="oracle-recommendation-group">
        <div class="oracle-group-head">
          <strong>${htmlSafe(rows[0].resourceLabel)}</strong>
          <span class="badge">${rows.length} доступно</span>
        </div>
        ${rows.slice(0, 6).map((item, index) => `
          <div class="item-row">
            <span class="oracle-step">${index + 1}</span>
            <div class="row-info">
              <div class="row-name">${htmlSafe(item.label)}</div>
              <div class="row-sub">${htmlSafe(item.detail)} · ${item.free ? 'без затрат' : `цена ${fmt(item.cost)}`}</div>
            </div>
            <div class="oracle-gain">+${fmt(item.gain)}</div>
          </div>
        `).join('')}
      </section>
    `).join('')
    : '<div class="row-sub">По этому снимку нет доступных следующих улучшений с полными next_cost / next_gain и достаточным остатком ресурса.</div>';

  return header + `
    <section class="card">
      <div class="card-head">
        <div>
          <div class="card-title">Снимок сервера</div>
          <div class="row-sub">Значения перенесены из API без пересчёта</div>
        </div>
      </div>
      <div class="oracle-summary-grid">
        <div class="oracle-total"><div class="row-sub">Итоговое Господство</div><div class="oracle-big">${fmt(metric.total)}</div></div>
        <div class="oracle-total"><div class="row-sub">Прирост в ответе</div><div class="oracle-big oracle-positive">+${fmt(metric.gain)}</div></div>
      </div>
      <div class="oracle-resource-grid">${resourceMarkup}</div>
    </section>
    <section class="card">
      <div class="card-head"><div class="card-title">Атрибуты персонажа</div></div>
      <div class="oracle-attributes">${attributesMarkup || '<div class="row-sub">В ответе нет агрегированных атрибутов.</div>'}</div>
    </section>
    <section class="card">
      <div class="card-head">
        <div><div class="card-title">Серверный best_path</div><div class="row-sub">Точный порядок действий, полученный из JSON</div></div>
        <span class="gain-pill">${model.routeCount} шагов</span>
      </div>
      ${model.routeCount ? visibleRoute + fullRoute : '<div class="row-sub">Сервер не вернул непустой best_path для этого снимка.</div>'}
    </section>
    <section class="card">
      <div class="card-head"><div><div class="card-title">Выгодные следующие шаги</div><div class="row-sub">Ранжирование по next_gain / next_cost внутри каждого ресурса</div></div></div>
      ${recommendationsMarkup}
    </section>
    <section class="card oracle-notes">
      <div class="card-title">Правила точности</div>
      ${model.notes.map(note => `<div class="row-sub">• ${htmlSafe(note)}</div>`).join('')}
      <div class="oracle-security">Это анализ загруженного снимка, а не живая синхронизация с игровым сервером. Oracle не списывает ресурсы в игре и не подменяет локальный профиль автоматически.</div>
    </section>
  `;
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
          <div class="row-sub">Кровные узы и Призыв</div>
          <div class="row-name" style="color:var(--ok)">+${fmt(report.gain.bonds + report.gain.summon)}</div>
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

function renderConclaveGardenTab(db, report) {
  const courtUpgrade = calcCourtyardUpgrade(db.courtyardLevels, state.account.courtyardLvl, state.plan.courtyardToLvl);
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
        const br = calcConclaveBranch(db.conclaveLevels, cur, tgt, wCount);
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

function renderLevelsTab(db, report) {
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
        const upg = calcWardenLevelsUpgrade(w, ow.level, tgt, ow.promoteId || 1, db.promotes, state.account.bag, ow.talents);
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

function renderTalentsTab(db) {
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
        const baseStars = calcWardenBaseTalentStars(w);
        const promId = owned?.promoteId || 1;
        const bonusExp = calcPromoteBonusExp(db.promotes, promId);
        const personalExp = Math.max(0, Number(owned?.exp) || 0);
        const totalTalentExp = bonusExp + personalExp;
        const maxTalentLvl = db.promotes.find(p => p.id === promId)?.max_talent_lvl ?? 40;
        const dpPoints = calcAchievableExpTalentPoints(w, maxTalentLvl, totalTalentExp);
        const trainedStars = owned ? calcWardenTalentSum(w, owned.talents || {}) : 0;
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

function renderAurasPresencesTab(db) {
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
              const pct = calcAuraPercent(a, curLvl);
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
              const percs = calcPresencePercents(p, curLvl, presenceCurvesMap);
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

function renderBondsTab(db) {
  const owned = state.account.ownedLovers;
  const ownedCount = Object.keys(owned).length;
  return `
    <section class="card card-gold">
      <div class="card-head">
        <div>
          <div class="card-title">🔗 Кровные узы и спутники (${ownedCount} в профиле)</div>
          <div class="row-sub">Близость открывает ветви уз; очки Доверия расходуются на уровни. План считается локально.</div>
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
        const bondPlan = getBondPlan(l, current);
        const result = calcLoverBonds(l, current.affinity || 0, bondPlan, bondPlan.wardenBaseAttrs, current.closeness || 0);
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

function renderSummonTab(db) {
  const cands = getSummonCandidates(
    db.wardens,
    db.lovers,
    new Set(Object.keys(state.account.ownedWardens).map(Number)),    new Set(Object.keys(state.account.ownedLovers).map(Number)),
    state.account.bag
  );

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

function renderBagTab(db, report) {
  const categories = summarizeBag(db.items, state.account.bag);
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
  document.getElementById('btn-oracle-import')?.addEventListener('click', () => {
    document.getElementById('oracle-json-file')?.click();
  });
  document.getElementById('oracle-json-file')?.addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      state.account.oracleSnapshot = normalizeOracleSnapshot(parsed);
      state.account.oracleImportedAt = new Date().toISOString();
      state.activeTab = 'oracle';
      saveState();
      render();
    } catch (error) {
      alert(`Не удалось импортировать ответ API: ${error?.message || 'ошибка формата'}`);
      event.target.value = '';
    }
  });
  document.getElementById('btn-oracle-export')?.addEventListener('click', () => {
    if (!state.account.oracleSnapshot) return;
    const blob = new Blob([JSON.stringify(state.account.oracleSnapshot, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    const downloadUrl = URL.createObjectURL(blob);
    link.href = downloadUrl;
    link.download = 'optimist-oracle-api-snapshot.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
  });
  document.getElementById('btn-oracle-clear')?.addEventListener('click', () => {
    if (!state.account.oracleSnapshot || !confirm('Удалить сохранённый JSON-снимок Oracle из этого профиля?')) return;
    state.account.oracleSnapshot = null;
    state.account.oracleImportedAt = null;
    saveState();
    render();
  });
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
    const wardensByAttr = {};
    for (const attr of ATTRIBUTES) {
      wardensByAttr[attr] = db.wardens.filter(w => state.account.ownedWardens[w.id] && w.attributes.includes(attr)).length || 1;
    }
    const res = autoDistributeConclave(db.conclaveLevels, state.account.conclave, state.account.conclaveExp, wardensByAttr);
    state.plan.conclave = res.levels;
    saveState();
    render();
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
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.wid);
      const candidate = getSummonCandidates(db.wardens, db.lovers,
        new Set(Object.keys(state.account.ownedWardens).map(Number)),
        new Set(Object.keys(state.account.ownedLovers).map(Number)), state.account.bag
      ).wardens.find(item => item.id === id);
      if (!candidate?.canSummon) { alert('Не хватает предметов для призыва.'); return; }
      if (candidate.itemId && candidate.cost > 0) state.account.bag[candidate.itemId] = Math.max(0, (state.account.bag[candidate.itemId] || 0) - candidate.cost);
      state.account.ownedWardens[id] = { level: 1, promoteId: 1, exp: 0, talents: {}, auras: {} };
      saveState();
      render();
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