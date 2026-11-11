/**
 * НАСЛЕДИЕ ВАМПИРОВ V6 — CRIMSON OBSIDIAN
 * Бесплатный Telegram Mini App с локальными профилями и проверяемыми расчётными модулями.
 */
import { GAME_DB, getIconUrl } from './data.js';
import { isCalculationSnapshotPayload, normalizeCalculationSnapshot } from './snapshot-adapter.js';
import { createInventoryLedger } from './inventory-ledger.js';
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
    calculationSnapshot: null,
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


function createStarterAccountData() {
  const account = createBlankAccountData();
  account.blood = 1;
  account.skinShopCount = 0;
  account.skinShopExp = 0;

  for (const warden of GAME_DB.wardens.slice(0, 4)) {
    const talents = {};
    warden.talents.forEach((talent, index) => { talents[talent.position ?? index] = 1; });
    const auras = {};
    for (const aura of warden.auras || []) auras[aura.id] = 1;
    account.ownedWardens[warden.id] = {
      level: 1,
      promoteId: 2,
      exp: 0,
      books: { strength: 0, allure: 0, intellect: 0, spirit: 0 },
      talents,
      auras,
    };
  }

  for (const [index, lover] of GAME_DB.lovers.slice(0, 2).entries()) {
    account.ownedLovers[lover.id] = {
      closeness: index === 0 ? 7 : 0,
      intimacy: index === 0 ? 7 : 0,
      affinity: index === 0 ? 10 : 0,
      sex: lover.fixed_sex || 'female',
      bonds: {},
      presences: {},
    };
  }

  account.bag = { 4151: 1, 4152: 1, 30005: 1 };
  return account;
}

