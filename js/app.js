import { GAME_DB, getIconUrl } from './data.js';

// Telegram WebApp может отсутствовать при локальном запуске в обычном браузере.
const tg = window.Telegram?.WebApp ?? {
  expand() {}, ready() {}, setHeaderColor() {}, setBackgroundColor() {},
  HapticFeedback: null
};
tg.expand();
tg.ready();

const STORAGE_KEY = 'vd_mini_app_v4';

function getDefaultState() {
  return {
    profile: { name: 'Оптимист', server: 'EU S-629', avatarId: 10230 },
    settings: { theme: 'dark', lang: 'ru', loverSex: 'female' },
    inventory: {}, wardens: {}, lovers: {}
  };
}

function mergeState(saved) {
  const defaults = getDefaultState();
  return {
    ...defaults,
    ...saved,
    profile: { ...defaults.profile, ...(saved?.profile ?? {}) },
    settings: { ...defaults.settings, ...(saved?.settings ?? {}) },
    inventory: saved?.inventory ?? {},
    wardens: saved?.wardens ?? {},
    lovers: saved?.lovers ?? {}
  };
}

function loadState() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? mergeState(JSON.parse(stored)) : getDefaultState();
  } catch (error) {
    console.error('Save load error:', error);
    return getDefaultState();
  }
}

let state = loadState();

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (error) {
    console.error('Save write error:', error);
    alert('Не удалось сохранить данные. Проверьте свободное место браузера.');
    return false;
  }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function applyTheme() {
  const isLight = state.settings.theme === 'light';
  document.documentElement.classList.toggle('light-theme', isLight);
  const bgColor = isLight ? '#f5f0e8' : '#0b0910';
  try {
    tg.setHeaderColor(bgColor);
    tg.setBackgroundColor(bgColor);
  } catch (error) {
    console.warn('Telegram theme update unavailable:', error);
  }
}

const tabs = document.querySelectorAll('.tab-item');
const mainContent = document.getElementById('main-content');

function renderTab(tabId) {
  if (tg.HapticFeedback) tg.HapticFeedback.selectionChanged();
  tabs.forEach(tab => tab.classList.toggle('active', tab.dataset.target === tabId));

  let html = '';

  if (tabId === 'tab-citadel') {
    const avatar = GAME_DB.wardens.find(w => w.id === state.profile.avatarId);
    const avatarUrl = getIconUrl(avatar?.icon_path);
    html = `
      <div class="glass-card" style="display:flex;align-items:center;gap:16px;">
        <img src="${escapeHtml(avatarUrl || 'https://ui-avatars.com/api/?name=V+D&background=d91e36&color=fff')}"
          onerror="this.onerror=null;this.src='https://ui-avatars.com/api/?name=V+D&background=d91e36&color=fff';"
          style="width:64px;height:64px;border-radius:50%;border:2px solid var(--accent-gold);box-shadow:0 0 12px var(--accent-gold-glow);object-fit:cover;">
        <div>
          <div style="font-size:12px;color:var(--accent-gold);text-transform:uppercase;letter-spacing:.5px;">Лорд-протектор</div>
          <div style="font-size:20px;font-weight:bold;">${escapeHtml(state.profile.name)}</div>
          <div style="font-size:12px;color:var(--text-muted);">🌐 ${escapeHtml(state.profile.server)}</div>
        </div>
      </div>
      <button class="btn-oracle" id="btn-oracle">⚡ Оракул Крови (Авто)</button>
      <div class="glass-card" style="margin-top:16px;">
        <h2 class="gothic-title">Сводка Господства</h2>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div><div class="stat-label">Конклав</div><div class="stat-value">+0</div></div>
          <div><div class="stat-label">Сад (Двор)</div><div class="stat-value">+0</div></div>
          <div><div class="stat-label">Уровни Вассалов</div><div class="stat-value">+0</div></div>
          <div><div class="stat-label">Узы Фаворитов</div><div class="stat-value">+0</div></div>
        </div>
      </div>
      <div class="glass-card" style="border-color:var(--accent-ice);background:rgba(56,189,248,.05);">
        <h2 class="gothic-title" style="color:var(--accent-ice);font-size:18px;">🔗 Связь с Цитаделью</h2>
        <p style="font-size:13px;color:var(--text-muted);margin-bottom:12px;line-height:1.4;">Подтяните данные из игры по коду из письма. Мы ничего не меняем в игре, только читаем параметры.</p>
        <button class="btn-connect" type="button">Получить код</button>
      </div>`;
  } else if (tabId === 'tab-settings') {
    html = `
      <h2 class="gothic-title">⚙️ Настройки Профиля</h2>
      <div class="glass-card">
        <label class="field-label" for="inp-name">Имя Лорда</label>
        <input type="text" id="inp-name" maxlength="48" autocomplete="nickname" value="${escapeHtml(state.profile.name)}">
        <label class="field-label" for="inp-server">Сервер и Регион</label>
        <input type="text" id="inp-server" maxlength="48" value="${escapeHtml(state.profile.server)}">
      </div>
      <div class="glass-card">
        <div class="setting-row">
          <span>Тема интерфейса</span>
          <button class="setting-button" id="btn-toggle-theme">${state.settings.theme === 'dark' ? '🌙 Тёмная' : '☀️ Светлая'}</button>
        </div>
        <div class="setting-row">
          <span>Пол фаворитов</span>
          <button class="setting-button" id="btn-toggle-sex">${state.settings.loverSex === 'female' ? 'Она' : 'Он'}</button>
        </div>
      </div>
      <div class="settings-actions">
        <button class="action-button" id="btn-export">💾 Экспорт</button>
        <button class="action-button" id="btn-import">📂 Импорт</button>
        <input type="file" id="inp-import-file" accept="application/json,.json" hidden>
      </div>
      <button class="reset-button" id="btn-reset">🗑 Сбросить аккаунт</button>`;
  } else {
    const labels = {
      'tab-roster': 'Свита',
      'tab-treasury': 'Казна',
      'tab-rituals': 'Ритуалы'
    };
    html = `<h2 class="gothic-title">${labels[tabId] || 'Раздел'}</h2><p style="color:var(--text-muted);">Раздел «${labels[tabId] || 'Раздел'}» подключим следующим этапом.</p>`;
  }

  mainContent.innerHTML = html;
  bindTabEvents(tabId);
}

