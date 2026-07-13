
'use strict';

const $ = (selector, root=document) => root.querySelector(selector);
const $$ = (selector, root=document) => [...root.querySelectorAll(selector)];

const STORAGE_KEY = 'dkd_v7_data';
const SESSION_KEY = 'dkd_v7_session';
const SERIES_COUNTS = {A:26,B:32,C:29,D:26,E:24,F:25,G:21,H:23,M:15};
const MARD_221 = Object.entries(SERIES_COUNTS)
  .flatMap(([series,count]) => Array.from({length:count},(_,i)=>`${series}${i+1}`));

const DEFAULT_DATA = {
  users:[
    {u:'gaojiancheng',p:'123456',role:'boss',name:'老板'},
    {u:'beijing',p:'bj123456',role:'beijing',name:'北京店'},
    {u:'hangzhou',p:'hz123456',role:'hangzhou',name:'杭州店'}
  ],
  tables:[], orders:[], beads:[],
  settings:{packages:[60,90,120,180],prices:{60:39,90:59,120:79,180:99},sound:true}
};

let state = loadData();
let session = safeParse(localStorage.getItem(SESSION_KEY));
let currentView = 'home';
let selectedStore = session?.role === 'boss' ? 'beijing' : (session?.role || 'beijing');
let selectedSeries = 'A';
let selectedColor = 'A1';
let selectedWeight = 0.5;
let audioEnabled = false;
let tickHandle = null;
let alarmHandle = null;