function createDefaultState() {
  const id = 'primary';
  const profile = {
    name: globalThis.Telegram?.WebApp?.initDataUnsafe?.user?.first_name || 'Оптимист',
    server: '',
    region: 'EU',
    avatarId: 10010,
  };
  const account = createStarterAccountData();
  const plan = createBlankPlan(account);
  return {
    version: 6,
    lang: 'ru',
    preferLocalIcons: true,
    screen: 'home',
    activeTab: 'dominance',
    bagFilter: 'all',
    searchQuery: '',
    profile,
    settings: { theme: 'dark', loverSex: 'female' },
    account,
    plan,
    activeAccountId: id,
    accounts: [{ id, ...profile, account, plan }],
    currentWardenId: 10020,
    currentLoverId: GAME_DB.lovers[0]?.id ?? 20010,
    wardenTab: 'attributes',
    expandedAttr: null,
    wardenListFilter: 'all',
    wardenListSearch: '',
    wardenListSort: 'name',
    loverListSearch: '',
    bagCategory: 'wardens',
    bagView: 'grid',
    bagShowAll: true,
    skinTab: 'wardens',
    skinFilter: 'all',
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
  if (!report.canApply) {
    const reasons = report.blockers?.length
      ? report.blockers
      : ['В плане есть действия, которые пока не прошли проверку ресурсов или доступности.'];
    return fail(`План пока нельзя безопасно применить:\\n• ${reasons.join('\\n• ')}\\n\\nСохрани профиль и дождись сверки этих расчётов с серверными данными.`);
  }
  const inventoryLedger = createInventoryLedger(account.bag);

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
      warden, owned.level, targetLevel, currentPromoteId, db.promotes, inventoryLedger.getRemaining(), owned.talents || {}
    );
    if (!upgrade.canPromote) {
      const detail = upgrade.missingItems.map(item => `${tName('item', db.items.find(i => i.id === item.itemId)?.name || item.itemId)}: ещё ${item.need}`).join('\n');
      return fail(`Нельзя применить уровни ${tName('warden', warden.name)}. Не хватает предметов прорыва:\n${detail}`);
    }
    let nextPromoteId = currentPromoteId;
    const promoteReservations = [];
    for (const promote of upgrade.neededPromotes || []) {
      nextPromoteId = Math.max(nextPromoteId, promote.id);
      for (const itemId of promote.item_ids || []) {
        promoteReservations.push({
          itemId,
          amount: Number(promote.price) || 0,
          reason: `Прорыв ${tName('warden', warden.name)} · ${tName('warden_promote', promote.name)}`,
        });
      }
    }
    const reservation = inventoryLedger.reserveMany(promoteReservations);
    if (!reservation.ok) {
      const detail = reservation.failures.map(item => {
        const itemName = tName('item', db.items.find(i => i.id === Number(item.itemId))?.name || item.itemId);
        return `${itemName}: ещё ${fmt(item.missing ?? item.need)}`;
      }).join('\\n');
      return fail(`Не удалось зарезервировать предметы прорыва для ${tName('warden', warden.name)}:\\n${detail}`);
    }
    wardenPromotes[id] = nextPromoteId;
  }

  // Проверяем и резервируем стоимость всех выбранных призывов.
  const summonCandidates = getSummonCandidates(
    db.wardens, db.lovers,
    new Set(Object.keys(account.ownedWardens).map(Number)),
    new Set(Object.keys(account.ownedLovers).map(Number)),
    inventoryLedger.getRemaining(),
  );
  const summonIds = [...new Set((plan.summons?.wardens || []).map(Number))];
  const loverSummonIds = [...new Set((plan.summons?.lovers || []).map(Number))];

  for (const id of summonIds) {
    const candidate = summonCandidates.wardens.find(item => item.id === id);
    if (!candidate || !candidate.canSummon) {
      return fail(`Призыв ${candidate ? tName('warden', candidate.name) : id} недоступен: проверь условия и предметы в сумке.`);
    }
    if (candidate.itemId != null && candidate.cost > 0) {
      const reservation = inventoryLedger.reserve(candidate.itemId, candidate.cost, `Призыв Хранителя ${tName('warden', candidate.name)}`);
      if (!reservation.ok) {
        const missing = reservation.failures[0]?.missing ?? candidate.cost;
        return fail(`Не хватает ${fmt(missing)} предметов для призыва ${tName('warden', candidate.name)}.`);
      }
    }
  }

  for (const id of loverSummonIds) {
    const candidate = summonCandidates.lovers.find(item => item.id === id);
    if (!candidate || !candidate.canSummon) {
      return fail(`Призыв Возлюбленного ${candidate ? tName('lover', candidate.name) : id} недоступен: проверь условия и предметы в сумке.`);
    }
    if (candidate.itemId != null && candidate.cost > 0) {
      const reservation = inventoryLedger.reserve(candidate.itemId, candidate.cost, `Призыв Возлюбленного ${tName('lover', candidate.name)}`);
      if (!reservation.ok) {
        const missing = reservation.failures[0]?.missing ?? candidate.cost;
        return fail(`Не хватает ${fmt(missing)} предметов для призыва ${tName('lover', candidate.name)}.`);
      }
    }
  }

  // Итоговый остаток сумки фиксируется только после успешной проверки всего плана.
  account.bag = inventoryLedger.getRemaining();

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
  for (const id of loverSummonIds) {
    const lover = db.lovers.find(item => item.id === id);
    account.ownedLovers[id] = {
      affinity: 0,
      closeness: 0,
      sex: lover?.fixed_sex || state.settings.loverSex || 'female',
      presences: {},
      bonds: {},
    };
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
          <div class="brand-crest" aria-label="Корона Наследия">♛</div>
          <div>
            <div class="brand-title">НАСЛЕДИЕ ВАМПИРОВ</div>
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
          <button class="btn btn-gold btn-sm" id="btn-auto-all">⚡ Подбор плана</button>
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
        <span>♛ НАСЛЕДИЕ ВАМПИРОВ</span><span>Бесплатный помощник · все функции открыты</span>
      </footer>
    </div>
  `;

  bindEvents(db);
}

function renderActiveTab(db, report) {
  switch (state.activeTab) {
    case 'dominance': return renderDominanceTab(db, report);
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

function renderServerSnapshotCard() {
  const record = state.account.calculationSnapshot;
  if (!record?.data) {
    return `
      <section class="card">
        <div class="card-head">
          <div>
            <div class="card-title">◈ Проверка по серверному расчёту</div>
            <div class="row-sub">Импортируй JSON-ответ калькулятора через кнопку «Импорт» — снимок будет показан отдельно от локального плана</div>
          </div>
          <span class="badge">Ожидает JSON</span>
        </div>
        <div class="row-sub">Поддерживается ответ с полями total, attributes и gain. Профиль игры, пароль или токен не нужны.</div>
      </section>
    `;
  }

  let snapshot;
  try {
    snapshot = normalizeCalculationSnapshot(record.data);
  } catch {
    return `
      <section class="card">
        <div class="card-title">◈ Серверный снимок не прочитан</div>
        <div class="row-sub">Файл остался в профиле, но его структура не распознана.</div>
        <button class="btn btn-sm" id="btn-clear-snapshot">Удалить снимок</button>
      </section>
    `;
  }

  const capturedAt = record.capturedAt ? new Date(record.capturedAt) : null;
  const capturedLabel = capturedAt && Number.isFinite(capturedAt.getTime())
    ? capturedAt.toLocaleString(state.lang === 'en' ? 'en-US' : 'ru-RU')
    : 'время неизвестно';
  const attributes = ATTRIBUTES.map(attr => `
    <div class="card" style="margin:0;padding:10px;">
      <div class="row-sub">${tName('attribute', attr)}</div>
      <div class="row-name">${snapshot.attributes[attr] == null ? '—' : fmt(snapshot.attributes[attr])}</div>
      <div class="gain-pill">${snapshot.gain.attributes[attr] == null ? '—' : '+' + fmt(snapshot.gain.attributes[attr])}</div>
    </div>
  `).join('');
  const sectionRows = [
    ['Конклав', snapshot.sections.conclave?.gain],
    ['Сад / Двор', snapshot.sections.courtyard?.gain],
    ['Уровни Хранителей', snapshot.sections.levels?.gain],
    ['Кровные узы', snapshot.sections.bonds?.gain],
    ['Вдохновения', snapshot.sections.auras?.gain],
    ['Веяния', snapshot.sections.presences?.gain],
    ['Облики', snapshot.sections.skins?.gain],
    ['Таланты', snapshot.sections.talents?.gain],
  ];
  const sections = sectionRows.map(([label, value]) => `
    <div class="item-row">
      <div class="row-info"><div class="row-name">${label}</div></div>
      <div class="row-name">${value == null ? '—' : '+' + fmt(value)}</div>
    </div>
  `).join('');
  const books = snapshot.sections.books;
  const booksLine = books && (books.minimum != null || books.expected != null || books.maximum != null)
    ? `<div class="row-sub">Книги: минимум ${books.minimum == null ? '—' : fmt(books.minimum)} · ожидание ${books.expected == null ? '—' : fmt(books.expected)} · максимум ${books.maximum == null ? '—' : fmt(books.maximum)}</div>`
    : '';

  return `
    <section class="card card-gold">
      <div class="card-head">
        <div>
          <div class="card-title">◈ Эталонный серверный расчёт</div>
          <div class="row-sub">Импортирован: ${capturedLabel} · это сохранённый снимок, не live-синхронизация</div>
        </div>
        <span class="badge badge-ok">JSON распознан</span>
      </div>
      <div class="grid-2" style="margin-bottom:10px;">
        <div class="card" style="margin:0;padding:11px;">
          <div class="row-sub">Итоговое Господство</div>
          <div class="gain-pill">${snapshot.total == null ? '—' : fmt(snapshot.total)}</div>
        </div>
        <div class="card" style="margin:0;padding:11px;">
          <div class="row-sub">Прирост по плану сервера</div>
          <div class="gain-pill">+${snapshot.gain.total == null ? '—' : fmt(snapshot.gain.total)}</div>
        </div>
      </div>
      <div class="grid-4">${attributes}</div>
      <div class="card-title" style="margin-top:14px;">Разложение прироста по системам</div>
      ${sections}
      ${booksLine}
      <div class="row-sub" style="margin-top:8px;">Значения «—» означают, что сервер не прислал отдельный итог по этой системе. Они не заменяются нулями.</div>
      <button class="btn btn-sm" id="btn-clear-snapshot" style="margin-top:10px;">Удалить серверный снимок</button>
    </section>
  `;
}

function renderDominanceTab(db, report) {
  const coverageLabels = {
    conclave: 'Конклав',
    courtyard: 'Сад',
    levels: 'Уровни Хранителей',
    bonds: 'Кровные узы',
    talents: 'Таланты',
    auras: 'Вдохновения',
    presences: 'Веяния',
    skins: 'Облики',
    summons: 'Призыв',
  };
  const coverageStatus = status => ({
    table_based: 'По таблице',
    approximate: 'Оценка',
    partial: 'Частично',
    not_included: 'Не входит в итог',
  }[status] || 'Не проверено');
  const coverageRows = Object.entries(report.coverage || {}).map(([key, value]) => `
    <div class="item-row">
      <div class="row-info"><div class="row-name">${coverageLabels[key] || key}</div></div>
      <span class="badge ${value.status === 'table_based' ? 'badge-ok' : ''}">${coverageStatus(value.status)}</span>
    </div>
  `).join('');
  const attributeRows = ATTRIBUTES.map(attr => `
    <div class="card" style="margin:0;padding:10px;">
      <div class="row-sub">${tName('attribute', attr)}</div>
      <div class="row-name">${fmt(report.gain.byAttribute?.[attr] || 0)}</div>
    </div>
  `).join('');
  return `
    <section class="card card-gold">
      <div class="card-head">
        <div>
          <div class="card-title">Локальный прогноз Господства</div>
          <div class="row-sub">Расчёт по подтверждённым таблицам и отдельным модулям; оценки помечаются отдельно</div>
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
      <div class="card-title" style="margin-top:14px;">Прирост по атрибутам</div>
      <div class="grid-4">${attributeRows}</div>
      <div class="row-sub" style="margin-top:8px;">Нераспределённый по атрибутам прирост: ${fmt(report.gain.unallocated || 0)}</div>
      <div class="card-title" style="margin-top:14px;">Покрытие расчётами</div>
      ${coverageRows}
      <div class="bond-warning" style="margin-top:10px;">
        Это локальный прогноз, а не полный серверный итог. Стоимость Крови и Кровных уз пока ориентировочная; Таланты, Вдохновения, Веяния и Облики ещё не входят в локальную сумму. Для эталонных значений импортируй JSON-ответ калькулятора.
      </div>
      ${report.blockers?.length ? `<div class="row-sub" style="margin-top:8px;">${report.blockers.map(reason => `• ${reason}`).join('<br>')}</div>` : ''}
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:12px;">
        <button class="btn btn-gold" id="btn-quick-run">⚡ Подобрать план по доступным данным</button>
        <button class="btn btn-primary" id="btn-commit-plan" ${report.canApply ? '' : 'disabled'}>✅ ${report.canApply ? 'Применить проверенный план' : 'Применение заблокировано'}</button>
        <button class="btn" id="btn-reset-plan">↺ Сбросить план</button>
      </div>
    </section>

${renderServerSnapshotCard()}

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
    new Set(Object.keys(state.account.ownedWardens).map(Number)),
    new Set(Object.keys(state.account.ownedLovers).map(Number)),
    state.account.bag
  );

  const availabilityText = (candidate, itemObj) => {
    if (candidate.canSummon) {
      return itemObj
        ? `Можно призвать: ${candidate.cost} × ${tName('item', itemObj.name)} (в сумке: ${candidate.have})`
        : 'Призыв разрешён по явному признаку доступности';
    }
    if (candidate.availabilityReason === 'insufficient_items') {
      return `Не хватает: ${Math.max(0, candidate.cost - candidate.have)} × ${itemObj ? tName('item', itemObj.name) : candidate.itemId}`;
    }
    if (candidate.availabilityReason === 'not_available') return 'Сейчас призыв недоступен';
    return 'Условие призыва не подтверждено данными каталога. Добавляй персонажа в профиль после получения в игре';
  };

  return `
    <section class="card card-gold">
      <div class="card-head">
        <div>
          <div class="card-title">➕ Хранители · ${cands.wardens.length}</div>
          <div class="row-sub">Кнопка призыва активна только при подтверждённом условии и достаточном количестве предметов</div>
        </div>
      </div>
      ${cands.wardens.map(c => {
        const w = db.wardens.find(x => x.id === c.id);
        const itemObj = c.itemId == null ? null : db.items.find(i => i.id === c.itemId);
        return `
          <div class="item-row">
            <img class="avatar" src="${getIconUrl(w?.icon_path, state.preferLocalIcons)}" alt="" loading="lazy" />
            <div class="row-info">
              <div class="row-name">${tName('warden', c.name)} · ${c.baseTalentStars}★</div>
              <div class="row-sub">${availabilityText(c, itemObj)}</div>
            </div>
            <button class="btn btn-sm btn-primary summon-warden" data-wid="${c.id}" ${c.canSummon ? '' : 'disabled'}>${c.canSummon ? 'Призвать' : 'Недоступно'}</button>
          </div>
        `;
      }).join('')}
    </section>

    <section class="card">
      <div class="card-head">
        <div>
          <div class="card-title">♥ Возлюбленные · ${cands.lovers.length}</div>
          <div class="row-sub">Призыв партнёра учитывает его собственный предмет; связь со Смотрителем показана отдельно</div>
        </div>
      </div>
      ${cands.lovers.map(c => {
        const l = db.lovers.find(x => x.id === c.id);
        const w = db.wardens.find(x => x.id === c.wardenId);
        const itemObj = c.itemId == null ? null : db.items.find(i => i.id === c.itemId);
        return `
          <div class="item-row">
            <img class="avatar" src="${getIconUrl(getLoverIconPath(l, null), true)}" alt="" loading="lazy" />
            <div class="row-info">
              <div class="row-name">${tName('lover', c.name)}</div>
              <div class="row-sub">${w ? `Смотритель: ${tName('warden', w.name)} · ` : ''}${availabilityText(c, itemObj)}</div>
            </div>
            <button class="btn btn-sm btn-primary summon-lover" data-lid="${c.id}" ${c.canSummon ? '' : 'disabled'}>${c.canSummon ? 'Призвать' : 'Недоступно'}</button>
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
  document.getElementById('btn-clear-snapshot')?.addEventListener('click', () => {
    state.account.calculationSnapshot = null;
    saveState();
    render();
  });
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

  document.querySelectorAll('.summon-lover').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.lid);
      const candidate = getSummonCandidates(
        db.wardens, db.lovers,
        new Set(Object.keys(state.account.ownedWardens).map(Number)),
        new Set(Object.keys(state.account.ownedLovers).map(Number)),
        state.account.bag
      ).lovers.find(item => item.id === id);
      if (!candidate?.canSummon) {
        alert('Условие призыва не подтверждено или не хватает предметов.');
        return;
      }
      if (candidate.itemId != null && candidate.cost > 0) {
        state.account.bag[candidate.itemId] = Math.max(0, (state.account.bag[candidate.itemId] || 0) - candidate.cost);
      }
      const lover = db.lovers.find(item => item.id === id);
      state.account.ownedLovers[id] = {
        affinity: 0,
        closeness: 0,
        sex: lover?.fixed_sex || state.settings.loverSex || 'female',
        presences: {},
        bonds: {},
      };
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
        if (isCalculationSnapshotPayload(parsed)) {
          // Validate fully before changing the active profile.
          normalizeCalculationSnapshot(parsed);
          state.account.calculationSnapshot = {
            capturedAt: new Date().toISOString(),
            data: parsed,
          };
          state.activeTab = 'dominance';
        } else {
          state = normalizeState(parsed);
        }
        saveState();
        render();
      } catch (err) {
        alert('Ошибка чтения JSON файла профиля');
      }
    };
    inp.click();
  });
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
    sex: lover.fixed_sex || state.settings.loverSex || 'female',
    bonds: {},
    presences: {}
  };
}