function bindTabEvents(tabId) {
  if (tabId === 'tab-citadel') {
    document.getElementById('btn-oracle')?.addEventListener('click', () => {
      alert('Расчётный модуль будет подключён на следующем этапе.');
    });
  }

  if (tabId !== 'tab-settings') return;

  document.getElementById('inp-name').addEventListener('change', event => {
    state.profile.name = event.target.value.trim() || 'Оптимист';
    saveState();
  });

  document.getElementById('inp-server').addEventListener('change', event => {
    state.profile.server = event.target.value.trim() || 'Не указан';
    saveState();
  });

  document.getElementById('btn-toggle-theme').addEventListener('click', () => {
    if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
    state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
    saveState();
    applyTheme();
    renderTab('tab-settings');
  });

  document.getElementById('btn-toggle-sex').addEventListener('click', () => {
    if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
    state.settings.loverSex = state.settings.loverSex === 'female' ? 'male' : 'female';
    saveState();
    renderTab('tab-settings');
  });

  document.getElementById('btn-reset').addEventListener('click', () => {
    if (!confirm('Сбросить все данные аккаунта? Это действие нельзя отменить.')) return;
    state = getDefaultState();
    saveState();
    applyTheme();
    renderTab('tab-settings');
  });

  document.getElementById('btn-export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'vd_legacy_profile.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  });

  document.getElementById('btn-import').addEventListener('click', () => {
    document.getElementById('inp-import-file').click();
  });

  document.getElementById('inp-import-file').addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text());
      if (!imported || typeof imported !== 'object' || Array.isArray(imported)) {
        throw new Error('Неверный формат файла');
      }
      state = mergeState(imported);
      saveState();
      applyTheme();
      renderTab('tab-settings');
      alert('Профиль успешно импортирован.');
    } catch (error) {
      console.error('Import error:', error);
      alert('Не удалось импортировать файл. Проверьте, что это корректный JSON-экспорт Vampire Dominion.');
    } finally {
      event.target.value = '';
    }
  });
}

tabs.forEach(tab => {
  tab.addEventListener('click', event => renderTab(event.currentTarget.dataset.target));
});

applyTheme();
renderTab('tab-citadel');