function safeParse(raw){try{return raw?JSON.parse(raw):null}catch{return null}}
function clone(value){return JSON.parse(JSON.stringify(value))}
function loadData(){
  const modern=safeParse(localStorage.getItem(STORAGE_KEY));
  if(modern)return normalize(modern);
  const legacy=safeParse(localStorage.getItem('dkd_v6_data'))||safeParse(localStorage.getItem('dkd_v3_data'))||safeParse(localStorage.getItem('dkd_v2_data'));
  return normalize(legacy||clone(DEFAULT_DATA));
}
function normalize(data){
  const d={...clone(DEFAULT_DATA),...data};
  d.users=Array.isArray(d.users)?d.users:clone(DEFAULT_DATA.users);
  d.tables=Array.isArray(d.tables)?d.tables:[];
  d.orders=Array.isArray(d.orders)?d.orders:[];
  d.beads=Array.isArray(d.beads)?d.beads:[];
  d.settings={...clone(DEFAULT_DATA.settings),...(d.settings||{})};
  return d;
}
function save(){localStorage.setItem(STORAGE_KEY,JSON.stringify(state))}
function uid(){return crypto.randomUUID?crypto.randomUUID():`${Date.now()}_${Math.random().toString(16).slice(2)}`}
function now(){return Date.now()}
function shopName(store){return store==='beijing'?'北京店':'杭州店'}
function activeStore(){return session?.role==='boss'?selectedStore:session?.role}
function visibleTables(){return state.tables.filter(item=>item.store===activeStore())}
function visibleOrders(){return state.orders.filter(item=>item.store===activeStore())}
function visibleBeads(){return state.beads.filter(item=>item.store===activeStore())}
function formatTime(ms){
  const late=ms<0;ms=Math.abs(ms);const total=Math.floor(ms/1000),h=Math.floor(total/3600),m=Math.floor((total%3600)/60),s=total%60;
  return `${late?'超时 ':''}${h?String(h).padStart(2,'0')+':':''}${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
function legacyWeightJin(b){
  if(Number.isFinite(Number(b.weightJin))&&Number(b.weightJin)>0)return Number(b.weightJin);
  const qty=Number(b.qty||1),unit=String(b.unit||'');
  if(unit.includes('半斤'))return qty*0.5;
  if(unit.includes('斤'))return qty;
  return qty;
}
function formatWeight(value){
  const n=Number(value);
  if(!Number.isFinite(n)||n<=0)return '未填写';
  if(n===0.5)return '半斤';
  return `${Number.isInteger(n)?n:n.toFixed(1).replace(/\.0$/,'')}斤`;
}
function setView(view){currentView=view;render()}
function login(form){
  const fd=new FormData(form),u=String(fd.get('username')||'').trim(),p=String(fd.get('password')||'');
  const user=state.users.find(item=>item.u===u&&item.p===p);
  if(!user){alert('账号或密码错误');return}
  session={u:user.u,role:user.role,name:user.name};localStorage.setItem(SESSION_KEY,JSON.stringify(session));
  selectedStore=user.role==='boss'?'beijing':user.role;currentView='home';render();
}
function logout(){localStorage.removeItem(SESSION_KEY);session=null;currentView='home';render()}
function enableAudio(){audioEnabled=true;beep(1);alert('声音提醒已开启')}
function beep(times=1){
  if(!audioEnabled||!state.settings.sound)return;
  try{
    const ctx=new(window.AudioContext||window.webkitAudioContext)();
    for(let i=0;i<times;i++){
      const osc=ctx.createOscillator(),gain=ctx.createGain(),t=ctx.currentTime+i*.22;
      osc.frequency.value=880;osc.connect(gain);gain.connect(ctx.destination);
      gain.gain.setValueAtTime(.001,t);gain.gain.exponentialRampToValueAtTime(.25,t+.02);gain.gain.exponentialRampToValueAtTime(.001,t+.16);
      osc.start(t);osc.stop(t+.18);
    }
  }catch(e){console.error(e)}
}
function checkTimers(){
  if(!session)return;
  const due=visibleTables().some(t=>!t.paused&&now()>=t.endAt&&!t.ack);
  if(due&&!alarmHandle){beep(4);alarmHandle=setInterval(()=>beep(4),5000)}
  if(!due&&alarmHandle){clearInterval(alarmHandle);alarmHandle=null}
}
function startTick(){clearInterval(tickHandle);tickHandle=setInterval(()=>{checkTimers();if(session&&currentView==='home')render(false)},1000)}

function render(resetScroll=true){
  if(!session){renderLogin();return}
  if(resetScroll)window.scrollTo(0,0);
  const store=activeStore();
  $('#app').innerHTML=`<div class="app-shell">
    <header class="topbar"><div class="brand"><img src="logo.png" alt="豆可兜"><div class="brand-copy"><div class="brand-title">豆可兜</div><div class="brand-sub">${shopName(store)} · ${session.name}</div></div></div><button class="btn ghost" data-action="logout">退出</button></header>
    ${session.role==='boss'?renderStoreTabs():''}
    <section id="view">${renderView()}</section>
    <nav class="navbar">${navButton('home','首页')}${navButton('orders','订单')}${navButton('beads','补豆')}${navButton('settings','设置')}</nav>
  </div>`;
  bindPageEvents();
}
function renderLogin(){
  $('#app').innerHTML=`<div class="login"><section class="login-card"><img class="login-logo" src="logo.png" alt="豆可兜"><div class="login-title">豆可兜门店系统</div><div class="login-sub">请输入账号和密码</div><form id="loginForm"><div class="field"><input name="username" placeholder="账号" autocomplete="username" required></div><div class="field"><input name="password" type="password" placeholder="密码" autocomplete="current-password" required></div><button class="btn full" type="submit">登录</button></form></section></div>`;
  $('#loginForm').addEventListener('submit',e=>{e.preventDefault();login(e.currentTarget)});
}
function renderStoreTabs(){return `<div class="store-tabs"><button data-store="beijing" class="${selectedStore==='beijing'?'active':''}">北京店</button><button data-store="hangzhou" class="${selectedStore==='hangzhou'?'active':''}">杭州店</button></div>`}
function navButton(view,label){return `<button data-view="${view}" class="${currentView===view?'active':''}">${label}</button>`}
function renderView(){if(currentView==='home')return renderHome();if(currentView==='orders')return renderOrders();if(currentView==='beads')return renderBeads();return renderSettings()}
function renderHome(){
  const tables=visibleTables(),orders=visibleOrders(),today=new Date().toDateString(),todayOrders=orders.filter(o=>new Date(o.checkoutAt).toDateString()===today);
  const revenue=todayOrders.reduce((sum,o)=>sum+Number(o.amount||0),0),people=todayOrders.reduce((sum,o)=>sum+Number(o.people||0),0)+tables.reduce((sum,t)=>sum+Number(t.people||0),0);
  return `<div class="stats"><div class="card stat"><span>今日营业额</span><strong>¥${revenue}</strong></div><div class="card stat"><span>营业中</span><strong>${tables.length}</strong></div><div class="card stat"><span>今日人数</span><strong>${people}</strong></div></div>
  <div class="action-row"><button class="btn" data-action="open-table">＋ 开台</button><button class="btn secondary" data-action="sound">开启声音</button></div>
  ${tables.length?`<div class="table-list">${tables.map(renderTableCard).join('')}</div>`:`<div class="card empty">暂无营业桌<br><br><button class="btn" data-action="open-table">立即开台</button></div>`}`;
}
function renderTableCard(t){
  const left=t.paused?t.endAt-t.pauseAt:t.endAt-now(),status=left<=0?['red','已超时']:left<=600000?['yellow','快到期']:['green','正常'];
  return `<article class="card table-card"><div class="table-head"><div class="table-no">${escapeHtml(t.no)}</div><span class="pill ${status[0]}">${status[1]}</span></div><div class="timer">${formatTime(left)}</div><div class="meta-grid"><div>${t.people}人</div><div>${t.duration}分钟</div><div>开始 ${new Date(t.startAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}</div><div>${escapeHtml(t.remark||'无备注')}</div></div><div class="table-actions"><button class="btn secondary" data-action="extend" data-id="${t.id}">+30分钟</button><button class="btn secondary" data-action="pause" data-id="${t.id}">${t.paused?'继续':'暂停'}</button><button class="btn" data-action="checkout" data-id="${t.id}">结账</button></div></article>`;
}
function renderOrders(){
  const orders=visibleOrders();
  return `<div class="section-title">订单记录</div>${orders.length?orders.map(o=>`<article class="card order"><strong>${escapeHtml(o.no)} · ¥${o.amount}</strong><div class="order-sub">${o.people}人｜${o.duration}分钟｜${new Date(o.checkoutAt).toLocaleString()}</div></article>`).join(''):`<div class="card empty">暂无订单</div>`}`;
}
function renderBeads(){
  const list=visibleBeads(),todo=list.filter(b=>b.status==='未采购'),done=list.filter(b=>b.status==='已采购');
  return `<div class="topbar"><div><div class="section-title">补豆计划</div><div class="brand-sub">MARD 221 色｜待采购 ${todo.length}｜已采购 ${done.length}</div></div><button class="btn" data-action="add-bead">＋ 添加</button></div>
  <div class="action-row" style="grid-template-columns:1fr"><button class="btn secondary" data-action="copy-beads">复制待采购清单</button></div>
  ${list.length?list.map(renderBeadRow).join(''):`<div class="card empty">暂无补豆计划<br><br><button class="btn" data-action="add-bead">添加补豆</button></div>`}`;
}
function renderBeadRow(b){
  return `<article class="card bead"><div><strong style="font-size:20px">${escapeHtml(b.color)}</strong> <span class="pill ${b.status==='已采购'?'green':'yellow'}">${b.status}</span><div class="bead-sub">${formatWeight(legacyWeightJin(b))}｜${new Date(b.createdAt).toLocaleString()}${b.remark?'｜'+escapeHtml(b.remark):''}</div></div><div class="bead-actions"><button class="btn secondary" data-action="toggle-bead" data-id="${b.id}">${b.status==='已采购'?'改为待采购':'已采购'}</button><button class="btn ghost" data-action="delete-bead" data-id="${b.id}">删除</button></div></article>`;
}
function renderSettings(){return `<div class="section-title">设置</div><article class="card setting"><strong>声音提醒</strong><p class="hint">首次使用请在首页点“开启声音”。切到后台再回来，倒计时会按真实时间自动校准。</p></article><article class="card setting"><strong>MARD 221 色</strong><p class="hint">A26、B32、C29、D26、E24、F25、G21、H23、M15，共 221 色。</p></article>`}
function bindPageEvents(){
  $$('[data-view]').forEach(btn=>btn.addEventListener('click',()=>setView(btn.dataset.view)));
  $$('[data-store]').forEach(btn=>btn.addEventListener('click',()=>{selectedStore=btn.dataset.store;render()}));
  $$('[data-action]').forEach(btn=>btn.addEventListener('click',()=>handleAction(btn.dataset.action,btn.dataset.id)));
}
function handleAction(action,id){
  const actions={'logout':logout,'open-table':openTableModal,'sound':enableAudio,'add-bead':openBeadModal,'copy-beads':copyBeads,'extend':()=>extendTable(id),'pause':()=>pauseTable(id),'checkout':()=>checkout(id),'toggle-bead':()=>toggleBead(id),'delete-bead':()=>deleteBead(id)};
  actions[action]?.();
}
function openTableModal(){
  closeModal();const modal=document.createElement('div');modal.className='modal';
  modal.innerHTML=`<form class="sheet" id="tableForm"><div class="sheet-head"><h2 style="margin:0">开台</h2><button type="button" class="btn ghost" data-close>关闭</button></div><div class="field"><label>桌号</label><input name="tableNo" placeholder="例如：A1、8号桌、VIP1" required></div><div class="field"><label>人数</label><div class="choice-grid">${[1,2,3,4,5,6,7,8].map(n=>`<button type="button" class="choice ${n===1?'active':''}" data-people="${n}">${n}</button>`).join('')}</div></div><div class="field"><label>套餐</label><div class="choice-grid">${state.settings.packages.map((n,i)=>`<button type="button" class="choice ${i===0?'active':''}" data-duration="${n}">${n}分</button>`).join('')}</div></div><div class="field"><input name="remark" placeholder="备注，可不填"></div><input type="hidden" name="people" value="1"><input type="hidden" name="duration" value="${state.settings.packages[0]}"><button class="btn full" type="submit">开始倒计时</button></form>`;
  document.body.appendChild(modal);modal.addEventListener('click',e=>{if(e.target===modal)closeModal()});$('[data-close]',modal).addEventListener('click',closeModal);
  $$('[data-people]',modal).forEach(btn=>btn.addEventListener('click',()=>{$$('[data-people]',modal).forEach(b=>b.classList.remove('active'));btn.classList.add('active');$('[name="people"]',modal).value=btn.dataset.people}));
  $$('[data-duration]',modal).forEach(btn=>btn.addEventListener('click',()=>{$$('[data-duration]',modal).forEach(b=>b.classList.remove('active'));btn.classList.add('active');$('[name="duration"]',modal).value=btn.dataset.duration}));
  $('#tableForm',modal).addEventListener('submit',e=>{e.preventDefault();const fd=new FormData(e.currentTarget),no=String(fd.get('tableNo')||'').trim();if(!no){alert('请输入桌号');return}createTable({no,people:Number(fd.get('people')||1),duration:Number(fd.get('duration')||60),remark:String(fd.get('remark')||'').trim()})});
}
function createTable(values){
  const duration=Number(values.duration)||60;
  state.tables.push({id:uid(),store:activeStore(),no:values.no,people:Math.max(1,Number(values.people)||1),duration,startAt:now(),endAt:now()+duration*60000,paused:false,remark:values.remark||'',alerted:[],ack:false});
  save();closeModal();render();
}
function extendTable(id){const t=state.tables.find(x=>x.id===id);if(!t)return;t.endAt+=1800000;t.ack=false;t.alerted=[];save();render()}
function pauseTable(id){const t=state.tables.find(x=>x.id===id);if(!t)return;if(!t.paused){t.paused=true;t.pauseAt=now()}else{t.endAt+=now()-t.pauseAt;t.paused=false;delete t.pauseAt}save();render()}
function checkout(id){const t=state.tables.find(x=>x.id===id);if(!t)return;const overtime=Math.max(0,now()-t.endAt),amount=(state.settings.prices[t.duration]||0)+Math.ceil(overtime/1800000)*20;state.orders.unshift({...t,orderId:uid(),checkoutAt:now(),pay:'微信',amount,overtime});state.tables=state.tables.filter(x=>x.id!==id);save();render()}

function openBeadModal(){
  closeModal();selectedSeries='A';selectedColor='A1';selectedWeight=0.5;
  const modal=document.createElement('div');modal.className='modal';
  modal.innerHTML=`<form class="sheet" id="beadForm">
    <div class="sheet-head"><div><h2 style="margin:0">添加补豆</h2><div class="hint">选择色号和本次采购重量</div></div><button type="button" class="btn ghost" data-close>关闭</button></div>
    <div id="picker"></div>
    <div class="field"><label>采购重量</label>
      <div class="weight-grid">
        <button type="button" class="weight-option active" data-weight="0.5">半斤</button>
        <button type="button" class="weight-option" data-weight="1">1斤</button>
        <button type="button" class="weight-option" data-weight="1.5">1.5斤</button>
        <button type="button" class="weight-option" data-weight="2">2斤</button>
        <button type="button" class="weight-option" data-weight="custom">其他</button>
      </div>
      <div class="custom-weight" id="customWeight"><input name="customWeight" type="number" min="0.1" step="0.1" inputmode="decimal" placeholder="填写重量，例如 3 或 2.5"></div>
    </div>
    <div class="field"><input name="remark" placeholder="备注，可不填"></div>
    <button class="btn full" type="submit">加入待采购</button>
  </form>`;
  document.body.appendChild(modal);drawPicker(modal);
  modal.addEventListener('click',e=>{if(e.target===modal)closeModal()});$('[data-close]',modal).addEventListener('click',closeModal);
  $$('[data-weight]',modal).forEach(btn=>btn.addEventListener('click',()=>{
    $$('[data-weight]',modal).forEach(b=>b.classList.remove('active'));btn.classList.add('active');
    const value=btn.dataset.weight,custom=$('#customWeight',modal);
    if(value==='custom'){selectedWeight=null;custom.classList.add('show');$('[name="customWeight"]',modal).focus()}
    else{selectedWeight=Number(value);custom.classList.remove('show')}
  }));
  $('#beadForm',modal).addEventListener('submit',e=>{
    e.preventDefault();const fd=new FormData(e.currentTarget);
    const weight=selectedWeight??Number(fd.get('customWeight'));
    if(!Number.isFinite(weight)||weight<=0){alert('请填写正确的采购重量');return}
    state.beads.unshift({id:uid(),store:activeStore(),color:selectedColor,weightJin:weight,status:'未采购',remark:String(fd.get('remark')||'').trim(),createdAt:now(),doneAt:null});
    save();closeModal();currentView='beads';render();
  });
}
function drawPicker(modal){
  const codes=MARD_221.filter(c=>c.startsWith(selectedSeries));
  $('#picker',modal).innerHTML=`<div class="series-tabs">${Object.keys(SERIES_COUNTS).map(s=>`<button type="button" data-series="${s}" class="${s===selectedSeries?'active':''}">${s}</button>`).join('')}</div><div class="selected-code"><span>已选色号</span><strong>${selectedColor}</strong></div><div class="color-grid">${codes.map(c=>`<button type="button" data-color="${c}" class="${c===selectedColor?'active':''}">${c}</button>`).join('')}</div>`;
  $$('[data-series]',modal).forEach(btn=>btn.addEventListener('click',()=>{selectedSeries=btn.dataset.series;selectedColor=`${selectedSeries}1`;drawPicker(modal)}));
  $$('[data-color]',modal).forEach(btn=>btn.addEventListener('click',()=>{selectedColor=btn.dataset.color;drawPicker(modal)}));
}
function toggleBead(id){const b=state.beads.find(x=>x.id===id);if(!b)return;b.status=b.status==='已采购'?'未采购':'已采购';b.doneAt=b.status==='已采购'?now():null;save();render()}
function deleteBead(id){if(!confirm('删除这条补豆记录？'))return;state.beads=state.beads.filter(x=>x.id!==id);save();render()}
function copyBeads(){
  const list=visibleBeads().filter(b=>b.status==='未采购');
  const text=list.length?list.map(b=>`${b.color} ${formatWeight(legacyWeightJin(b))}${b.remark?'（'+b.remark+'）':''}`).join('\n'):'暂无待采购补豆';
  navigator.clipboard?.writeText(text).catch(()=>{});alert(`待采购清单：\n\n${text}`);
}
function closeModal(){document.querySelector('.modal')?.remove()}
function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}

window.addEventListener('error',e=>console.error('DKD runtime error:',e.error||e.message));
window.addEventListener('load',()=>{if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js?v=7.1.0').catch(console.error);startTick();render()});
