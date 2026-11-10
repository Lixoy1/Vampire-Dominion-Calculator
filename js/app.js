import { GAME_DB, getIconUrl } from './data.js';
import {
  ATTRIBUTES, buildPresenceCurvesMap, calcWardenBaseTalentStars,
  calcConclaveBranch, autoDistributeConclave, calcMaxCourtyardLevel,
  calcWardenLevelsUpgrade, calculateTotalDominanceReport
} from './engine.js';

const tg = window.Telegram?.WebApp ?? null;
try { tg?.expand(); tg?.ready(); } catch {}

const STORAGE_KEY = 'vd_mini_app_v4_1';
const presenceCurvesMap = buildPresenceCurvesMap(GAME_DB.lover_presence_levels);
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = value => Number(value || 0).toLocaleString(state.settings.lang === 'en' ? 'en-US' : 'ru-RU');

function getDefaultState() {
  const ownedWardens = {};
  GAME_DB.wardens.slice(0, 8).forEach(w => { ownedWardens[w.id] = { level: 100, promoteId: 1, exp: 0, talents: {}, auras: {} }; });
  const ownedLovers = {};
  GAME_DB.lovers.slice(0, 6).forEach(l => { ownedLovers[l.id] = { affinity: 200, closeness: 30, sex: l.fixed_sex || 'female', presences: {} }; });
  return {
    activeTab:'tab-citadel', rosterMode:'wardens', attrFilter:'all', bagCat:'all', bagSearch:'',
    profile:{name:tg?.initDataUnsafe?.user?.first_name || 'Оптимист',server:'EU S-629',avatarId:10230},
    settings:{theme:'dark',lang:'ru',loverSex:'female'},
    account:{
      blood:50000000,conclaveExp:500000,courtyardExp:500,courtyardLvl:10,
      conclave:{strength:10,allure:10,intellect:10,spirit:10},
      ownedWardens,ownedLovers,
      bag:{4421:500,4422:300,4423:200,4175:25,4176:20,4177:15,4178:10,4179:8,4180:5,4005:4,4824:10,4230:10,4235:10}
    },
    plan:{conclave:{strength:10,allure:10,intellect:10,spirit:10},courtyardToLvl:10,levels:{},bonds:{},skins:{},summons:{wardens:[],lovers:[]}}
  };
}
function mergeState(saved) {
  const d=getDefaultState(), s=saved && typeof saved==='object' ? saved : {};
  return {
    ...d,...s,
    profile:{...d.profile,...(s.profile||{})},
    settings:{...d.settings,...(s.settings||{})},
    account:{
      ...d.account,...(s.account||{}),
      conclave:{...d.account.conclave,...(s.account?.conclave||{})},
      ownedWardens:{...d.account.ownedWardens,...(s.account?.ownedWardens||{})},
      ownedLovers:{...d.account.ownedLovers,...(s.account?.ownedLovers||{})},
      bag:{...d.account.bag,...(s.account?.bag||{})}
    },
    plan:{
      ...d.plan,...(s.plan||{}),
      conclave:{...d.plan.conclave,...(s.plan?.conclave||{})},
      levels:{...(s.plan?.levels||{})},
      summons:{...d.plan.summons,...(s.plan?.summons||{})}
    }
  };
}
function loadState(){
  try { const raw=localStorage.getItem(STORAGE_KEY); return raw ? mergeState(JSON.parse(raw)) : getDefaultState(); }
  catch(e){ console.warn('Save load failed',e); return getDefaultState(); }
}
let state=loadState();
function saveState(){ try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}catch(e){console.error(e);alert('Не удалось сохранить данные в памяти устройства.');} }
function haptic(kind='selection'){
  try { if(!tg?.HapticFeedback)return; if(kind==='success')tg.HapticFeedback.notificationOccurred('success'); else if(kind==='impact')tg.HapticFeedback.impactOccurred('light'); else tg.HapticFeedback.selectionChanged(); } catch {}
}
function tName(type,key){
  if(!key)return '';
  const dict=state.settings.lang==='en'?GAME_DB.names_en:GAME_DB.names_ru;
  return dict?.[type]?.[key] ?? GAME_DB.names_ru?.[type]?.[key] ?? String(key);
}
function applyTheme(){
  const light=state.settings.theme==='light';
  document.documentElement.classList.toggle('light-theme',light);
  try{const bg=light?'#f4efe6':'#0b0910';tg?.setHeaderColor(bg);tg?.setBackgroundColor(bg);}catch{}
}
function getDb(){return {wardens:GAME_DB.wardens,lovers:GAME_DB.lovers,items:GAME_DB.items,promotes:GAME_DB.warden_promotes,conclaveLevels:GAME_DB.conclave_levels,courtyardLevels:GAME_DB.courtyard_levels,presenceCurvesMap};}
function icon(path,alt=''){
  const url=getIconUrl(path);
  return url ? `<img src="${esc(url)}" alt="${esc(alt)}" class="hero-ava" loading="lazy" onerror="this.onerror=null;this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 64 64%22%3E%3Crect width=%2264%22 height=%2264%22 rx=%2212%22 fill=%22%23251b2a%22/%3E%3Ctext x=%2232%22 y=%2241%22 text-anchor=%22middle%22 font-size=%2228%22 fill=%22%23c9a45e%22%3E✦%3C/text%3E%3C/svg%3E';">` : '<div class="hero-ava hero-placeholder">✦</div>';
}
function reportNow(){return calculateTotalDominanceReport({db:getDb(),account:state.account,plan:state.plan});}
function runBloodOracle(){
  const db=getDb(),acc=state.account,wardensByAttr={};
  ATTRIBUTES.forEach(attr=>wardensByAttr[attr]=db.wardens.filter(w=>acc.ownedWardens[w.id]&&w.attributes.includes(attr)).length||1);
  state.plan.conclave=autoDistributeConclave(db.conclaveLevels,acc.conclave,acc.conclaveExp,wardensByAttr).levels;
  state.plan.courtyardToLvl=calcMaxCourtyardLevel(db.courtyardLevels,acc.courtyardLvl,acc.courtyardExp).toLvl;
  let left=acc.blood; const next={};
  for(const [id,data] of Object.entries(acc.ownedWardens))next[id]=Number(data.level)||1;
  while(left>0){
    let best=null,eff=0,costBest=0;
    for(const [id,data] of Object.entries(acc.ownedWardens)){
      const w=db.wardens.find(x=>x.id===Number(id));if(!w)continue;
      const cur=next[id],cap=db.promotes.find(p=>p.id===(data.promoteId||1))?.max_warden_lvl??100;
      if(cur>=cap)continue;
      const step=calcWardenLevelsUpgrade(w,cur,cur+1,data.promoteId||1,db.promotes,acc.bag,data.talents||{});
      if(step.bloodSpent>0&&step.bloodSpent<=left){
        const value=step.baseGain/step.bloodSpent;
        if(value>eff){eff=value;best=id;costBest=step.bloodSpent;}
      }
    }
    if(!best)break;next[best]++;left-=costBest;
  }
  state.plan.levels=next;saveState();haptic('success');renderTab(state.activeTab);
}