function navigate(screen, params) {
  Object.assign(state, params || {});
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
  return Math.max(1, Math.min(100, Math.round(((wPct + lPct + bagPct) / 3) * 100)));
}

function renderSpaTopbar() {
  const avatar = GAME_DB.wardens.find(function (warden) {
    return warden.id === Number(state.profile.avatarId);
  }) || GAME_DB.wardens[0];
  return [
    '<header class="spa-topbar">',
      '<div class="spa-brand">',
        '<img src="./assets/crest.svg" class="spa-crest" alt="VD">',
        '<div class="spa-brand-copy">',
          '<div class="spa-brand-title">Vampire Dominion</div>',
          '<div class="spa-brand-sub">OPTIMIST · ' + escHtml(state.profile.server || 'сервер не указан') + ' · локальный профиль</div>',
        '</div>',
      '</div>',
      '<div class="spa-top-actions">',
        '<button class="spa-avatar-button" type="button" data-action="nav" data-screen="settings"><img src="' + getIconUrl(avatar.icon_path, state.preferLocalIcons) + '" alt="Профиль"></button>',
        '<button class="spa-icon-button" type="button" id="btn-new-account" aria-label="Новый аккаунт">＋</button>',
      '</div>',
    '</header>'
  ].join('');
}

function renderSpaBottomNav() {
  const active = getPrimaryNav(state.screen || 'home');
  const items = [
    ['home','🏰','Главная'],
    ['resources','🎒','Ресурсы'],
    ['calculations','📊','Расчёты'],
    ['settings','⚙️','Профиль']
  ];
  return '<nav id="bottom-nav" class="spa-bottom-nav">' + items.map(function (item) {
    return '<button type="button" class="spa-nav-button ' + (active === item[0] ? 'active' : '') + '" data-nav="' + item[0] + '"><span class="spa-nav-icon">' + item[1] + '</span><span>' + item[2] + '</span></button>';
  }).join('') + '</nav>';
}

