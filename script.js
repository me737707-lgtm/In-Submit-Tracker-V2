/* ================================================
   SCRIPT.JS  v2.2  —  Full Feature Engine
   Depends on config.js loaded first
   ================================================ */

const S = {
  raw:{}, filtered:{}, openTeams:new Set(),
  search:'', lastHash:'', firstLoad:true, loading:false,
  user:null, users:[], loggedIn:false,
  _cache:{}, _cacheTs:{}, _timer:null
};
const D = {};

/* ── Client cache ───────────────────────────────── */
function cGet(k){
  const ts=S._cacheTs[k];
  if(ts&&Date.now()-ts<CONFIG.CLIENT_CACHE_TTL) return S._cache[k];
  return null;
}
function cSet(k,v){ S._cache[k]=v; S._cacheTs[k]=Date.now(); }
function cDel(prefix){
  Object.keys(S._cache).forEach(k=>{
    if(!prefix||k.startsWith(prefix)){ delete S._cache[k]; delete S._cacheTs[k]; }
  });
}

/* ── API ──────────────────────────────────────── */
async function api(params,cacheKey){
  if(cacheKey){ const h=cGet(cacheKey); if(h) return h; }
  const url=CONFIG.API_URL+'?'+new URLSearchParams(params);
  const ctrl=new AbortController();
  const tid=setTimeout(()=>ctrl.abort(),CONFIG.REQUEST_TIMEOUT);
  try{
    const res=await fetch(url,{signal:ctrl.signal,mode:'cors'});
    clearTimeout(tid);
    if(!res.ok) throw new Error('HTTP '+res.status);
    const data=await res.json();
    if(cacheKey) cSet(cacheKey,data);
    return data;
  }catch(e){ clearTimeout(tid); throw e; }
}

/* ================================================
   LOGIN
   ================================================ */
async function loadUsers(){
  try{
    const d=await api({action:'users'},'users_list');
    if(d.success&&d.users?.length) S.users=d.users;
  }catch(e){ console.warn('Users load failed:',e.message); }
}

function handleLogin(e){
  e.preventDefault();
  const uname=D.username.value.trim(), pass=D.password.value.trim();
  setLoginState('loading');
  if(!S.users.length){ setLoginState('error','Server unavailable — check connection'); return; }
  const found=S.users.find(u=>u.username.toLowerCase()===uname.toLowerCase()&&u.password===pass);
  if(found){
    S.user=found; S.loggedIn=true;
    D.loginOverlay.style.display='none';
    renderUserChip(found);
    initDashboard();
  }else{
    setLoginState('error','Invalid username or password');
  }
}
function setLoginState(state,msg){
  D.loginBtn.style.display    =state==='loading'?'none':'flex';
  D.loginSpinner.style.display=state==='loading'?'flex':'none';
  D.loginError.style.display  =state==='error'  ?'flex':'none';
  if(msg) D.loginErrorMsg.textContent=msg;
}
function renderUserChip(user){
  const rm={supervisors:'Supervisor',shiftSupervisor:'Shift Supervisor',Qc:'QC'};
  const cm={supervisors:'chip-sup',shiftSupervisor:'chip-shift',Qc:'chip-qc'};
  D.userAvatar.textContent    =user.username[0].toUpperCase();
  D.userNameLabel.textContent =user.username;
  D.userRoleLabel.textContent =rm[user.role]||user.role;
  D.userRoleLabel.className   ='user-role-badge '+(cm[user.role]||'');
  D.userChip.style.display    ='flex';
}
function handleLogout(){
  S.user=null; S.loggedIn=false; S.raw={}; S.filtered={};
  S.firstLoad=true; cDel();
  if(S._timer){ clearInterval(S._timer); S._timer=null; }
  D.userChip.style.display='none';
  D.loginOverlay.style.display='flex';
  D.loginBtn.style.display='flex';
  D.loginSpinner.style.display='none';
  D.loginError.style.display='none';
  D.username.value=''; D.password.value='';
  D.ssView.style.display='none';
  D.mainContent.innerHTML=''; D.mainContent.style.display='block';
}

/* ================================================
   INIT
   ================================================ */
function initDashboard(){
  setStatus('loading');
  D.datePicker.value=new Date().toISOString().split('T')[0];
  const role=S.user?.role;
  if(role===CONFIG.ROLES.SHIFT_SUPERVISOR){
    D.mainContent.style.display='none';
    D.ssView.style.display='block';
    fetchSS(true);
    S._timer=setInterval(()=>fetchSS(false),CONFIG.REFRESH_INTERVAL);
  }else{
    D.mainContent.style.display='block';
    D.ssView.style.display='none';
    fetchMain(true);
    S._timer=setInterval(()=>fetchMain(false),CONFIG.REFRESH_INTERVAL);
  }
  document.addEventListener('keydown',ev=>{
    if((ev.ctrlKey||ev.metaKey)&&ev.key==='k'){ev.preventDefault();D.searchInput.focus();}
    if(ev.key==='Escape') closePanel();
  });
}
function setStatus(s){
  D.statusPill.className='status-pill '+s;
  D.statusLabel.textContent={live:'Live',error:'Error',loading:'Connecting'}[s]||s;
}

/* ================================================
   MAIN DASHBOARD FETCH
   ================================================ */