const sheet=$('#bottom-sheet'),sheetBody=$('#sheet-body');
function closeSheet(){sheet?.classList.add('hidden');}
$('.sheet-overlay')?.addEventListener('click',closeSheet);
function openNumpad({title,subtitle='',initial=0,max=999999999999,min=0,onConfirm}){
  let raw=String(Math.max(0,Number(initial)||0));
  sheetBody.innerHTML=`
    <div class="sheet-head"><div><div class="sheet-title">${esc(title)}</div><div class="sheet-subtitle">${esc(subtitle)}</div></div><button class="sheet-close" id="np-close" aria-label="Закрыть">✕</button></div>
    <div id="np-val" class="np-display"></div>
    <div class="numpad-grid">${[7,8,9,4,5,6,1,2,3].map(n=>`<button class="np-key" data-digit="${n}">${n}</button>`).join('')}<button class="np-key np-clear" id="np-clear">C</button><button class="np-key" data-digit="0">0</button><button class="np-key" id="np-back">⌫</button></div>
    <button id="np-ok" class="btn-oracle np-apply">Применить</button>`;
  sheet.classList.remove('hidden');
  const update=()=>{$('#np-val').textContent=fmt(Math.min(max,Number(raw)||0));};
  update();
  $$('[data-digit]',sheetBody).forEach(b=>b.addEventListener('click',()=>{haptic('impact');raw=raw==='0'?b.dataset.digit:raw+b.dataset.digit;raw=String(Math.min(max,Number(raw)||0));update();}));
  $('#np-clear').addEventListener('click',()=>{raw='0';update();haptic('impact');});
  $('#np-back').addEventListener('click',()=>{raw=raw.length>1?raw.slice(0,-1):'0';update();haptic('impact');});
  $('#np-close').addEventListener('click',closeSheet);
  $('#np-ok').addEventListener('click',()=>{const v=Math.max(min,Math.min(max,Number(raw)||0));onConfirm?.(v);closeSheet();haptic('success');});
}
function openWardenDetail(id){
  const db=getDb(),w=db.wardens.find(x=>x.id===id),ow=state.account.ownedWardens[id];if(!w||!ow)return;
  const promote=db.promotes.find(p=>p.id===(ow.promoteId||1)),target=state.plan.levels[id]??ow.level;
  sheetBody.innerHTML=`
    <div class="detail-head">${icon(w.icon_path,tName('warden',w.name))}<div class="hero-meta"><div class="hero-title detail-name">${esc(tName('warden',w.name))}</div><div class="hero-sub">${esc(tName('warden_promote',promote?.name)||'Прорыв')} · ${calcWardenBaseTalentStars(w)}★</div></div><button class="sheet-close" id="detail-close">✕</button></div>
    <div class="glass-card detail-card">
      <div class="edit-line"><span>Текущий уровень</span><button class="num-chip" id="wd-current">${fmt(ow.level)}</button></div>
      <div class="edit-line"><span>План уровня</span><button class="num-chip" id="wd-target">${fmt(target)}</button></div>
      <div class="edit-line"><span>Прорыв</span><select id="wd-promote" class="dark-select">${db.promotes.map(p=>`<option value="${p.id}" ${p.id===(ow.promoteId||1)?'selected':''}>${esc(tName('warden_promote',p.name))} · ${p.max_warden_lvl}</option>`).join('')}</select></div>
    </div>
    <div class="section-kicker">Таланты · ${w.talents.length}</div>
    <div class="talent-list">${w.talents.map(t=>`<div class="talent-line"><span>${esc(tName('attribute',t.attribute))} · <b>${t.stars}★</b></span><span class="hero-sub">${esc(t.script_chance)}%</span></div>`).join('')}</div>
    <button id="wd-remove" class="danger-action">Убрать из Свиты</button>`;
  sheet.classList.remove('hidden');
  $('#detail-close').addEventListener('click',closeSheet);
  $('#wd-current').addEventListener('click',()=>openNumpad({title:'Текущий уровень',subtitle:'Уровень смотрителя',initial:ow.level,min:1,max:450,onConfirm:v=>{ow.level=v;state.plan.levels[id]=Math.max(v,state.plan.levels[id]||v);saveState();openWardenDetail(id);}}));
  $('#wd-target').addEventListener('click',()=>openNumpad({title:'План уровня',subtitle:'Целевой уровень',initial:target,min:ow.level,max:450,onConfirm:v=>{state.plan.levels[id]=v;saveState();openWardenDetail(id);}}));
  $('#wd-promote').addEventListener('change',e=>{ow.promoteId=Number(e.target.value);saveState();openWardenDetail(id);});
  $('#wd-remove').addEventListener('click',()=>{delete state.account.ownedWardens[id];delete state.plan.levels[id];saveState();closeSheet();renderTab('tab-roster');});
}
function openLoverDetail(id){
  const l=GAME_DB.lovers.find(x=>x.id===id),ol=state.account.ownedLovers[id];if(!l||!ol)return;
  const avatar=state.settings.loverSex==='male'?(l.icon_path_male||l.icon_path_female):(l.icon_path_female||l.icon_path_male);
  sheetBody.innerHTML=`
    <div class="detail-head">${icon(avatar,tName('lover',l.name))}<div class="hero-meta"><div class="hero-title detail-name">${esc(tName('lover',l.name))}</div><div class="hero-sub">Параметры фаворита</div></div><button class="sheet-close" id="lover-close">✕</button></div>
    <div class="glass-card detail-card"><div class="edit-line"><span>Доверие</span><button class="num-chip" id="lover-aff">${fmt(ol.affinity)}</button></div><div class="edit-line"><span>Близость</span><button class="num-chip" id="lover-close-level">${fmt(ol.closeness)}</button></div></div>
    <button class="danger-action" id="lover-remove">Убрать из Свиты</button>`;
  sheet.classList.remove('hidden');
  $('#lover-close').addEventListener('click',closeSheet);
  $('#lover-aff').addEventListener('click',()=>openNumpad({title:'Очки доверия',initial:ol.affinity,onConfirm:v=>{ol.affinity=v;saveState();openLoverDetail(id);}}));
  $('#lover-close-level').addEventListener('click',()=>openNumpad({title:'Уровень близости',initial:ol.closeness,max:600,onConfirm:v=>{ol.closeness=v;saveState();openLoverDetail(id);}}));
  $('#lover-remove').addEventListener('click',()=>{delete state.account.ownedLovers[id];saveState();closeSheet();renderTab('tab-roster');});
}
const tabs=$$('.tab-item'),main=$('#main-content');
function renderTab(tabId){
  state.activeTab=tabId;saveState();haptic();
  tabs.forEach(t=>t.classList.toggle('active',t.dataset.target===tabId));
  const db=getDb();let report;
  try{report=reportNow();}catch(e){console.error('Dominance report failed',e);report={gain:{total:0,conclave:0,courtyard:0,levels:0,bonds:0},bagCalculators:{intimacy:{expected:0},attraction:{expected:0},guildExp:{expected:0}}};}
  if(tabId==='tab-citadel'){
    const avatar=db.wardens.find(w=>w.id===state.profile.avatarId)||db.wardens[0];
    const wCount=Object.keys(state.account.ownedWardens).length,lCount=Object.keys(state.account.ownedLovers).length;
    const pct=Math.round((wCount/db.wardens.length+lCount/db.lovers.length)*50);
    main.innerHTML=`
      <div class="glass-card lord-card">${icon(avatar?.icon_path,'Портрет Лорда')}<div class="hero-meta"><div class="section-kicker">Лорд-протектор</div><div class="lord-name">${esc(state.profile.name)}</div><div class="hero-sub">🌐 ${esc(state.profile.server)} · Хроники: ${pct}%</div><div class="prog-track"><div class="prog-fill" style="width:${pct}%"></div></div></div></div>
      <button class="btn-oracle" id="btn-oracle">⚡ Оракул Крови · Автостратегия</button>
      <div class="glass-card"><div class="summary-head"><h2 class="gothic-title">Сводка Господства</h2><strong>+${fmt(report.gain.total)}</strong></div><div class="summary-grid">${[['Конклав',report.gain.conclave],['Сад',report.gain.courtyard],['Уровни вассалов',report.gain.levels],['Узы фаворитов',report.gain.bonds]].map(([n,v])=>`<div><div class="stat-label">${n}</div><div class="stat-value">+${fmt(v)}</div></div>`).join('')}</div></div>
      <div class="glass-card info-card"><h2 class="gothic-title">🔗 Связь с Цитаделью</h2><p class="hero-sub">Локальный калькулятор. Прямая синхронизация с игровым сервером пока не подключена.</p><button id="btn-game-link" class="btn-connect">Подключить игровой аккаунт</button></div>`;
  } else if(tabId==='tab-roster'){
    const ow=Object.keys(state.account.ownedWardens).length,ol=Object.keys(state.account.ownedLovers).length;
    main.innerHTML=`
      <div class="section-title-row"><h2 class="gothic-title">Свита Лорда</h2><span class="section-count">${ow}/${db.wardens.length} · ${ol}/${db.lovers.length}</span></div>
      <div class="pill-row"><button class="pill-btn ${state.rosterMode==='wardens'?'active':''}" data-rmode="wardens">⚔️ Вассалы (${ow})</button><button class="pill-btn ${state.rosterMode==='lovers'?'active':''}" data-rmode="lovers">🌹 Фавориты (${ol})</button><button class="pill-btn ${state.rosterMode==='add_wardens'?'active':''}" data-rmode="add_wardens">➕ Призыв</button></div>
      <div class="pill-row">${[['all','Все'],['strength','🔴 Сила'],['allure','🟣 Харизма'],['intellect','🟢 Интеллект'],['spirit','🔵 Воля']].map(([k,v])=>`<button class="pill-btn ${state.attrFilter===k?'active':''}" data-attr="${k}">${v}</button>`).join('')}</div>
      <div id="roster-list"></div>`;
    const list=$('#roster-list');
    if(state.rosterMode==='wardens'){
      const rows=db.wardens.filter(w=>state.account.ownedWardens[w.id]&&(state.attrFilter==='all'||w.attributes.includes(state.attrFilter)));
      list.innerHTML=rows.map(w=>{const own=state.account.ownedWardens[w.id],target=state.plan.levels[w.id]??own.level;return `<div class="hero-row" data-open-warden="${w.id}">${icon(w.icon_path,tName('warden',w.name))}<div class="hero-meta"><div class="hero-title">${esc(tName('warden',w.name))}</div><div class="hero-sub">Ур. ${own.level}${target>own.level?` → <b class="gain-text">${target}</b>`:''} · ${calcWardenBaseTalentStars(w)}★</div></div><div class="num-chip">Ур. ${own.level}</div></div>`;}).join('')||'<p class="empty-state">Нет вассалов по выбранному фильтру</p>';
    }else if(state.rosterMode==='lovers'){
      const rows=db.lovers.filter(l=>state.account.ownedLovers[l.id]&&(state.attrFilter==='all'||l.attributes.includes(state.attrFilter)));
      list.innerHTML=rows.map(l=>{const own=state.account.ownedLovers[l.id],path=state.settings.loverSex==='male'?(l.icon_path_male||l.icon_path_female):(l.icon_path_female||l.icon_path_male);return `<div class="hero-row" data-open-lover="${l.id}">${icon(path,tName('lover',l.name))}<div class="hero-meta"><div class="hero-title">${esc(tName('lover',l.name))}</div><div class="hero-sub">Доверие: ${fmt(own.affinity)} · Близость: ${own.closeness}</div></div><div class="num-chip">♡ ${fmt(own.affinity)}</div></div>`;}).join('')||'<p class="empty-state">Пока нет фаворитов по фильтру</p>';
    }else{
      const rows=db.wardens.filter(w=>!state.account.ownedWardens[w.id]&&(state.attrFilter==='all'||w.attributes.includes(state.attrFilter)));
      list.innerHTML=rows.map(w=>`<div class="hero-row summon-row" data-summon-warden="${w.id}">${icon(w.icon_path,tName('warden',w.name))}<div class="hero-meta"><div class="hero-title">${esc(tName('warden',w.name))}</div><div class="hero-sub">Талантов: ${w.talents.length} · ${calcWardenBaseTalentStars(w)}★</div></div><span class="pill-btn active">+ Добавить</span></div>`).join('')||'<p class="empty-state">Все смотрители уже добавлены</p>';
    }
  } else if(tabId==='tab-treasury'){
    const cats=[['all','Все'],['coins','Печати'],['talent','Таланты'],['book','Книги'],['clothes','Прорыв'],['guild_exp','Гильдия'],['intimacy','Близость'],['attraction','Влечение'],['skin','Ткань']];
    const filtered=db.items.filter(it=>(state.bagCat==='all'||it.category===state.bagCat)&&(!state.bagSearch||tName('item',it.name).toLowerCase().includes(state.bagSearch.toLowerCase())));
    main.innerHTML=`
      <div class="section-title-row"><h2 class="gothic-title">Казна и Сумка</h2><span class="section-count">${Object.values(state.account.bag).filter(v=>v>0).length}/${db.items.length}</span></div>
      <div class="resource-grid">${[['blood','🩸 Кровь',state.account.blood],['conclaveExp','🏛 Конклав',state.account.conclaveExp],['courtyardExp','🌿 Очки Сада',state.account.courtyardExp],['courtyardLvl','🌱 Уровень Сада',state.account.courtyardLvl]].map(([key,label,val])=>`<button class="resource-cell" data-res-edit="${key}"><span>${label}</span><b>${fmt(val)}</b></button>`).join('')}</div>
      <div class="pill-row">${cats.map(([k,v])=>`<button class="pill-btn ${state.bagCat===k?'active':''}" data-bcat="${k}">${v}</button>`).join('')}</div>
      <input id="bag-search" class="search-input" type="search" placeholder="🔍 Поиск предмета..." value="${esc(state.bagSearch)}" autocomplete="off">
      <div id="bag-list"></div>`;
    renderBagList(db);
  } else if(tabId==='tab-rituals'){
    main.innerHTML=`
      <h2 class="gothic-title">Ритуалы Силы</h2>
      <div class="glass-card"><div class="section-kicker">🏛 Конклав · уровни ветвей</div>${ATTRIBUTES.map(attr=>`<div class="edit-line"><span>${esc(tName('attribute',attr))}</span><div class="ritual-values"><button class="num-chip" data-conclave-current="${attr}">${state.account.conclave[attr]||0}</button><span>→</span><button class="num-chip plan-chip" data-conclave-plan="${attr}">${state.plan.conclave[attr]??state.account.conclave[attr]??0}</button></div></div>`).join('')}<button id="btn-ritual-conclave" class="btn-oracle">⚡ Оптимизировать Конклав</button></div>
      <div class="glass-card"><div class="section-kicker">🌿 Сад · текущий и плановый уровень</div><div class="edit-line"><span>Текущий уровень</span><button class="num-chip" id="garden-current">${state.account.courtyardLvl}</button></div><div class="edit-line"><span>Плановый уровень</span><button class="num-chip plan-chip" id="garden-target">${state.plan.courtyardToLvl}</button></div><button id="btn-garden-auto" class="pill-btn active full-btn">Рассчитать максимум по очкам Сада</button></div>
      <div class="glass-card"><div class="section-kicker">🥂 Расчёты по предметам в сумке</div><div class="edit-line"><span>💖 Близость · ожидаемо</span><b class="gain-text">${fmt(report.bagCalculators.intimacy.expected)}</b></div><div class="edit-line"><span>🌹 Влечение · ожидаемо</span><b class="gain-text">${fmt(report.bagCalculators.attraction.expected)}</b></div><div class="edit-line"><span>🛡 Опыт гильдии · 3 дня</span><b class="gain-text">${fmt(report.bagCalculators.guildExp.expected)}</b></div></div>
      <div class="glass-card"><div class="section-kicker">📈 Прирост по плану</div><div class="summary-head"><span>Общее господство</span><strong>+${fmt(report.gain.total)}</strong></div><div class="hero-sub">Расчёт использует сохранённые данные профиля и оригинальный движок v3.1.</div></div>`;
  } else if(tabId==='tab-settings'){
    main.innerHTML=`
      <h2 class="gothic-title">Настройки Профиля</h2><div class="glass-card"><label class="field-label" for="inp-name">Имя Лорда</label><input id="inp-name" class="settings-input" maxlength="48" value="${esc(state.profile.name)}"><label class="field-label" for="inp-server">Сервер и Регион</label><input id="inp-server" class="settings-input" maxlength="48" value="${esc(state.profile.server)}"></div>
      <div class="glass-card"><div class="edit-line"><span>Тема интерфейса</span><button class="pill-btn active" id="btn-toggle-theme">${state.settings.theme==='dark'?'🌙 Тёмная':'☀️ Светлая'}</button></div><div class="edit-line"><span>Язык интерфейса</span><button class="pill-btn" id="btn-toggle-lang">${state.settings.lang.toUpperCase()}</button></div><div class="edit-line"><span>Пол фаворитов</span><button class="pill-btn" id="btn-toggle-sex">${state.settings.loverSex==='female'?'Она':'Он'}</button></div></div>
      <div class="settings-actions"><button class="pill-btn" id="btn-export">💾 Экспорт</button><button class="pill-btn" id="btn-import">📂 Импорт</button><input id="import-file" type="file" accept="application/json,.json" hidden></div><button id="btn-reset" class="danger-action">🗑 Сбросить аккаунт</button>`;
  }
  bindEvents(tabId,db);
}
function renderBagList(db){
  const list=$('#bag-list');if(!list)return;
  const filtered=db.items.filter(it=>(state.bagCat==='all'||it.category===state.bagCat)&&(!state.bagSearch||tName('item',it.name).toLowerCase().includes(state.bagSearch.toLowerCase())));
  list.innerHTML=filtered.map(it=>`<div class="hero-row" data-bag-item="${it.id}">${icon(it.icon_path,tName('item',it.name))}<div class="hero-meta"><div class="hero-title">${esc(tName('item',it.name))}</div><div class="hero-sub">ID: ${it.id}</div></div><div class="num-chip">${fmt(state.account.bag[it.id]||0)}</div></div>`).join('')||'<p class="empty-state">Предметы не найдены</p>';
  $$('[data-bag-item]',list).forEach(row=>row.addEventListener('click',()=>{const id=Number(row.dataset.bagItem),item=db.items.find(x=>x.id===id);openNumpad({title:tName('item',item?.name),subtitle:'Количество в сумке',initial:state.account.bag[id]||0,onConfirm:v=>{state.account.bag[id]=v;saveState();renderTab('tab-treasury');}});}));
}
function bindEvents(tabId,db){
  $('#btn-oracle')?.addEventListener('click',runBloodOracle);
  $('#btn-game-link')?.addEventListener('click',()=>{sheetBody.innerHTML='<h3 class="gothic-title">Связь с Цитаделью</h3><p class="hero-sub">Прямая синхронизация с игровым сервером пока не реализована. Калькулятор работает локально.</p><button class="btn-oracle" id="game-link-close">Закрыть</button>';sheet.classList.remove('hidden');$('#game-link-close').addEventListener('click',closeSheet);});
  if(tabId==='tab-roster'){
    $$('[data-rmode]').forEach(b=>b.addEventListener('click',()=>{state.rosterMode=b.dataset.rmode;renderTab(tabId);}));
    $$('[data-attr]').forEach(b=>b.addEventListener('click',()=>{state.attrFilter=b.dataset.attr;renderTab(tabId);}));
    $$('[data-open-warden]').forEach(row=>row.addEventListener('click',()=>openWardenDetail(Number(row.dataset.openWarden))));
    $$('[data-open-lover]').forEach(row=>row.addEventListener('click',()=>openLoverDetail(Number(row.dataset.openLover))));
    $$('[data-summon-warden]').forEach(row=>row.addEventListener('click',()=>{const id=Number(row.dataset.summonWarden);state.account.ownedWardens[id]={level:1,promoteId:1,exp:0,talents:{},auras:{}};saveState();haptic('success');renderTab(tabId);}));
  }
  if(tabId==='tab-treasury'){
    $$('[data-res-edit]').forEach(el=>el.addEventListener('click',()=>{const key=el.dataset.resEdit,titles={blood:'Кровь аккаунта',conclaveExp:'Очки Конклава',courtyardExp:'Очки Сада',courtyardLvl:'Уровень Сада'};openNumpad({title:titles[key],initial:state.account[key],max:key==='courtyardLvl'?210:999999999999,min:0,onConfirm:v=>{state.account[key]=v;saveState();renderTab(tabId);}});}));
    $$('[data-bcat]').forEach(b=>b.addEventListener('click',()=>{state.bagCat=b.dataset.bcat;renderTab(tabId);}));
    $('#bag-search')?.addEventListener('input',e=>{state.bagSearch=e.target.value;renderBagList(db);});
  }
  if(tabId==='tab-rituals'){
    $$('[data-conclave-current]').forEach(b=>b.addEventListener('click',()=>{const a=b.dataset.conclaveCurrent;openNumpad({title:'Текущий уровень · '+tName('attribute',a),initial:state.account.conclave[a],max:180,onConfirm:v=>{state.account.conclave[a]=v;state.plan.conclave[a]=Math.max(v,state.plan.conclave[a]||v);saveState();renderTab(tabId);}});}));
    $$('[data-conclave-plan]').forEach(b=>b.addEventListener('click',()=>{const a=b.dataset.conclavePlan;openNumpad({title:'План Конклава · '+tName('attribute',a),initial:state.plan.conclave[a],max:180,min:state.account.conclave[a],onConfirm:v=>{state.plan.conclave[a]=v;saveState();renderTab(tabId);}});}));
    $('#btn-ritual-conclave')?.addEventListener('click',()=>{const counts={};ATTRIBUTES.forEach(a=>counts[a]=db.wardens.filter(w=>state.account.ownedWardens[w.id]&&w.attributes.includes(a)).length||1);state.plan.conclave=autoDistributeConclave(db.conclaveLevels,state.account.conclave,state.account.conclaveExp,counts).levels;saveState();haptic('success');renderTab(tabId);});
    $('#garden-current')?.addEventListener('click',()=>openNumpad({title:'Текущий уровень Сада',initial:state.account.courtyardLvl,max:210,onConfirm:v=>{state.account.courtyardLvl=v;state.plan.courtyardToLvl=Math.max(v,state.plan.courtyardToLvl||v);saveState();renderTab(tabId);}}));
    $('#garden-target')?.addEventListener('click',()=>openNumpad({title:'Плановый уровень Сада',initial:state.plan.courtyardToLvl,max:210,min:state.account.courtyardLvl,onConfirm:v=>{state.plan.courtyardToLvl=v;saveState();renderTab(tabId);}}));
    $('#btn-garden-auto')?.addEventListener('click',()=>{state.plan.courtyardToLvl=calcMaxCourtyardLevel(db.courtyardLevels,state.account.courtyardLvl,state.account.courtyardExp).toLvl;saveState();haptic('success');renderTab(tabId);});
  }
  if(tabId==='tab-settings'){
    $('#inp-name')?.addEventListener('change',e=>{state.profile.name=e.target.value.trim()||'Оптимист';saveState();});
    $('#inp-server')?.addEventListener('change',e=>{state.profile.server=e.target.value.trim()||'Не указан';saveState();});
    $('#btn-toggle-theme')?.addEventListener('click',()=>{state.settings.theme=state.settings.theme==='dark'?'light':'dark';saveState();applyTheme();renderTab(tabId);});
    $('#btn-toggle-lang')?.addEventListener('click',()=>{state.settings.lang=state.settings.lang==='ru'?'en':'ru';saveState();renderTab(tabId);});
    $('#btn-toggle-sex')?.addEventListener('click',()=>{state.settings.loverSex=state.settings.loverSex==='female'?'male':'female';saveState();renderTab(tabId);});
    $('#btn-export')?.addEventListener('click',()=>{const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='vampire-dominion-profile.json';a.click();URL.revokeObjectURL(url);});
    $('#btn-import')?.addEventListener('click',()=>$('#import-file').click());
    $('#import-file')?.addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;try{const parsed=JSON.parse(await f.text());if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('Invalid profile');state=mergeState(parsed);saveState();applyTheme();renderTab(state.activeTab||'tab-citadel');alert('Профиль импортирован.');}catch(err){console.error(err);alert('Не удалось импортировать JSON-файл.');}finally{e.target.value='';}});
    $('#btn-reset')?.addEventListener('click',()=>{if(!confirm('Сбросить все данные аккаунта?'))return;state=getDefaultState();saveState();applyTheme();renderTab('tab-settings');});
  }
}
tabs.forEach(tab=>tab.addEventListener('click',()=>renderTab(tab.dataset.target)));
applyTheme();
renderTab(state.activeTab||'tab-citadel');