function renderSubToolbar(backTarget, title) {
  return '<div class="spa-screen-toolbar">' +
    '<button type="button" class="back-pill" data-action="nav" data-screen="' + backTarget + '">← Назад</button>' +
    '<div class="spa-screen-title">' + title + '</div>' +
    '<div class="spa-toolbar-actions">' +
      '<button type="button" class="icon-btn" data-action="undo" ' + (state.history && state.history.length ? '' : 'disabled') + '>↶</button>' +
      '<button type="button" class="icon-btn" data-action="redo" ' + (state.future && state.future.length ? '' : 'disabled') + '>↷</button>' +
    '</div></div>';
}

function renderHomeScreen() {
  const progress = getAccountProgressPercent(state.account);
  const avatar = GAME_DB.wardens.find(function (warden) { return warden.id === Number(state.profile.avatarId); }) || GAME_DB.wardens[0];
  return '<section class="home-screen">' +
    '<div class="home-hero">' +
      '<div class="home-eyebrow">OPTIMIST · ПОМОЩНИК</div>' +
      '<div class="home-brand-title">Наследие<br>Вампиров</div>' +
      '<div class="home-brand-sub">Vampire Dominion · Blood Moon Edition</div>' +
      '<img src="./assets/crest.svg" class="home-sticker" alt="Эмблема">' +
    '</div>' +
    '<div class="profile-main-card" data-action="nav" data-screen="settings">' +
      '<img src="' + getIconUrl(avatar.icon_path, state.preferLocalIcons) + '" class="profile-avatar-lg" alt="Портрет">' +
      '<div class="profile-main-info"><div class="profile-main-name">' + escHtml(state.profile.name) + '</div>' +
      '<div class="profile-main-server">' + escHtml(state.profile.server || 'сервер не указан') + '</div>' +
      '<div class="profile-badge-row"><span class="badge-pill">👑 Локальный профиль · полный набор разделов</span></div></div><div class="card-right">⌄</div>' +
    '</div>' +
    '<div class="card-stack">' +
      '<div class="nav-card" data-action="nav" data-screen="resources"><div class="card-icon-box">✎</div><div class="card-body"><div class="card-title">Ресурсы</div><div class="card-subtitle">Смотрители, партнёры, сумка, облики, Конклав</div><div class="progress-row"><div class="progress-track"><div class="progress-fill" style="width:' + progress + '%"></div></div><span class="progress-percent">' + progress + '%</span></div></div><div class="card-right">›</div></div>' +
      '<div class="nav-card" data-action="nav" data-screen="calculations"><div class="card-icon-box">∑</div><div class="card-body"><div class="card-title">Расчёты</div><div class="card-subtitle">Господство, таланты, близость, влечение, гильдия</div></div><div class="card-right">›</div></div>' +
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
    '<div class="card-stack">' +
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
        '<div class="card-right"><b>' + fmt(stats.sum) + '</b> ›</div></div>';
    }).join('') +
    '<button type="button" class="nav-card add-dashed" data-action="open-add-warden"><strong>＋ Добавить смотрителей (' + ownedIds.length + '/' + db.wardens.length + ')</strong></button></div>';
}

function computeWardenDetailedStats(profile, wardenId) {
  const warden = GAME_DB.wardens.find(function (w) { return w.id === Number(wardenId); });
  const owned = profile.ownedWardens && profile.ownedWardens[wardenId];
  const zero = { strength: 0, allure: 0, intellect: 0, spirit: 0 };
  if (!warden || !owned) return { breakdown: {}, values: zero, sum: 0 };

  const talentBase = getWardenBaseAttributes(wardenId);
  const garden = calcCourtyardUpgrade(GAME_DB.courtyard_levels, 0, Number(profile.courtyardLvl || 0));
  const breakdown = {};
  ATTRIBUTES.forEach(function (attr) {
    const book = Number(owned.books && owned.books[attr] || 0);
    const conclaveRow = GAME_DB.conclave_levels.find(function (row) { return row.id === Number(profile.conclave && profile.conclave[attr] || 0); });
    const conclave = Number(conclaveRow && conclaveRow.attribute_bonus || 0);
    let skinBonus = 0;
    (warden.skins || []).forEach(function (skin) {
      const level = Number(profile.skins && profile.skins[skin.id] || 0);
      if (level > 0 && skin.attribute === attr) skinBonus += Number(skin.stars || 0) * level * 10;
    });
    let auraPct = 0;
    (warden.auras || []).forEach(function (aura) {
      if (aura.attribute === attr || aura.attribute === 'all' || aura.main_attribute === attr) {
        const level = Number(owned.auras && owned.auras[aura.id] || 0);
        if (level > 0) auraPct += calcAuraPercent(aura, level);
      }
    });
    const base = Number(talentBase[attr] || 0) + book + conclave + Number(garden.gain[attr] || 0) + skinBonus;
    const total = Math.round(base * (1 + auraPct / 100));
    breakdown[attr] = { talents: Number(talentBase[attr] || 0), books: book, conclave: conclave, courtyard: Number(garden.gain[attr] || 0), skins: skinBonus, auraPct: auraPct, total: total };
  });
  const values = {};
  ATTRIBUTES.forEach(function (attr) { values[attr] = breakdown[attr].total; });
  return { breakdown: breakdown, values: values, sum: ATTRIBUTES.reduce(function (sum, attr) { return sum + values[attr]; }, 0) };
}