async function fetchMain(showLoader,manual){
  if(S.loading&&!manual) return;
  const date=fmtDate(D.datePicker.value), key='dash_'+date;
  try{
    S.loading=true;
    if(showLoader) renderLoader(D.mainContent);
    const json=await api({date},key);
    const data=json.data||{};
    if(!Object.keys(data).length){
      renderEmpty(D.mainContent,'No data for '+date+'. Check date or wait for sync.');
      setStatus('error'); return;
    }
    S.raw=data; S.filtered=filterForUser(data);
    setStatus('live');
    const hash=makeHash(S.filtered);
    if(hash!==S.lastHash||showLoader||manual){
      S.lastHash=hash; rebuildFilters(); renderDashboard();
      if(!showLoader&&!manual) showToast();
    }
    S.firstLoad=false;
  }catch(e){ setStatus('error'); renderError(D.mainContent,e); }
  finally{ S.loading=false; }
}

function manualRefresh(){
  cDel('dash_'); cDel('supbr_'); cDel('ss_');
  if(S.user?.role===CONFIG.ROLES.SHIFT_SUPERVISOR) fetchSS(true);
  else fetchMain(true,true);
}

function filterForUser(data){
  const u=S.user; if(!u) return data;
  if(u.role===CONFIG.ROLES.SUPERVISOR) return data;
  if(u.role===CONFIG.ROLES.QC||u.permission==='only'){
    const out={};
    for(const[shift,locs]of Object.entries(data))
      for(const[loc,teams]of Object.entries(locs))
        for(const[tn,td]of Object.entries(teams)){
          const base=tn.replace(/\s*\([A-Z]{1,3}\)\s*$/,'').trim();
          if(base===u.username||tn===u.username){
            out[shift]=out[shift]||{}; out[shift][loc]=out[shift][loc]||{};
            out[shift][loc][tn]=td;
          }
        }
    return out;
  }
  return data;
}

/* ================================================
   SHIFT SUPERVISOR VIEW
   ================================================ */
async function fetchSS(full){
  const shift=S.user?.permission;
  const date=fmtDate(D.datePicker.value);
  const key='ss_'+shift+'_'+date;
  if(full) D.ssView.innerHTML='<div class="ss-skeleton"><div class="spin-ring"></div><p>Loading shift data…</p></div>';
  try{
    const d=await api({action:'shiftSupervisor',shift,date},key);
    if(!d.success) throw new Error(d.error||'Failed');
    renderSSView(d);
    setStatus('live');
  }catch(e){
    D.ssView.innerHTML=`<div class="err-simple"><i class="fas fa-triangle-exclamation"></i> ${e.message}</div>`;
    setStatus('error');
  }
}

