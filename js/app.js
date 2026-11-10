// VAMPIRE DOMINION v4.0 - APP CONTROLLER

// Инициализация Telegram WebApp
const tg = window.Telegram.WebApp;
tg.expand(); // Открываем на весь экран
tg.ready();

// Словари терминов (Замена скучных слов на атмосферные)
const DICT = {
  tab_citadel: '🏰 Цитадель',
  tab_roster: '⚔️ Свита',
  tab_treasury: '🎒 Казна',
  tab_rituals: '🔮 Ритуалы',
  tab_settings: '⚙️ Профиль',
  oracle_btn: '⚡ Оракул Крови (Авто)',
  connect_game: '🔗 Связь с Цитаделью (Войти)',
};

// Простой роутер для Tab Bar
const tabs = document.querySelectorAll('.tab-item');
const mainContent = document.getElementById('main-content');

function renderTab(tabId) {
  // Виброотклик при переключении
  if (tg.HapticFeedback) tg.HapticFeedback.selectionChanged();
  
  // Убираем класс active у всех и ставим текущему
  tabs.forEach(t => t.classList.remove('active'));
  document.querySelector(`[data-target="${tabId}"]`).classList.add('active');
  
  // Рендер контента (скелет для демонстрации архитектуры)
  let html = '';
  
  if (tabId === 'tab-citadel') {
    html = `
      <div class="glass-card" style="display:flex; align-items:center; gap:16px;">
        <img src="https://ui-avatars.com/api/?name=V+D&background=d91e36&color=fff&rounded=true&size=64" style="border: 2px solid var(--accent-gold); box-shadow: 0 0 12px var(--accent-gold-glow);">
        <div>
          <div style="font-size:12px; color:var(--accent-gold); text-transform:uppercase;">Лорд-протектор</div>
          <div style="font-size:20px; font-weight:bold;">Оптимист</div>
          <div style="font-size:12px; color:var(--text-muted);">EU S-629</div>
        </div>
      </div>
      
      <button class="btn-oracle" onclick="alert('Оракул крови активирован! Распределяем ресурсы...')">
        ${DICT.oracle_btn}
      </button>
      
      <div class="glass-card" style="margin-top:16px;">
        <h2 class="gothic-title">Сводка Господства</h2>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
          <div>
            <div style="font-size:11px; color:var(--text-muted);">Конклав</div>
            <div style="color:var(--accent-ice); font-weight:bold;">+0</div>
          </div>
          <div>
            <div style="font-size:11px; color:var(--text-muted);">Сад (Двор)</div>
            <div style="color:var(--accent-ice); font-weight:bold;">+0</div>
          </div>
          <div>
            <div style="font-size:11px; color:var(--text-muted);">Уровни Вассалов</div>
            <div style="color:var(--accent-ice); font-weight:bold;">+0</div>
          </div>
          <div>
            <div style="font-size:11px; color:var(--text-muted);">Узы Фаворитов</div>
            <div style="color:var(--accent-ice); font-weight:bold;">+0</div>
          </div>
        </div>
      </div>
      
      <div class="glass-card" style="border-color: var(--accent-ice);">
        <h2 class="gothic-title" style="color:var(--accent-ice);">${DICT.connect_game}</h2>
        <p style="font-size:13px; color:var(--text-muted); margin-bottom:12px;">Подтяните данные из игры по коду из письма. Мы ничего не меняем в игре, только читаем параметры.</p>
        <button style="background:var(--accent-ice); color:#000; border:none; padding:10px 16px; border-radius:8px; font-weight:bold; width:100%;">Получить код</button>
      </div>
    `;
  } 
  else if (tabId === 'tab-roster') {
    html = `<h2 class="gothic-title">Вассалы и Фавориты</h2><p style="color:var(--text-muted);">Здесь будут компактные списки 68 смотрителей и 45 партнёров с поиском и фильтрами.</p>`;
  }
  else if (tabId === 'tab-treasury') {
    html = `<h2 class="gothic-title">Сокровищница</h2><p style="color:var(--text-muted);">Инвентарь (237 предметов) с сортировкой по категориям.</p>`;
  }
  else if (tabId === 'tab-rituals') {
    html = `<h2 class="gothic-title">Ритуалы Силы</h2><p style="color:var(--text-muted);">Калькуляторы Близости, Влечения и Опыта Гильдии.</p>`;
  }
  else if (tabId === 'tab-settings') {
    html = `<h2 class="gotic-title">Паставия</h2><p style="color:var(--text-muted);">Настрайки языка, темы, экспорт/им�орт профиля.</p>`;
  }
  
  mainContent.innerHTML = html;
}

// Навешиваем события на Tab Bar
tabs.forEach(tab => {
  tab.addEventListener('click', (e) => {
    const target = e.currentTarget.getAttribute('data-target');
    renderTab(target);
  });
});

// Инициализация первого экрана
renderTab('tab-citadel');

// Настройка цвета шапки и фона для Telegram
tg.setHeaderColor('#0b0910');
tg.setBackgroundColor('#0b0910');