function renderWardenDetailScreen(db) {
  const ownedIds = Object.keys(state.account.ownedWardens || {}).map(Number);
  if (!ownedIds.length) return renderWardensListScreen(db);
  if (!ownedIds.includes(Number(state.currentWardenId))) state.currentWardenId = ownedIds[0];
  const id = Number(state.currentWardenId);
  const index = ownedIds.indexOf(id);
  const warden = db.wardens.find(function (w) { return w.id === id; });
  const owned = state.account.ownedWardens[id];
  if (!warden || !owned) return renderWardensListScreen(db);
  const stats = computeWardenDetailedStats(state.account, id);
  const prevId = ownedIds[(index - 1 + ownedIds.length) % ownedIds.length];
  const nextId = ownedIds[(index + 1) % ownedIds.length];
  const linkedLover = db.lovers.find(function (lover) { return lover.warden_id === id; });
  const tabs = [['level','Уровень'],['books','Книги'],['talents','Таланты'],['auras','Вдохновения'],['skins','Облики'],['attributes','Атрибуты']];
  let body = '';

  if (state.wardenTab === 'attributes') {
    const max = Math.max(1, ...ATTRIBUTES.map(function (attr) { return stats.values[attr]; }));
    body = '<div class="attrs-box">' + ATTRIBUTES.map(function (attr) {
      const item = stats.breakdown[attr];
      const pct = Math.min(100, Math.round(item.total / max * 100));
      const expanded = state.expandedAttr === attr;
      return '<div class="attr-item"><div class="attr-line-top" data-action="toggle-attr-detail" data-attr="' + attr + '"><span><span class="dot ' + attr + '"></span> ' + tName('attribute', attr) + '</span><span>' + fmt(item.total) + ' ' + (expanded ? '⌃' : '⌄') + '</span></div>' +
        '<div class="attr-bar-track"><div class="attr-bar-fill ' + attr + '" style="width:' + pct + '%"></div></div>' +
        (expanded ? '<div class="attr-breakdown">' +
          '<div class="attr-breakdown-row"><span>Таланты и уровень</span><b>+' + fmt(item.talents) + '</b></div>' +
          '<div class="attr-breakdown-row"><span>Книги</span><b>+' + fmt(item.books) + '</b></div>' +
          '<div class="attr-breakdown-row"><span>Конклав</span><b>+' + fmt(item.conclave) + '</b></div>' +
          '<div class="attr-breakdown-row"><span>Сад</span><b>+' + fmt(item.courtyard) + '</b></div>' +
          '<div class="attr-breakdown-row"><span>Облики</span><b>+' + fmt(item.skins) + '</b></div>' +
          '<div class="attr-breakdown-row"><span>Вдохновения</span><b>+' + item.auraPct.toFixed(1) + '%</b></div></div>' : '') + '</div>';
    }).join('') + '<div class="attr-total-row"><b>Сумма</b><b>' + fmt(stats.sum) + '</b></div></div>';
  } else if (state.wardenTab === 'level') {
    const promote = db.promotes.find(function (p) { return p.id === Number(owned.promoteId || 1); }) || db.promotes[0];
    body = '<div class="attrs-box">' +
      '<label class="field-stack"><span>Уровень (1–450)</span><input class="input" type="number" min="1" max="450" data-spa-warden-field="level" value="' + Number(owned.level || 1) + '"></label>' +
      '<label class="field-stack"><span>Прорыв</span><select class="select" data-spa-warden-field="promoteId">' + db.promotes.map(function (p) { return '<option value="' + p.id + '"' + (p.id === Number(owned.promoteId || 1) ? ' selected' : '') + '>' + tName('warden_promote', p.name) + ' · макс. ур. ' + (p.max_warden_lvl || p.max_level || '—') + '</option>'; }).join('') + '</select></label>' +
      '<div class="row-sub">Потолок талантов: ' + (promote.max_talent_lvl || '—') + '</div>' +
      '<button class="btn btn-danger btn-sm toggle-owned-warden" data-wid="' + id + '">Удалить смотрителя из профиля</button></div>';
  } else if (state.wardenTab === 'books') {
    body = '<div class="attrs-box"><div class="row-sub">Очки атрибутов от прочитанных книг</div><div class="grid-2">' +
      ATTRIBUTES.map(function (attr) { return '<label class="field-stack"><span><span class="dot ' + attr + '"></span> ' + tName('attribute', attr) + '</span><input class="input" type="number" min="0" data-spa-warden-book="' + attr + '" value="' + Number(owned.books && owned.books[attr] || 0) + '"></label>'; }).join('') +
      '</div></div>';
  } else if (state.wardenTab === 'talents') {
    const cap = Number((db.promotes.find(function (p) { return p.id === Number(owned.promoteId || 1); }) || {}).max_talent_lvl || 40);
    body = '<div class="attrs-box"><label class="field-stack"><span>Личный опыт талантов</span><input class="input talent-exp" type="number" min="0" data-wid="' + id + '" data-spa-warden-exp value="' + Number(owned.exp || 0) + '"></label><div class="grid-2">' +
      (warden.talents || []).map(function (talent, index) { return '<label class="field-stack"><span><span class="dot ' + talent.attribute + '"></span> ' + tName('attribute', talent.attribute) + ' · ' + talent.stars + '★</span><input class="input" type="number" min="1" max="' + cap + '" data-spa-warden-talent="' + index + '" value="' + Number(owned.talents && owned.talents[index] || 1) + '"></label>'; }).join('') +
      '</div></div>';
  } else if (state.wardenTab === 'auras') {
    body = '<div class="card-stack">' + (warden.auras || []).map(function (aura) {
      const level = Number(owned.auras && owned.auras[aura.id] || 0);
      return '<div class="nav-card" style="cursor:default"><div class="card-body"><div class="card-title">' + escHtml(aura.name || aura.type || 'Вдохновение') + '</div><div class="card-subtitle">Бонус: +' + calcAuraPercent(aura, level).toFixed(1) + '% · макс. ур. ' + (aura.max_lvl || '—') + '</div></div><input class="input stepper-input" type="number" min="0" max="' + (aura.max_lvl || 30) + '" data-spa-warden-aura="' + aura.id + '" value="' + level + '"></div>';
    }).join('') + '</div>';
  } else {
    body = '<div class="card-stack">' + (warden.skins || []).map(function (skin) {
      const level = Number(state.account.skins && state.account.skins[skin.id] || 0);
      return '<div class="nav-card" style="cursor:default"><img src="' + getIconUrl(skin.icon_path, state.preferLocalIcons) + '" class="profile-avatar-lg skin-mini-avatar" alt=""><div class="card-body"><div class="card-title">' + tName('warden_skin', skin.name) + '</div><div class="card-subtitle">' + String(skin.quality || '').toUpperCase() + ' · ' + (skin.max_lvl || 10) + ' уровней</div></div><div class="stepper-group"><button class="stepper-btn" data-action="skin-step" data-skin="' + skin.id + '" data-delta="-1">−</button><span class="stepper-val">' + level + '</span><button class="stepper-btn" data-action="skin-step" data-skin="' + skin.id + '" data-delta="1">+</button></div></div>';
    }).join('') + '</div>';
  }

  const loverLink = linkedLover ? '<button class="partner-link-btn" data-action="open-lover" data-id="' + linkedLover.id + '">♡ ' + tName('lover', linkedLover.name) + '</button>' : '';
  return renderSubToolbar('wardens_list', 'Смотритель') +
    '<div class="warden-hero-card"><img src="' + getIconUrl(warden.icon_path, state.preferLocalIcons) + '" class="warden-avatar-lg" alt=""><div class="card-body"><div class="warden-title-serif">' + tName('warden', warden.name) + '</div><div class="card-subtitle">' + warden.attributes.map(function (attr) { return '<span class="dot ' + attr + '"></span>'; }).join(' ') + ' · ур. ' + Number(owned.level || 1) + '</div></div>' + loverLink + '</div>' +
    '<div class="pill-tabs">' + tabs.map(function (tab) { return '<button class="pill-tab ' + (state.wardenTab === tab[0] ? 'active' : '') + '" data-action="set-warden-tab" data-tab="' + tab[0] + '">' + tab[1] + '</button>'; }).join('') + '</div>' +
    body + '<div class="warden-pager-bar"><button class="pager-btn" data-action="open-warden" data-id="' + prevId + '">‹ ' + tName('warden', db.wardens.find(function (w) { return w.id === prevId; }).name) + '</button><button class="pager-btn" data-action="open-warden-picker">' + (index + 1) + ' из ' + ownedIds.length + ' ⌃</button><button class="pager-btn" data-action="open-warden" data-id="' + nextId + '">' + tName('warden', db.wardens.find(function (w) { return w.id === nextId; }).name) + ' ›</button></div>';
}