function renderSSView(d){
  const shift=d.shift, label=CONFIG.SHIFT_LABELS[shift]||shift;
  const pct=d.totalActive>0?Math.round((d.totalSubmitted/d.totalActive)*100):0;
  const t=d.tasks||{};

  /* ── Prepare panel contents ── */

  /* Attendance room table for "Active Users" panel */
  const attRoomHTML=buildAttendanceRoomTable(d.roomDetails||{});

  /* Training breakdown for "Training" panel */
  const trainingHTML=d.totalTraining>0
    ?Object.entries(d.trainingByLevel||{}).map(([l,c])=>`
      <div class="br-row">
        <span class="br-label"><i class="fas fa-graduation-cap"></i>${l}</span>
        <span class="br-pill pill-yellow">${c} trainee${c>1?'s':''}</span>
      </div>`).join('')
    :'<p class="br-empty">No trainees today</p>';

  /* Task panel */
  const taskPanelHTML=buildTaskPanel(t,d.roomDetails||{});

  /* ── KPI grid ── */
  const kpiCards=`
    <!-- Active Users -->
    <div class="kpi-card kpi-clickable" onclick='openPanel("Attendance Breakdown","${label} Shift",${JSON.stringify(attRoomHTML)})'>
      <div class="kpi-icon-wrap kpi-blue"><i class="fas fa-users"></i></div>
      <div class="kpi-body">
        <div class="kpi-label">Total Active</div>
        <div class="kpi-val kpi-val-blue">${d.totalActive}</div>
        <div class="kpi-sub">Present & productive</div>
      </div>
      <div class="kpi-arrow"><i class="fas fa-chevron-right"></i></div>
    </div>

    <!-- Submitted -->
    <div class="kpi-card kpi-clickable" onclick='openPanel("Task Breakdown","${label} Shift",${JSON.stringify(taskPanelHTML)})'>
      <div class="kpi-icon-wrap kpi-green"><i class="fas fa-circle-check"></i></div>
      <div class="kpi-body">
        <div class="kpi-label">Submitted</div>
        <div class="kpi-val kpi-val-green">${d.totalSubmitted}</div>
        <div class="kpi-sub">${t.total||0} tasks · ${t.uniqueUsers||0} labelers</div>
      </div>
      <div class="kpi-arrow"><i class="fas fa-chevron-right"></i></div>
    </div>

    <!-- Pending -->
    <div class="kpi-card">
      <div class="kpi-icon-wrap kpi-orange"><i class="fas fa-hourglass-half"></i></div>
      <div class="kpi-body">
        <div class="kpi-label">Pending</div>
        <div class="kpi-val kpi-val-orange">${d.totalPending}</div>
        <div class="kpi-sub">Yet to submit</div>
      </div>
    </div>

    <!-- Ring -->
    <div class="kpi-card kpi-ring">${ringHTML(pct)}</div>

    <!-- Absent -->
    <div class="kpi-card">
      <div class="kpi-icon-wrap kpi-red"><i class="fas fa-user-xmark"></i></div>
      <div class="kpi-body">
        <div class="kpi-label">Absent</div>
        <div class="kpi-val kpi-val-red">${d.totalAbsent}</div>
        <div class="kpi-sub">Status: 0</div>
      </div>
    </div>

    <!-- Empty -->
    <div class="kpi-card">
      <div class="kpi-icon-wrap kpi-gray"><i class="fas fa-display-slash"></i></div>
      <div class="kpi-body">
        <div class="kpi-label">Empty Seats</div>
        <div class="kpi-val kpi-val-gray">${d.totalEmpty}</div>
        <div class="kpi-sub">Status: E</div>
      </div>
    </div>

    ${d.totalTraining>0?`
    <!-- Training -->
    <div class="kpi-card kpi-clickable" onclick='openPanel("Training Breakdown","${label} Shift",${JSON.stringify(trainingHTML)})'>
      <div class="kpi-icon-wrap kpi-yellow"><i class="fas fa-graduation-cap"></i></div>
      <div class="kpi-body">
        <div class="kpi-label">In Training</div>
        <div class="kpi-val kpi-val-yellow">${d.totalTraining}</div>
        <div class="kpi-sub">${Object.entries(d.trainingByLevel||{}).map(([l,c])=>l+': '+c).join(' · ')}</div>
      </div>
      <div class="kpi-arrow"><i class="fas fa-chevron-right"></i></div>
    </div>`:''}
  `;

  /* ── Inline task summary cards ── */
  const taskSummary=`
  <div class="ss-section-title"><i class="fas fa-layer-group"></i> Task Summary</div>
  <div class="task-summary-grid">
    <div class="ts-card ts-lidar">
      <div class="ts-modality">LIDAR</div>
      <div class="ts-stats">
        <div class="ts-stat">
          <span class="ts-stat-label">First Pass</span>
          <span class="ts-stat-val">${t.LIDAR?.FP||0}</span>
        </div>
        <div class="ts-divider"></div>
        <div class="ts-stat">
          <span class="ts-stat-label">QA</span>
          <span class="ts-stat-val">${t.LIDAR?.QA||0}</span>
        </div>
        <div class="ts-divider"></div>
        <div class="ts-stat ts-total">
          <span class="ts-stat-label">Total</span>
          <span class="ts-stat-val ts-big">${(t.LIDAR?.FP||0)+(t.LIDAR?.QA||0)}</span>
        </div>
      </div>
    </div>
    <div class="ts-card ts-laneline">
      <div class="ts-modality">Lane Line</div>
      <div class="ts-stats">
        <div class="ts-stat">
          <span class="ts-stat-label">First Pass</span>
          <span class="ts-stat-val">${t.LaneLine?.FP||0}</span>
        </div>
        <div class="ts-divider"></div>
        <div class="ts-stat">
          <span class="ts-stat-label">QA</span>
          <span class="ts-stat-val">${t.LaneLine?.QA||0}</span>
        </div>
        <div class="ts-divider"></div>
        <div class="ts-stat ts-total">
          <span class="ts-stat-label">Total</span>
          <span class="ts-stat-val ts-big">${(t.LaneLine?.FP||0)+(t.LaneLine?.QA||0)}</span>
        </div>
      </div>
    </div>
    ${Object.keys(t.other||{}).length?`
    <div class="ts-card ts-other">
      <div class="ts-modality">Other</div>
      <div class="ts-stats">
        ${Object.entries(t.other).map(([k,v])=>`
        <div class="ts-stat"><span class="ts-stat-label">${k}</span><span class="ts-stat-val">${v}</span></div>`).join('')}
      </div>
    </div>`:''}
  </div>`;

  /* ── Room detail table ── */
  const roomTable=buildRoomDetailTable(d.roomDetails||{},d.shift);

  D.ssView.innerHTML=`
  <div class="ss-wrap">
    <div class="ss-header">
      <div>
        <div class="ss-shift-tag"><i class="fas fa-clock"></i>${label} Shift</div>
        <p class="ss-date-label">${D.datePicker.value}</p>
      </div>
      <input type="date" value="${D.datePicker.value}" class="ctrl-date"
             onchange="D.datePicker.value=this.value;cDel('ss_');fetchSS(true)">
    </div>
    <div class="ss-section-title"><i class="fas fa-chart-bar"></i> Overview</div>
    <div class="kpi-grid">${kpiCards}</div>
    ${taskSummary}
    ${roomTable}
  </div>`;
}

