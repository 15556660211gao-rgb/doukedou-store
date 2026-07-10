
const $=s=>document.querySelector(s);
const DATA_KEY='dkd_v6_data', SESSION_KEY='dkd_v6_session';
const SERIES_COUNTS={A:26,B:32,C:29,D:26,E:24,F:25,G:21,H:23,M:15};
const MARD_221=Object.entries(SERIES_COUNTS).flatMap(([s,n])=>Array.from({length:n},(_,i)=>s+(i+1)));
const DEFAULTS={
 users:[
  {u:'gaojiancheng',p:'123456',role:'boss',name:'老板'},
  {u:'beijing',p:'bj123456',role:'beijing',name:'北京店'},
  {u:'hangzhou',p:'hz123456',role:'hangzhou',name:'杭州店'}
 ],
 tables:[],orders:[],beads:[],
 settings:{sound:true,packages:[60,90,120,180],pricePerPackage:{60:39,90:59,120:79,180:99}}
};
let data=load(),session=JSON.parse(localStorage.getItem(SESSION_KEY)||'null');
let view='home',selectedStore=session?.role==='boss'?'beijing':session?.role||'beijing';
let tickTimer=null,audioReady=false,beepTimer=null,selectedSeries='A',selectedCode='A1';

function clone(v){return JSON.parse(JSON.stringify(v))}
function load(){
 const legacy=localStorage.getItem('dkd_v3_data')||localStorage.getItem('dkd_v2_data');
 const raw=localStorage.getItem(DATA_KEY)||legacy;
 const d=raw?JSON.parse(raw):clone(DEFAULTS);
 d.users=d.users||clone(DEFAULTS.users);d.tables=d.tables||[];d.orders=d.orders||[];d.beads=d.beads||[];d.settings={...DEFAULTS.settings,...(d.settings||{})};
 return d
}
function save(){localStorage.setItem(DATA_KEY,JSON.stringify(data))}
function storeName(s){return s==='beijing'?'北京店':'杭州店'}
function currentStore(){return session?.role==='boss'?selectedStore:session?.role}
function uuid(){return crypto.randomUUID?crypto.randomUUID():Date.now()+'_'+Math.random().toString(16).slice(2)}
function now(){return Date.now()}
function fmt(ms){const neg=ms<0;ms=Math.abs(ms);const sec=Math.floor(ms/1000),h=Math.floor(sec/3600),m=Math.floor(sec%3600/60),s=sec%60;return (neg?'超时 ':'')+(h?String(h).padStart(2,'0')+':':'')+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0')}
function tables(){return data.tables.filter(x=>x.store===currentStore())}
function orders(){return data.orders.filter(x=>x.store===currentStore())}
function beads(){return data.beads.filter(x=>x.store===currentStore())}

function login(u,p){const user=data.users.find(x=>x.u===u.trim()&&x.p===p);if(!user)return alert('账号或密码错误');session={u:user.u,role:user.role,name:user.name};localStorage.setItem(SESSION_KEY,JSON.stringify(session));selectedStore=user.role==='boss'?'beijing':user.role;render()}
function logout(){localStorage.removeItem(SESSION_KEY);session=null;render()}
function enableAudio(){audioReady=true;beep(1);alert('声音提醒已开启')}
function beep(n=1){if(!data.settings.sound||!audioReady)return;try{const ctx=new(window.AudioContext||window.webkitAudioContext)();for(let i=0;i<n;i++){const o=ctx.createOscillator(),g=ctx.createGain(),t=ctx.currentTime+i*.22;o.frequency.value=900;o.connect(g);g.connect(ctx.destination);g.gain.setValueAtTime(.001,t);g.gain.exponentialRampToValueAtTime(.24,t+.02);g.gain.exponentialRampToValueAtTime(.001,t+.17);o.start(t);o.stop(t+.18)}}catch(e){}}
function checkAlerts(){const ts=tables();const due=ts.some(t=>!t.paused&&now()>=t.endAt&&!t.ack);if(due&&!beepTimer){beep(4);beepTimer=setInterval(()=>beep(4),5000)}if(!due&&beepTimer){clearInterval(beepTimer);beepTimer=null}ts.forEach(t=>{if(t.paused)return;const mins=Math.ceil((t.endAt-now())/60000);[10,5,1].forEach(a=>{t.alerted=t.alerted||[];if(mins===a&&!t.alerted.includes(a)){t.alerted.push(a);beep(a===1?3:a===5?2:1);save()}})})}
function startTick(){clearInterval(tickTimer);tickTimer=setInterval(()=>{checkAlerts();if(session&&view==='home')render(false)},1000)}

function openTable(form){const duration=Number(form.duration.value);data.tables.push({id:uuid(),store:currentStore(),no:form.no.value.trim(),people:Number(form.people.value||1),duration,startAt:now(),endAt:now()+duration*60000,paused:false,remark:form.remark.value.trim(),alerted:[],ack:false});save();closeModal();render()}
function extendTable(id,min){const t=data.tables.find(x=>x.id===id);t.endAt+=min*60000;t.ack=false;t.alerted=[];save();render()}
function pauseTable(id){const t=data.tables.find(x=>x.id===id);if(!t.paused){t.paused=true;t.pauseAt=now()}else{t.endAt+=now()-t.pauseAt;t.paused=false;delete t.pauseAt}save();render()}
function checkout(id){const t=data.tables.find(x=>x.id===id);const price=data.settings.pricePerPackage[t.duration]||0;const overtime=Math.max(0,now()-t.endAt);const amount=price+Math.ceil(overtime/1800000)*20;data.orders.unshift({...t,orderId:uuid(),checkoutAt:now(),pay:'微信',amount,overtime});data.tables=data.tables.filter(x=>x.id!==id);save();render()}

function addBead(form){if(!MARD_221.includes(selectedCode))return alert('请选择有效的 MARD 221 色号');data.beads.unshift({id:uuid(),store:currentStore(),color:selectedCode,qty:Number(form.qty.value||1),unit:form.unit.value,status:'未采购',remark:form.remark.value.trim(),createdAt:now(),doneAt:null});save();closeModal();view='beads';render()}
function toggleBead(id){const b=data.beads.find(x=>x.id===id);b.status=b.status==='已采购'?'未采购':'已采购';b.doneAt=b.status==='已采购'?now():null;save();render()}
function delBead(id){if(confirm('删除这条补豆记录？')){data.beads=data.beads.filter(x=>x.id!==id);save();render()}}
function beadExport(){const list=beads().filter(b=>b.status==='未采购');const txt=list.length?list.map(b=>`${b.color} ${b.qty}${b.unit}${b.remark?'（'+b.remark+'）':''}`).join('\n'):'暂无未采购补豆';navigator.clipboard?.writeText(txt).catch(()=>{});alert('未采购清单：\n\n'+txt)}

function render(reset=true){
 if(!session)return renderLogin();
 if(reset)scrollTo(0,0);
 const st=currentStore(),ts=tables(),os=orders(),today=new Date().toDateString();
 const todayOrders=os.filter(o=>new Date(o.checkoutAt).toDateString()===today);
 const revenue=todayOrders.reduce((a,b)=>a+b.amount,0),people=todayOrders.reduce((a,b)=>a+b.people,0)+ts.reduce((a,b)=>a+b.people,0);
 $('#app').innerHTML=`<div class="page">
 <div class="header"><div class="brand"><img src="logo.png" alt="豆可兜"><div class="brand-text"><div class="brand-title">豆可兜</div><div class="brand-sub">${storeName(st)} · ${session.name}</div></div></div><button class="ghost" onclick="logout()">退出</button></div>
 ${session.role==='boss'?`<div class="store-switch"><button class="${selectedStore==='beijing'?'':'secondary'}" onclick="selectedStore='beijing';render()">北京店</button><button class="${selectedStore==='hangzhou'?'':'secondary'}" onclick="selectedStore='hangzhou';render()">杭州店</button></div>`:''}
 ${view==='home'?homeHtml(ts,revenue,todayOrders.length,people):view==='orders'?ordersHtml(os):view==='beads'?beadsHtml():settingsHtml()}
 <nav class="bottom"><button class="${view==='home'?'active':''}" onclick="view='home';render()">首页</button><button class="${view==='orders'?'active':''}" onclick="view='orders';render()">订单</button><button class="${view==='beads'?'active':''}" onclick="view='beads';render()">补豆</button><button class="${view==='settings'?'active':''}" onclick="view='settings';render()">设置</button></nav></div>`;
}
function renderLogin(){$('#app').innerHTML=`<div class="login"><div class="login-card"><img class="login-logo" src="logo.png" alt="豆可兜"><div class="login-title">豆可兜门店系统</div><div class="login-sub">请输入账号和密码</div><form onsubmit="event.preventDefault();login(this.u.value,this.p.value)"><div class="form-row"><input name="u" autocomplete="username" placeholder="账号" required></div><div class="form-row"><input name="p" type="password" autocomplete="current-password" placeholder="密码" required></div><button style="width:100%">登录</button></form></div></div>`}
function homeHtml(ts,revenue,count,people){return `<div class="stats"><div class="card stat"><span>今日营业额</span><b>¥${revenue}</b></div><div class="card stat"><span>营业中</span><b>${ts.length}桌</b></div><div class="card stat"><span>今日人数</span><b>${people}人</b></div></div><div class="actions"><button onclick="showOpenModal()">＋ 开台</button><button class="secondary" onclick="enableAudio()">开启声音</button></div>${ts.length?`<div class="tables">${ts.map(tableCard).join('')}</div>`:`<div class="card empty">暂无营业桌<br><br><button onclick="showOpenModal()">立即开台</button></div>`}`}
function tableCard(t){const left=t.paused?t.endAt-t.pauseAt:t.endAt-now(),cls=left<=0?'danger':left<=10*60000?'warn':'';const pill=left<=0?'<span class="pill red">已超时</span>':left<=10*60000?'<span class="pill yellow">快到期</span>':'<span class="pill green">正常</span>';return `<div class="table-card ${cls}"><div class="table-head"><div class="table-no">${t.no}</div>${pill}</div><div class="timer">${fmt(left)}</div><div class="meta"><div>${t.people}人</div><div>${t.duration}分钟</div><div>开始 ${new Date(t.startAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}</div><div>${t.remark||'无备注'}</div></div><div class="btn-grid"><button class="secondary" onclick="extendTable('${t.id}',30)">+30分钟</button><button class="secondary" onclick="pauseTable('${t.id}')">${t.paused?'继续':'暂停'}</button><button onclick="checkout('${t.id}')">结账</button></div></div>`}
function ordersHtml(os){return `<div class="section-title">订单记录</div>${os.length?os.map(o=>`<div class="order"><b>${o.no}</b> · ¥${o.amount}<div class="sub">${o.people}人｜${o.duration}分钟｜${new Date(o.checkoutAt).toLocaleString()}</div></div>`).join(''):`<div class="card empty">暂无订单</div>`}`}
function beadsHtml(){const list=beads(),todo=list.filter(b=>b.status==='未采购'),done=list.filter(b=>b.status==='已采购');return `<div class="header"><div><div class="section-title">补豆计划</div><div class="brand-sub">MARD 标准 221 色｜待采购 ${todo.length}｜已采购 ${done.length}</div></div><button onclick="showBeadModal()">＋ 添加</button></div><div class="actions"><button class="secondary" onclick="beadExport()">复制待采购清单</button></div>${list.length?list.map(b=>`<div class="bead-row ${b.status==='已采购'?'done':''}"><div><b style="font-size:20px">${b.color}</b> <span class="pill ${b.status==='已采购'?'green':'yellow'}">${b.status}</span><div class="sub">${b.qty}${b.unit}｜${new Date(b.createdAt).toLocaleString()}${b.remark?'｜'+b.remark:''}</div></div><div class="bead-actions"><button class="secondary" onclick="toggleBead('${b.id}')">${b.status==='已采购'?'改为待采购':'已采购'}</button><button class="ghost" onclick="delBead('${b.id}')">删除</button></div></div>`).join(''):`<div class="card empty">暂无补豆计划<br><br><button onclick="showBeadModal()">添加补豆</button></div>`}`}
function settingsHtml(){return `<div class="section-title">设置</div><div class="setting-card"><b>声音提醒</b><p class="hint">首次使用请在首页点“开启声音”。倒计时按真实结束时间计算，切后台后回来会自动校准。</p></div><div class="setting-card"><b>MARD 色库</b><p class="hint">当前已内置标准 221 色：A 26、B 32、C 29、D 26、E 24、F 25、G 21、H 23、M 15，共 221 色。</p></div>`}

function showOpenModal(){const pk=data.settings.packages;$('#app').insertAdjacentHTML('beforeend',`<div class="modal" onclick="if(event.target===this)closeModal()"><form class="sheet" onsubmit="event.preventDefault();openTable(this)"><div class="sheet-head"><h2>开台</h2><button type="button" class="ghost" onclick="closeModal()">关闭</button></div><div class="form-row"><input name="no" placeholder="桌号，如 A12 / 8号桌 / VIP1" required></div><div class="form-row"><input name="people" type="number" min="1" value="1" placeholder="人数"></div><div class="form-row"><select name="duration">${pk.map(p=>`<option value="${p}">${p} 分钟</option>`).join('')}</select></div><div class="form-row"><input name="remark" placeholder="备注，可不填"></div><button style="width:100%">开始倒计时</button></form></div>`)}
function showBeadModal(){selectedSeries='A';selectedCode='A1';$('#app').insertAdjacentHTML('beforeend',`<div class="modal" onclick="if(event.target===this)closeModal()"><form class="sheet" onsubmit="event.preventDefault();addBead(this)"><div class="sheet-head"><div><h2 style="margin:0">添加补豆</h2><div class="hint">直接选择 MARD 221 色号</div></div><button type="button" class="ghost" onclick="closeModal()">关闭</button></div><div id="beadPicker">${pickerHtml()}</div><div class="qty-grid"><div class="form-row"><input name="qty" type="number" min="1" step="1" value="1" placeholder="数量"></div><div class="form-row"><select name="unit"><option value="半斤">半斤</option><option value="斤">一斤</option></select></div></div><div class="form-row"><input name="remark" placeholder="备注，可不填"></div><button style="width:100%">加入待采购</button></form></div>`)}
function pickerHtml(){const codes=MARD_221.filter(x=>x.startsWith(selectedSeries));return `<div class="series-tabs">${Object.keys(SERIES_COUNTS).map(s=>`<button type="button" class="${s===selectedSeries?'active':''}" onclick="selectSeries('${s}')">${s}</button>`).join('')}</div><div class="selection-bar"><span>已选色号</span><span class="selection-code">${selectedCode}</span></div><div class="color-grid">${codes.map(c=>`<button type="button" class="color-btn ${c===selectedCode?'selected':''}" onclick="selectCode('${c}')">${c}</button>`).join('')}</div>`}
function selectSeries(s){selectedSeries=s;selectedCode=s+'1';$('#beadPicker').innerHTML=pickerHtml()}
function selectCode(c){selectedCode=c;$('#beadPicker').innerHTML=pickerHtml()}
function closeModal(){document.querySelector('.modal')?.remove()}

window.addEventListener('load',()=>{if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});startTick();render()});