function renderLoversScreen(db) {
  const ownedIds = Object.keys(state.account.ownedLovers || {}).map(Number);
  let list = ownedIds.map(function (id) { return db.lovers.find(function (lover) { return lover.id === id; }); }).filter(Boolean);
  const query = String(state.loverListSearch || '').trim().toLocaleLowerCase();
  if (query) list = list.filter(function (lover) { return tName('lover', lover.name).toLocaleLowerCase().includes(query); });
  return renderSubToolbar('resources', 'Партнёры') +
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

function renderLoverDetailScreen(db) {
  const id = Number(state.currentLoverId);
  const lover = db.lovers.find(function (item) { return item.id === id; });
  const owned = state.account.ownedLovers[id];
  if (!lover || !owned) return renderLoversScreen(db);
  const warden = db.wardens.find(function (item) { return item.id === lover.warden_id; });
  const plan = getBondPlan(lover, owned);
  const result = calcLoverBonds(lover, Number(owned.affinity || 0), plan, plan.wardenBaseAttrs, Number(owned.closeness || 0));
  const presenceHtml = (lover.presences || []).map(function (presence) {
    const level = Number(owned.presences && owned.presences[presence.id] || 0);
    const percs = calcPresencePercents(presence, level, presenceCurvesMap);
    return '<div class="nav-card" style="cursor:default"><div class="card-body"><div class="card-title">' + escHtml(presence.name || 'Веяние') + '</div><div class="card-subtitle">Сила ' + percs.strength + '% · Харизма ' + percs.allure + '% · Интеллект ' + percs.intellect + '% · Воля ' + percs.spirit + '%</div></div><input class="input stepper-input presence-level" type="number" min="' + (presence.min_lvl || 0) + '" max="' + (presence.max_lvl || 30) + '" data-lid="' + id + '" data-pid="' + presence.id + '" value="' + level + '"></div>';
  }).join('');
  const bondsHtml = (lover.scarlet_bonds || []).map(function (bond) {
    const st = plan[bond.attribute];
    const detail = result.details.find(function (item) { return item.attribute === bond.attribute; });
    return '<div class="bond-row"><div class="bond-head"><b><span class="dot ' + bond.attribute + '"></span> ' + tName('attribute', bond.attribute) + (bond.is_advantage ? ' ★' : '') + '</b><span>+' + fmt(detail.totalAttrGain) + '</span></div><div class="grid-2 bond-inputs">' +
      '<label class="field-stack"><span>Уровень связи · ' + (detail.unlockedFlat ? 'открыто' : 'закрыто до близости ' + bond.unlock_closeness) + '</span><input class="input bond-target" type="number" min="' + st.level + '" max="600" data-lid="' + id + '" data-attr="' + bond.attribute + '" data-kind="flat" value="' + st.targetLevel + '" ' + (detail.unlockedFlat ? '' : 'disabled') + '></label>' +
      '<label class="field-stack"><span>Процент · ' + (detail.unlockedPct ? 'открыто' : 'закрыто до близости ' + bond.unlock_closeness_percent) + '</span><input class="input bond-target" type="number" min="' + st.percentLevel + '" max="600" data-lid="' + id + '" data-attr="' + bond.attribute + '" data-kind="percent" value="' + st.targetPercentLevel + '" ' + (detail.unlockedPct ? '' : 'disabled') + '></label></div><div class="row-sub">Цена: ' + fmt(detail.costFlat + detail.costPct) + ' доверия · Прирост: +' + fmt(detail.totalAttrGain) + '</div></div>';
  }).join('');
  return renderSubToolbar('lovers', 'Партнёр') +
    '<div class="warden-hero-card"><img src="' + getIconUrl(getLoverIconPath(lover, owned), state.preferLocalIcons) + '" class="warden-avatar-lg" alt=""><div class="card-body"><div class="warden-title-serif">' + tName('lover', lover.name) + '</div><div class="card-subtitle">' + (warden ? tName('warden', warden.name) : '') + '</div></div></div>' +
    '<section class="attrs-box"><div class="grid-2">' +
      '<label class="field-stack"><span>Близость / откровенность</span><input class="input lover-stat-input" type="number" min="0" data-lid="' + id + '" data-field="closeness" value="' + Number(owned.closeness || 0) + '"></label>' +
      '<label class="field-stack"><span>Доверие / влечение</span><input class="input lover-stat-input" type="number" min="0" data-lid="' + id + '" data-field="affinity" value="' + Number(owned.affinity || 0) + '"></label></div>' +
      '<label class="field-stack"><span>Пол портрета</span><select class="select" data-lover-sex="' + id + '"><option value="female" ' + (owned.sex !== 'male' ? 'selected' : '') + '>Женский</option><option value="male" ' + (owned.sex === 'male' ? 'selected' : '') + '>Мужской</option></select></label></section>' +
    '<section class="attrs-box"><div class="card-title">Кровные узы</div><div class="row-sub">Близость открывает ветви, Доверие расходуется на прокачку.</div><div class="bond-summary">Потратится: <b>' + fmt(result.spentAffinity) + '</b> · Останется: <b>' + fmt(result.leftAffinity) + '</b> · Прирост: <b>+' + fmt(result.totalGain) + '</b></div>' +
      (result.spentAffinity > Number(owned.affinity || 0) ? '<div class="bond-warning">Недостаточно Доверия для выбранного плана.</div>' : '') + bondsHtml + '</section>' +
    '<section class="attrs-box"><div class="card-title">Веяния</div>' + (presenceHtml || '<div class="row-sub">Для партнёра нет записей Веяний.</div>') + '</section>';
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

function renderConclaveScreen(db, report) {
  const current = state.account.conclave || {};
  const branches = ATTRIBUTES.map(function (attr) {
    const level = Number(current[attr] || 0);
    const row = db.conclaveLevels.find(function (item) { return item.id === level; });
    const target = Math.max(level, Number(state.plan.conclave[attr] || level));
    const calc = calcConclaveBranch(db.conclaveLevels, level, target, 1);
    return '<div class="conclave-branch"><div class="branch-title"><span class="dot ' + attr + '"></span>' + tName('attribute', attr) + '</div><label class="field-stack"><span>Текущий уровень / 180</span><input class="input" type="number" min="0" max="180" data-spa-conclave-level="' + attr + '" value="' + level + '"></label><label class="field-stack"><span>Целевой уровень</span><input class="input conc-target" type="number" min="' + level + '" max="180" data-attr="' + attr + '" value="' + target + '"></label><div class="row-sub">Бонус текущего уровня: +' + fmt(row && row.attribute_bonus || 0) + ' · Цена цели: ' + fmt(calc.spent) + ' · Прирост всем смотрителям: +' + fmt(calc.directAttributeGain) + '</div></div>';
  }).join('');
  const gardenNow = calcCourtyardUpgrade(db.courtyardLevels, 0, Number(state.account.courtyardLvl || 0));
  const gardenTarget = Math.max(Number(state.account.courtyardLvl || 0), Number(state.plan.courtyardToLvl || state.account.courtyardLvl || 0));
  const gardenPlan = calcCourtyardUpgrade(db.courtyardLevels, Number(state.account.courtyardLvl || 0), gardenTarget);
  return renderSubToolbar('resources', 'Конклав и Сад') +
    '<section class="attrs-box"><div class="card-head"><div><div class="card-title">Конклав · 180 уровней</div><div class="row-sub">Очки доступны: ' + fmt(state.account.conclaveExp || 0) + ' · потрачено в плане: ' + fmt(report.spent.conclaveExp) + '</div></div><button class="btn btn-primary btn-sm" data-action="auto-conclave">⚡ Распределить</button></div>' +
      '<label class="field-stack"><span>Очки Конклава</span><input class="input" type="number" min="0" data-resource-field="conclaveExp" value="' + Number(state.account.conclaveExp || 0) + '"></label>' +
      '<div class="grid-2">' + branches + '</div></section>' +
    '<section class="attrs-box"><div class="card-head"><div><div class="card-title">Сад · 210 уровней</div><div class="row-sub">Текущий уровень ' + Number(state.account.courtyardLvl || 0) + ' · цель ' + gardenTarget + '</div></div><span class="gain-pill">+' + fmt(gardenNow.totalGain) + '</span></div>' +
      '<div class="grid-2"><label class="field-stack"><span>Текущий уровень</span><input class="input" type="number" min="0" max="210" data-resource-field="courtyardLvl" value="' + Number(state.account.courtyardLvl || 0) + '"></label>' +
      '<label class="field-stack"><span>Очки Сада</span><input class="input" type="number" min="0" data-resource-field="courtyardExp" value="' + Number(state.account.courtyardExp || 0) + '"></label></div>' +
      '<label class="field-stack"><span>Целевой уровень</span><input class="input" id="inp-courtyard-target" type="number" min="' + Number(state.account.courtyardLvl || 0) + '" max="210" value="' + gardenTarget + '"></label>' +
      '<div class="item-row"><span>Стоимость цели</span><b>' + fmt(gardenPlan.spent) + '</b></div><div class="item-row"><span>Прирост атрибутов</span><b>+' + fmt(gardenPlan.totalGain) + '</b></div></section>';
}

function renderWardenExpScreen(db) {
  const withExp = Object.values(state.account.ownedWardens || {}).filter(function (owned) { return Number(owned.exp || 0) > 0; }).length;
  let list = db.wardens.slice();
  if (state.wardenExpFilter === 'with_exp') list = list.filter(function (warden) { return Number(state.account.ownedWardens[warden.id] && state.account.ownedWardens[warden.id].exp || 0) > 0; });
  const query = String(state.wardenExpSearch || '').trim().toLocaleLowerCase();
  if (query) list = list.filter(function (warden) { return tName('warden', warden.name).toLocaleLowerCase().includes(query); });
  const total = Object.values(state.account.ownedWardens || {}).reduce(function (sum, owned) { return sum + Number(owned.exp || 0); }, 0);
  return renderSubToolbar('resources', 'Опыт смотрителей') +
    '<section class="attrs-box"><div class="card-title">Суммарный опыт талантов</div><div class="dominance-number">' + fmt(total) + '</div><div class="row-sub">' + withExp + ' смотрителей с накопленным опытом</div></section>' +
    '<div class="search-toolbar"><div class="search-box">🔍 <input type="search" data-spa-search="warden-exp" placeholder="Поиск..." value="' + escHtml(query) + '"></div></div>' +
    '<div class="pill-tabs"><button class="pill-tab ' + (state.wardenExpFilter !== 'with_exp' ? 'active' : '') + '" data-action="warden-exp-filter" data-val="all">Все ' + db.wardens.length + '</button><button class="pill-tab ' + (state.wardenExpFilter === 'with_exp' ? 'active' : '') + '" data-action="warden-exp-filter" data-val="with_exp">С опытом ' + withExp + '</button></div>' +
    '<div class="row-sub">Ввод опыта добавляет смотрителя в профиль, если его ещё нет.</div><div class="card-stack">' + list.map(function (warden) {
      const owned = state.account.ownedWardens[warden.id];
      return '<div class="nav-card" style="cursor:default"><img src="' + getIconUrl(warden.icon_path, state.preferLocalIcons) + '" class="profile-avatar-lg" style="width:44px;height:44px" alt=""><div class="card-body"><div class="card-title">' + tName('warden', warden.name) + '</div><div class="card-subtitle">' + (owned ? 'В профиле' : 'Не призван') + '</div></div><input class="input stepper-input" type="number" min="0" data-spa-quick-exp="' + warden.id + '" value="' + Number(owned && owned.exp || 0) + '"></div>';
    }).join('') + '</div>';
}

function renderCalculationsHubScreen() {
  return renderSubToolbar('home', 'Расчёты') +
    '<div class="calc-hub-card" data-action="nav" data-screen="calc_dominance"><div class="card-icon-box">∑</div><div class="card-body"><div class="card-title">Подсчёт Господства</div><div class="card-subtitle">10 направлений вложения ресурсов и проверка доступности</div></div><div class="card-right">›</div></div>' +
    '<div class="card-stack">' +
      '<div class="nav-card" data-action="nav" data-screen="calc_talents"><div class="card-icon-box">📜</div><div class="card-body"><div class="card-title">Таланты и опыт</div><div class="card-subtitle">Звёзды, потолки уровня, личный опыт и прорывы</div></div><div class="card-right">›</div></div>' +
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
    '<section class="dominance-total-card"><div><div class="card-title">Прирост Господства</div><div class="row-sub">По локальным расчётным модулям</div></div><div class="dominance-number">+' + fmt(report.gain.total) + '</div></section>' +
    renderDominanceTab(db, report) + renderCoverageCard(report);
}

function renderIntimacyCalcScreen(report) {
  const cards = [
    ['Близость', report.bagCalculators.intimacy],
    ['Влечение', report.bagCalculators.attraction]
  ];
  return renderSubToolbar('calculations', 'Близость и влечение') +
    cards.map(function (card) {
      return '<section class="attrs-box"><div class="card-title">' + card[0] + '</div><div class="grid-3"><div><div class="row-sub">Минимум</div><b>' + fmt(card[1].minimum) + '</b></div><div><div class="row-sub">Ожидание</div><b>' + fmt(card[1].expected) + '</b></div><div><div class="row-sub">Максимум</div><b>' + fmt(card[1].maximum) + '</b></div></div></section>';
    }).join('') +
    '<section class="attrs-box"><div class="card-title">Опыт Гильдии</div><div class="dominance-number">' + fmt(report.bagCalculators.guildExp.expected) + '</div><div class="row-sub">Расчёт с лимитом трёх дней вложений, по данным предметов в Сумке.</div></section>' +
    '<button class="btn btn-primary" data-action="nav" data-screen="bag">Открыть Сумку</button>';
}

function renderSettingsScreen() {
  const selected = GAME_DB.wardens.find(function (warden) { return warden.id === Number(state.profile.avatarId); }) || GAME_DB.wardens[0];
  return renderSubToolbar('home', 'Настройки и профиль') +
    '<section class="attrs-box"><div class="card-title">Активный профиль</div><div class="settings-profile-row"><img src="' + getIconUrl(selected.icon_path, state.preferLocalIcons) + '" class="profile-avatar-lg" alt=""><div class="card-body"><b>' + escHtml(state.profile.name) + '</b><div class="row-sub">' + escHtml(state.profile.server || 'сервер не указан') + '</div></div></div>' +
      '<label class="field-stack"><span>Никнейм</span><input class="input" type="text" data-spa-profile="name" value="' + escHtml(state.profile.name) + '"></label>' +
      '<label class="field-stack"><span>Сервер</span><input class="input" type="text" data-spa-profile="server" value="' + escHtml(state.profile.server) + '"></label>' +
      '<label class="field-stack"><span>Портрет профиля</span><select class="select" id="profile-avatar-select">' + GAME_DB.wardens.map(function (warden) { return '<option value="' + warden.id + '"' + (Number(state.profile.avatarId) === warden.id ? ' selected' : '') + '>' + tName('warden', warden.name) + '</option>'; }).join('') + '</select></label></section>' +
    '<section class="attrs-box"><div class="card-title">Профили</div><select class="select account-switch" id="account-switcher">' + state.accounts.map(function (item) { return '<option value="' + escHtml(item.id) + '"' + (String(item.id) === String(state.activeAccountId) ? ' selected' : '') + '>' + escHtml(item.name) + ' · ' + escHtml(item.server || 'без сервера') + '</option>'; }).join('') + '</select>' +
      '<div class="settings-actions"><button class="btn btn-primary" id="btn-create-account-settings">＋ Новый аккаунт</button><button class="btn" id="btn-theme">' + (state.settings.theme === 'light' ? '☀ Светлая тема' : '☾ Тёмная тема') + '</button><button class="btn" id="btn-lang">Язык: ' + state.lang.toUpperCase() + '</button><button class="btn" id="btn-export">💾 Экспорт профиля</button><button class="btn" id="btn-import">📂 Импорт профиля / JSON API</button><button class="btn" id="btn-game-connect">🔗 Подключение к игре</button><button class="btn btn-danger" data-action="reset-account">🧹 Очистить калькулятор</button></div>' +
      '<div class="row-sub">Профили и ресурсы хранятся локально на устройстве. Импорт JSON сохраняет контрольный серверный снимок отдельно от ручного профиля.</div></section>' +
    renderServerSnapshotCard();
}

function renderSpaScreen(db, report) {
  switch (state.screen || 'home') {
    case 'home': return renderHomeScreen();
    case 'resources': return renderResourcesScreen();
    case 'wardens_list': return renderWardensListScreen(db);
    case 'warden-detail': return renderWardenDetailScreen(db);
    case 'lovers': return renderLoversScreen(db);
    case 'lover-detail': return renderLoverDetailScreen(db);
    case 'bag': return renderBagScreen(db);
    case 'skins': return renderSkinsScreen(db);
    case 'conclave': return renderConclaveScreen(db, report);
    case 'warden_exp': return renderWardenExpScreen(db);
    case 'calculations': return renderCalculationsHubScreen();
    case 'calc_dominance': return renderDominanceCalcScreen(db, report);
    case 'calc_talents': return renderSubToolbar('calculations', 'Таланты и опыт') + renderTalentsTab(db);
    case 'calc_intimacy': return renderIntimacyCalcScreen(report);
    case 'settings': return renderSettingsScreen();
    default: return renderHomeScreen();
  }
}

function render() {
  const root = document.getElementById('app');
  if (!root) return;
  applyTheme();
  const db = getDbContext();
  const report = calculateTotalDominanceReport({ db: db, account: state.account, plan: state.plan });
  root.innerHTML = '<div class="spa-app-shell">' + renderSpaTopbar() +
    '<main id="screen-container" class="screen-container">' + renderSpaScreen(db, report) + '</main>' +
    renderSpaBottomNav() + '</div>';
  bindEvents(db);
  bindSpaEvents(db, report);
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

function bindSpaEvents(db, report) {
  const root = document.getElementById('screen-container');
  if (!root) return;

  root.querySelectorAll('[data-nav]').forEach(function (button) {
    button.addEventListener('click', function () { navigate(button.dataset.nav); });
  });

  root.querySelectorAll('[data-action]').forEach(function (button) {
    button.addEventListener('click', function () {
      const action = button.dataset.action;
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
      if (action === 'toggle-attr-detail') { state.expandedAttr = state.expandedAttr === button.dataset.attr ? null : button.dataset.attr; return render(); }
      if (action === 'toggle-warden-sort') { state.wardenListSort = state.wardenListSort === 'sum' ? 'name' : 'sum'; return render(); }
      if (action === 'warden-filter') { state.wardenListFilter = button.dataset.val; return render(); }
      if (action === 'open-add-warden') {
        const choices = db.wardens.filter(function (warden) { return !state.account.ownedWardens[warden.id]; });
        const answer = globalThis.prompt('Введите ID смотрителя:\n' + choices.slice(0, 30).map(function (warden) { return warden.id + ' — ' + tName('warden', warden.name); }).join('\n'));
        const warden = db.wardens.find(function (item) { return item.id === Number(answer); });
        if (!warden) return;
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
        pushUndoSnapshot();
        state.account.ownedLovers[lover.id] = createOwnedLover(lover);
        state.currentLoverId = lover.id;
        saveState();
        return navigate('lover-detail');
      }
      if (action === 'add-lover') {
        const lover = db.lovers.find(function (item) { return item.id === Number(button.dataset.id); });
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
        const counts = {};
        ATTRIBUTES.forEach(function (attr) {
          counts[attr] = db.wardens.filter(function (warden) { return state.account.ownedWardens[warden.id] && warden.attributes.includes(attr); }).length || 1;
        });
        const result = autoDistributeConclave(db.conclaveLevels, state.account.conclave, state.account.conclaveExp, counts);
        state.plan.conclave = result.levels;
        saveState();
        return render();
      }
      if (action === 'run-calc') { state.lastCalcReport = null; return render(); }
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
      pushUndoSnapshot();
      if (!state.account.ownedWardens[id]) state.account.ownedWardens[id] = createOwnedWarden(warden);
      state.account.ownedWardens[id].exp = Math.max(0, Number(input.value) || 0);
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

document.addEventListener('DOMContentLoaded', render);