/* Room detail table (inline in SS view) */
function buildRoomDetailTable(rooms,shift){
  const entries=Object.entries(rooms);
  if(!entries.length) return '';
  const rows=entries.map(([room,r])=>{
    const totalAtt=r.active+r.absent+r.empty+r.training;
    const pct=r.active>0?Math.round((r.submitted/r.active)*100):0;
    const trainStr=Object.keys(r.trainingByLevel||{}).length
      ?Object.entries(r.trainingByLevel).map(([l,c])=>`<span class="mini-badge">${l}:${c}</span>`).join('')
      :'—';
    return `
    <tr class="rdt-row">
      <td class="rdt-room">${room}</td>
      <td class="rdt-num c-blue">${totalAtt}</td>
      <td class="rdt-num c-green">${r.active}</td>
      <td class="rdt-num c-red">${r.absent}</td>
      <td class="rdt-num c-gray">${r.empty}</td>
      <td class="rdt-training">${r.training>0?trainStr:'—'}</td>
      <td class="rdt-num c-emerald">${r.submitted}</td>
      <td class="rdt-num c-orange">${r.pending}</td>
      <td class="rdt-tasks">
        <span class="task-mini lidar-mini">L:${r.tasks.LIDAR.FP+r.tasks.LIDAR.QA}</span>
        <span class="task-mini lane-mini">LL:${r.tasks.LaneLine.FP+r.tasks.LaneLine.QA}</span>
      </td>
      <td>
        <div class="mini-ring-wrap">
          <div class="mini-bar"><div class="mini-fill" style="width:${pct}%"></div></div>
          <span class="mini-pct">${pct}%</span>
        </div>
      </td>
    </tr>`;
  }).join('');

  return `
  <div class="ss-section-title" style="margin-top:28px"><i class="fas fa-table-cells-large"></i> Room Breakdown</div>
  <div class="room-table-wrap">
    <table class="room-detail-table">
      <thead>
        <tr>
          <th>Room</th>
          <th title="Total in attendance sheet">Total</th>
          <th title="P / TP / PT">Active</th>
          <th title="Status: 0">Absent</th>
          <th title="Status: E">Empty</th>
          <th>Training</th>
          <th>Submitted</th>
          <th>Pending</th>
          <th>Tasks</th>
          <th>Progress</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

/* Attendance room panel content */
function buildAttendanceRoomTable(rooms){
  const entries=Object.entries(rooms);
  if(!entries.length) return '<p class="br-empty">No room data available.</p>';
  return entries.map(([room,r])=>{
    const trainStr=Object.keys(r.trainingByLevel||{}).length
      ?Object.entries(r.trainingByLevel).map(([l,c])=>`<span class="br-pill pill-yellow">${l}: ${c}</span>`).join(' ')
      :'';
    return `
    <div class="att-room-card">
      <div class="arc-name"><i class="fas fa-door-open"></i>${room}</div>
      <div class="arc-stats">
        <div class="arc-stat"><span class="arc-label">Active</span><span class="arc-val c-green">${r.active}</span></div>
        <div class="arc-stat"><span class="arc-label">Absent</span><span class="arc-val c-red">${r.absent}</span></div>
        <div class="arc-stat"><span class="arc-label">Empty</span><span class="arc-val c-gray">${r.empty}</span></div>
        ${r.training>0?`<div class="arc-stat"><span class="arc-label">Training</span><span class="arc-val c-yellow">${r.training}</span></div>`:''}
        <div class="arc-stat"><span class="arc-label">Done</span><span class="arc-val c-emerald">${r.submitted}</span></div>
        <div class="arc-stat"><span class="arc-label">Pending</span><span class="arc-val c-orange">${r.pending}</span></div>
      </div>
      ${trainStr?`<div class="arc-training">${trainStr}</div>`:''}
    </div>`;
  }).join('');
}

/* Task panel with room-level task breakdown */
function buildTaskPanel(t,rooms){
  const roomTaskRows=Object.entries(rooms).filter(([,r])=>r.tasks.total>0).map(([room,r])=>`
    <div class="br-row">
      <span class="br-label"><i class="fas fa-door-open"></i>${room}</span>
      <span class="br-pill pill-blue">L FP: ${r.tasks.LIDAR.FP}</span>
      <span class="br-pill pill-green">L QA: ${r.tasks.LIDAR.QA}</span>
      <span class="br-pill pill-blue">LL FP: ${r.tasks.LaneLine.FP}</span>
      <span class="br-pill pill-green">LL QA: ${r.tasks.LaneLine.QA}</span>
      <span class="br-pill pill-yellow">${r.tasks.total} total</span>
    </div>`).join('');

  return `
    <div class="br-summary-card">
      <div class="br-summary-row"><span class="brs-label">Total Tasks</span><span class="brs-val">${t.total||0}</span></div>
      <div class="br-summary-row"><span class="brs-label">Unique Labelers</span><span class="brs-val">${t.uniqueUsers||0}</span></div>
    </div>
    <div class="br-task-grid" style="margin-top:16px">
      <div class="br-task-card lidar">
        <div class="brtc-label">LIDAR</div>
        <div class="brtc-row"><span>First Pass</span><strong>${t.LIDAR?.FP||0}</strong></div>
        <div class="brtc-row"><span>QA</span><strong>${t.LIDAR?.QA||0}</strong></div>
        <div class="brtc-total">${(t.LIDAR?.FP||0)+(t.LIDAR?.QA||0)} total</div>
      </div>
      <div class="br-task-card laneline">
        <div class="brtc-label">Lane Line</div>
        <div class="brtc-row"><span>First Pass</span><strong>${t.LaneLine?.FP||0}</strong></div>
        <div class="brtc-row"><span>QA</span><strong>${t.LaneLine?.QA||0}</strong></div>
        <div class="brtc-total">${(t.LaneLine?.FP||0)+(t.LaneLine?.QA||0)} total</div>
      </div>
    </div>
    ${roomTaskRows?`<div class="br-section" style="margin-top:20px">Tasks by Room</div>${roomTaskRows}`:''}
  `;
}

/* Ring SVG */
function ringHTML(pct){
  const r=44, circ=(2*Math.PI*r).toFixed(1), off=(circ-(pct/100)*circ).toFixed(1);
  return `<div class="ring-box">
    <svg class="ring-svg" viewBox="0 0 100 100">
      <circle class="ring-track" cx="50" cy="50" r="${r}"/>
      <circle class="ring-fill" cx="50" cy="50" r="${r}"
        style="stroke-dasharray:${circ};stroke-dashoffset:${off}"/>
    </svg>
    <div class="ring-center"><span class="ring-pct">${pct}%</span><span class="ring-lbl">Done</span></div>
  </div>`;
}

/* ================================================
   SIDE PANEL
   ================================================ */
function openPanel(title,sub,htmlContent){
  D.panelTitle.textContent=title;
  D.panelSub.textContent=sub||'';
  D.panelContent.innerHTML=typeof htmlContent==='string'
    ?htmlContent:'<div class="panel-spin"><div class="spin-ring"></div></div>';
  D.sidePanel.classList.add('open');
  D.panelMask.classList.add('open');
  document.body.style.overflow='hidden';
}
function closePanel(){
  D.sidePanel.classList.remove('open');
  D.panelMask.classList.remove('open');
  document.body.style.overflow='';
}

/* Supervisor location panel (with QC breakdown) */
async function openSupervisorPanel(locName){
  openPanel('Location Breakdown',locName,null);
  const date=fmtDate(D.datePicker.value);
  try{
    const d=await api({action:'supervisorBreakdown',date},'supbr_'+date);
    if(!d.success) throw new Error(d.error);
    const loc=(d.locations||{})[locName];
    if(!loc){ D.panelContent.innerHTML='<p class="br-empty">No data for this location.</p>'; return; }
    const t=loc.tasks||{};

    /* Team rows */
    const teamRows=Object.entries(loc.teams||{}).map(([tn,tm])=>`
      <div class="br-row">
        <span class="br-label"><i class="fas fa-user-tie"></i>${tn}</span>
        <span class="br-pill pill-green">${tm.submitted} done</span>
        <span class="br-pill pill-red">${tm.pending} pending</span>
      </div>`).join('');

    /* QTC task breakdown rows */
    const qtcRows=Object.entries(loc.qtcBreakdown||{})
      .sort((a,b)=>b[1].tasks-a[1].tasks)
      .map(([qn,q])=>`
      <div class="qtc-br-card">
        <div class="qtc-name"><i class="fas fa-user-check"></i>${qn}</div>
        <div class="qtc-stats">
          <div class="qtc-total">${q.tasks} tasks</div>
          <div class="qtc-detail">
            <span class="qtc-chip lidar-chip">L FP: ${q.LIDAR.FP}</span>
            <span class="qtc-chip lidar-chip">L QA: ${q.LIDAR.QA}</span>
            <span class="qtc-chip lane-chip">LL FP: ${q.LaneLine.FP}</span>
            <span class="qtc-chip lane-chip">LL QA: ${q.LaneLine.QA}</span>
          </div>
        </div>
      </div>`).join('');

    D.panelContent.innerHTML=`
      <div class="br-summary-card">
        <div class="br-summary-row"><span class="brs-label">Total Active</span><span class="brs-val">${loc.total}</span></div>
        <div class="br-summary-row"><span class="brs-label">Submitted</span><span class="brs-val c-green">${loc.submitted}</span></div>
        <div class="br-summary-row"><span class="brs-label">Pending</span><span class="brs-val c-red">${loc.pending}</span></div>
        <div class="br-summary-row"><span class="brs-label">Total Tasks</span><span class="brs-val">${t.total||0}</span></div>
      </div>
      <div class="br-task-grid" style="margin-top:16px">
        <div class="br-task-card lidar">
          <div class="brtc-label">LIDAR</div>
          <div class="brtc-row"><span>First Pass</span><strong>${t.LIDAR?.FP||0}</strong></div>
          <div class="brtc-row"><span>QA</span><strong>${t.LIDAR?.QA||0}</strong></div>
          <div class="brtc-total">${(t.LIDAR?.FP||0)+(t.LIDAR?.QA||0)} total</div>
        </div>
        <div class="br-task-card laneline">
          <div class="brtc-label">Lane Line</div>
          <div class="brtc-row"><span>First Pass</span><strong>${t.LaneLine?.FP||0}</strong></div>
          <div class="brtc-row"><span>QA</span><strong>${t.LaneLine?.QA||0}</strong></div>
          <div class="brtc-total">${(t.LaneLine?.FP||0)+(t.LaneLine?.QA||0)} total</div>
        </div>
      </div>
      <div class="br-section" style="margin-top:20px">Teams</div>
      ${teamRows||'<p class="br-empty">No team data.</p>'}
      ${qtcRows?`<div class="br-section" style="margin-top:20px">QC Task Breakdown</div>${qtcRows}`:''}
    `;
  }catch(e){ D.panelContent.innerHTML=`<div class="err-simple">${e.message}</div>`; }
}

/* QC panel */
async function openQcPanel(qtcName){
  openPanel('Task Breakdown',qtcName,null);
  const date=fmtDate(D.datePicker.value);
  const key='qcbr_'+qtcName.replace(/\s+/g,'_')+'_'+date;
  try{
    const d=await api({action:'qcBreakdown',qtcName,date},key);
    if(!d.success) throw new Error(d.error);
    D.panelContent.innerHTML=`
      <div class="br-summary-card">
        <div class="br-summary-row"><span class="brs-label">Total Tasks</span><span class="brs-val">${d.totalTasks}</span></div>
        <div class="br-summary-row"><span class="brs-label">Unique Labelers</span><span class="brs-val">${d.uniqueLabelers}</span></div>
      </div>
      <div class="br-task-grid" style="margin-top:16px">
        <div class="br-task-card lidar">
          <div class="brtc-label">LIDAR</div>
          <div class="brtc-row"><span>First Pass</span><strong>${d.LIDAR?.FP||0}</strong></div>
          <div class="brtc-row"><span>QA</span><strong>${d.LIDAR?.QA||0}</strong></div>
          <div class="brtc-total">${(d.LIDAR?.FP||0)+(d.LIDAR?.QA||0)} total</div>
        </div>
        <div class="br-task-card laneline">
          <div class="brtc-label">Lane Line</div>
          <div class="brtc-row"><span>First Pass</span><strong>${d.LaneLine?.FP||0}</strong></div>
          <div class="brtc-row"><span>QA</span><strong>${d.LaneLine?.QA||0}</strong></div>
          <div class="brtc-total">${(d.LaneLine?.FP||0)+(d.LaneLine?.QA||0)} total</div>
        </div>
      </div>
      ${Object.keys(d.other||{}).length?`
        <div class="br-section" style="margin-top:16px">Other</div>
        ${Object.entries(d.other).map(([k,v])=>`<div class="br-row"><span class="br-label">${k}</span><span class="br-pill pill-yellow">${v}</span></div>`).join('')}
      `:''}`;
  }catch(e){ D.panelContent.innerHTML=`<div class="err-simple">${e.message}</div>`; }
}

/* ================================================
   FILTERS & SEARCH
   ================================================ */
function rebuildFilters(){
  const shifts=new Set(), locs=new Set();
  const data=S.filtered;
  Object.keys(data).forEach(s=>{ shifts.add(s); Object.keys(data[s]).forEach(l=>locs.add(l)); });
  Object.keys(CONFIG.LOCATION_GROUPS).forEach(g=>locs.add(g));
  const curS=D.shiftFilter.value, curL=D.locFilter.value;
  D.shiftFilter.innerHTML='<option value="all">All Shifts</option>';
  Array.from(shifts).sort().forEach(s=>{
    const o=document.createElement('option');
    o.value=s; o.textContent=(CONFIG.SHIFT_LABELS[s]||s)+' Shift';
    if(s===curS) o.selected=true;
    D.shiftFilter.appendChild(o);
  });
  D.locFilter.innerHTML='<option value="all">All Locations</option>';
  Object.keys(CONFIG.LOCATION_GROUPS).sort().forEach(g=>{
    const o=document.createElement('option');
    o.value=g; o.textContent='📍 '+g; o.style.fontWeight='700';
    if(g===curL) o.selected=true;
    D.locFilter.appendChild(o);
  });
  const grouped=new Set(Object.values(CONFIG.LOCATION_GROUPS).flat());
  Array.from(locs).filter(l=>!grouped.has(l)&&!CONFIG.LOCATION_GROUPS[l]).sort().forEach(l=>{
    const o=document.createElement('option');
    o.value=l; o.textContent=l;
    if(l===curL) o.selected=true;
    D.locFilter.appendChild(o);
  });
}

function handleSearch(){ S.search=D.searchInput.value.toLowerCase().trim(); renderDashboard(); }
function matches(email,pc){
  if(!S.search) return true;
  return email.toLowerCase().includes(S.search)||String(pc).toLowerCase().includes(S.search);
}

/* ================================================
   RENDER DASHBOARD
   ================================================ */
function renderDashboard(){
  const selShift=D.shiftFilter.value, selLoc=D.locFilter.value;
  const data=S.filtered;
  const isSup=S.user?.role===CONFIG.ROLES.SUPERVISOR;
  const isQC =S.user?.role===CONFIG.ROLES.QC;
  D.mainContent.innerHTML='';
  if(!Object.keys(data).length){
    renderEmpty(D.mainContent, isQC?'No data for your team today.':'No data available.'); return;
  }
  let animIdx=0;
  for(const[shift,locs]of Object.entries(data)){
    if(selShift!=='all'&&shift!==selShift) continue;
    const wrapper=document.createElement('div');
    wrapper.className='shift-block';
    wrapper.innerHTML=`<div class="shift-badge"><i class="fas fa-clock"></i>${CONFIG.SHIFT_LABELS[shift]||shift} Shift</div>`;
    const rendered=new Set();
    Object.keys(CONFIG.LOCATION_GROUPS).forEach(grp=>{
      if(selLoc!=='all'&&selLoc!==grp) return;
      const members=(CONFIG.LOCATION_GROUPS[grp]||[]).filter(r=>locs[r]);
      if(!members.length) return;
      wrapper.appendChild(buildGroupSection(grp,shift,locs,members,animIdx++,isSup,isQC));
      members.forEach(m=>rendered.add(m));
    });
    for(const[loc,teams]of Object.entries(locs)){
      if(selLoc!=='all'&&selLoc!==loc) continue;
      if(rendered.has(loc)) continue;
      wrapper.appendChild(buildLocSection(loc,teams,shift,animIdx++,isSup,isQC));
    }
    D.mainContent.appendChild(wrapper);
  }
}

function buildGroupSection(grpName,shift,allLocs,members,idx,isSup,isQC){
  let totSub=0,totPend=0;
  const roomData={};
  members.forEach(r=>{ roomData[r]=allLocs[r];
    Object.values(allLocs[r]).forEach(t=>{ totSub+=t.submitted.length; totPend+=t.notSubmitted.length; }); });
  const total=totSub+totPend, pct=total?Math.round((totSub/total)*100):0;
  const sec=document.createElement('div');
  sec.className='loc-section'; sec.style.animationDelay=(idx*CONFIG.ANIMATION_STAGGER_DELAY)+'ms';
  sec.innerHTML=`
    <div class="loc-header">
      <div class="loc-icon-wrap"><i class="fas fa-building"></i></div>
      <div class="loc-title-wrap">
        <h2 class="loc-name">${grpName}</h2>
        <span class="loc-sub">${members.length} rooms</span>
      </div>
    </div>
    ${heroStats(totSub,totPend,total,pct)}`;
  const roomsWrap=document.createElement('div');
  roomsWrap.className='rooms-wrap';
  members.forEach((r,i)=>{
    const sub=document.createElement('div'); sub.className='room-block';
    sub.innerHTML=`<div class="room-header${isSup?' clickable':''}" ${isSup?`onclick="openSupervisorPanel('${esc(r)}')"`:''}>
      <i class="fas fa-door-open"></i><span>${r}</span>
      ${isSup?'<i class="fas fa-chart-bar room-bd-ic"></i>':''}
    </div>`;
    sub.appendChild(buildTeamsGrid(roomData[r],shift,r,i,isSup,isQC));
    roomsWrap.appendChild(sub);
  });
  sec.appendChild(roomsWrap);
  return sec;
}

function buildLocSection(loc,teams,shift,idx,isSup,isQC){
  let s=0,n=0;
  Object.values(teams).forEach(t=>{s+=t.submitted.length;n+=t.notSubmitted.length;});
  const total=s+n, pct=total?Math.round((s/total)*100):0;
  const sec=document.createElement('div');
  sec.className='loc-section'; sec.style.animationDelay=(idx*CONFIG.ANIMATION_STAGGER_DELAY)+'ms';
  sec.innerHTML=`
    <div class="loc-header${isSup?' clickable':''}" ${isSup?`onclick="openSupervisorPanel('${esc(loc)}')"`:''}>
      <div class="loc-icon-wrap"><i class="fas fa-map-marker-alt"></i></div>
      <div class="loc-title-wrap">
        <h2 class="loc-name">${loc}</h2>
        ${isSup?'<span class="loc-bd-hint"><i class="fas fa-chart-bar"></i> Breakdown</span>':''}
      </div>
    </div>
    ${heroStats(s,n,total,pct)}`;
  sec.appendChild(buildTeamsGrid(teams,shift,loc,0,isSup,isQC));
  return sec;
}

function heroStats(sub,pend,total,pct){
  const r=40,circ=(2*Math.PI*r).toFixed(1),off=(circ-(pct/100)*circ).toFixed(1);
  return `
  <div class="hero-row">
    <div class="hero-card hc-green">
      <div class="hc-icon"><i class="fas fa-circle-check"></i></div>
      <div class="hc-body"><div class="hc-label">Submitted</div><div class="hc-val">${sub}</div></div>
    </div>
    <div class="hero-card hc-red">
      <div class="hc-icon"><i class="fas fa-circle-exclamation"></i></div>
      <div class="hc-body"><div class="hc-label">Pending</div><div class="hc-val">${pend}</div></div>
    </div>
    <div class="hero-card hc-blue">
      <div class="hc-icon"><i class="fas fa-users"></i></div>
      <div class="hc-body"><div class="hc-label">Total</div><div class="hc-val">${total}</div></div>
    </div>
    <div class="hero-ring">
      <div class="ring-box">
        <svg class="ring-svg" viewBox="0 0 100 100">
          <circle class="ring-track" cx="50" cy="50" r="${r}"/>
          <circle class="ring-fill" cx="50" cy="50" r="${r}"
            style="stroke-dasharray:${circ};stroke-dashoffset:${off}"/>
        </svg>
        <div class="ring-center"><span class="ring-pct">${pct}%</span><span class="ring-lbl">Done</span></div>
      </div>
    </div>
  </div>`;
}

function buildTeamsGrid(teams,shift,loc,roomIdx,isSup,isQC){
  const grid=document.createElement('div'); grid.className='teams-grid';
  let cardIdx=0;
  for(const[tl,td]of Object.entries(teams)){
    const id=('tc-'+shift+'-'+loc+'-'+tl).replace(/\s+/g,'-');
    const fSub=td.submitted.filter(u=>matches(u.email,u.pc));
    const fPend=td.notSubmitted.filter(u=>matches(u.email,u.pc));
    if(S.search&&!fSub.length&&!fPend.length) continue;
    const isOpen=S.openTeams.has(id)?'open':'';
    const delay=(roomIdx+1)*50+(++cardIdx)*50;
    const bdBtn=isQC
      ?`<button class="tl-bd-btn" onclick="event.stopPropagation();openQcPanel('${esc(tl)}')" title="Task breakdown"><i class="fas fa-chart-bar"></i></button>`
      :isSup
      ?`<button class="tl-bd-btn" onclick="event.stopPropagation();openSupervisorPanel('${esc(loc)}')" title="Location breakdown"><i class="fas fa-chart-bar"></i></button>`
      :'';
    const card=document.createElement('div');
    card.className=`team-card ${isOpen}`; card.id=id; card.style.animationDelay=delay+'ms';
    card.innerHTML=`
      <div class="team-head" onclick="toggleTeam('${id}')">
        <div class="tl-info">
          <div class="tl-name"><i class="fas fa-user-tie"></i>${tl} ${bdBtn}</div>
          <div class="tl-badges">
            <span class="tbadge tbadge-green"><i class="fas fa-check"></i>${fSub.length} done</span>
            <span class="tbadge tbadge-red"><i class="fas fa-clock"></i>${fPend.length} pending</span>
          </div>
        </div>
        <div class="chevron ${isOpen}"><i class="fas fa-chevron-down"></i></div>
      </div>
      <div class="team-body">
        <div class="split-cols">
          <div class="col-wrap">
            <div class="col-head pending-head"><i class="fas fa-clock"></i>Pending<span class="col-cnt">${fPend.length}</span></div>
            ${fPend.length?fPend.map((u,i)=>userCard(u,'pend',i)).join(''):'<div class="col-empty">All clear ✓</div>'}
          </div>
          <div class="col-wrap">
            <div class="col-head done-head"><i class="fas fa-check-double"></i>Submitted<span class="col-cnt">${fSub.length}</span></div>
            ${fSub.length?fSub.map((u,i)=>userCard(u,'done',i)).join(''):'<div class="col-empty">None yet</div>'}
          </div>
        </div>
      </div>`;
    grid.appendChild(card);
  }
  return grid;
}

function toggleTeam(id){
  const c=document.getElementById(id); if(!c) return;
  c.classList.toggle('open');
  c.querySelector('.chevron')?.classList.toggle('open');
  if(c.classList.contains('open')) S.openTeams.add(id); else S.openTeams.delete(id);
}

function userCard(u,type,idx){
  return `<div class="user-card uc-${type}" style="animation-delay:${idx*30}ms">
    <div class="uc-email">${esc(u.email)}</div>
    <div class="uc-pc"><i class="fas fa-desktop"></i>${esc(u.pc)}</div>
  </div>`;
}

/* ================================================
   STATE RENDERERS
   ================================================ */
function renderLoader(el){ el.innerHTML=`<div class="page-loader"><div class="spin-ring"></div><p>Loading data…</p></div>`; }
function renderEmpty(el,msg){ el.innerHTML=`<div class="page-empty"><i class="fas fa-inbox"></i><p>${msg}</p><button class="retry-btn" onclick="manualRefresh()"><i class="fas fa-rotate"></i> Retry</button></div>`; }
function renderError(el,e){ const msg=e.name==='AbortError'?'Request timed out.':e.message||'Connection error'; el.innerHTML=`<div class="page-error"><i class="fas fa-triangle-exclamation"></i><h3>Connection Error</h3><p>${msg}</p><button class="retry-btn" onclick="manualRefresh()"><i class="fas fa-rotate"></i> Try Again</button></div>`; }
function showToast(){ D.toast.classList.add('show'); setTimeout(()=>D.toast.classList.remove('show'),2200); }

/* ── Utility ──────────────────────────────────── */
function fmtDate(s){ return s.split('-').reverse().join('-'); }
function makeHash(d){ let h=''; Object.values(d).forEach(l=>Object.values(l).forEach(t=>Object.values(t).forEach(tm=>h+=tm.submitted.length+'-'+tm.notSubmitted.length))); return h; }
function esc(s){ const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }

/* ================================================
   BOOT
   ================================================ */
document.addEventListener('DOMContentLoaded',async()=>{
  Object.assign(D,{
    loginOverlay:  document.getElementById('loginOverlay'),
    loginBtn:      document.getElementById('loginBtn'),
    loginSpinner:  document.getElementById('loginSpinner'),
    loginError:    document.getElementById('loginError'),
    loginErrorMsg: document.getElementById('loginErrorMsg'),
    username:      document.getElementById('username'),
    password:      document.getElementById('password'),
    statusPill:    document.getElementById('statusPill'),
    statusLabel:   document.getElementById('statusLabel'),
    userChip:      document.getElementById('userChip'),
    userAvatar:    document.getElementById('userAvatar'),
    userNameLabel: document.getElementById('userNameLabel'),
    userRoleLabel: document.getElementById('userRoleLabel'),
    searchInput:   document.getElementById('searchInput'),
    shiftFilter:   document.getElementById('shiftFilter'),
    locFilter:     document.getElementById('locFilter'),
    datePicker:    document.getElementById('datePicker'),
    mainContent:   document.getElementById('mainContent'),
    ssView:        document.getElementById('ssView'),
    panelMask:     document.getElementById('panelMask'),
    sidePanel:     document.getElementById('sidePanel'),
    panelTitle:    document.getElementById('panelTitle'),
    panelSub:      document.getElementById('panelSub'),
    panelContent:  document.getElementById('panelContent'),
    toast:         document.getElementById('toast'),
  });
  await loadUsers();
});
