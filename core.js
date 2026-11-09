/* ================================================
CORE.JS  v4.2.0 — state · API · session · init · helpers
Load order (all with defer):  config.js → core.js → views-*.js → panels.js → atot.js → lanecert.js → export.js
================================================
SECURITY (v4.0.0)
- No password is ever downloaded. Login = POST (body) → signed token (valid 12 h) kept in localStorage.
- Every request carries only the token; the SERVER decides role / shift / locations.
SPEED (v4.0.0)
- One batched request (POST /batch) loads dashboard + Active Time + Lane Line together.
- Identical in-flight requests are shared, unchanged data is not re-rendered,
  auto-refresh pauses while the tab is hidden.
================================================ */
const S = {
  raw: {}, filtered: {}, openTeams: new Set(),
  search: '', lastHash: '', firstLoad: true, loading: false,
  user: null, token: '', exp: 0, loggedIn: false,
  _cache: {}, _cacheTs: {}, _inflight: {}, _sig: {}, _timer: null, _refreshFn: null, _hiddenAt: 0,
  atRange: null,           /* QC custom ATOT range (see atot.js) */
  health: null, _healthTimer: null     /* data-pipeline health (status pill) */
};
const D = {};

/* ── client cache ── */
function cGet(k) {
  const ttl = CONFIG.CLIENT_CACHE_TTL;
  const ts  = S._cacheTs[k];
  if (ts && Date.now()-ts < ttl) return S._cache[k];
  return null;
}
function cSet(k,v){ S._cache[k]=v; S._cacheTs[k]=Date.now(); }
/* ── INSTANT PAINT (v4.2.0): the last good answer is kept in localStorage and drawn at once,
      then the fresh answer replaces it (the user never waits on an empty screen) ── */
const SWR_MAX_AGE = 12 * 3600 * 1000;
function swrKey(k) { return 'st_swr:' + (S.user ? S.user.username : '') + ':' + k; }
function swrSave(k, data) { try { localStorage.setItem(swrKey(k), JSON.stringify({ t: Date.now(), d: data })); } catch (e) {} }
function swrLoad(k) {
  try {
    const o = JSON.parse(localStorage.getItem(swrKey(k)) || 'null');
    if (o && o.d && Date.now() - o.t < SWR_MAX_AGE) return o.d;
  } catch (e) {}
  return null;
}
function swrClear() {
  try { Object.keys(localStorage).filter(k => k.indexOf('st_swr:') === 0).forEach(k => localStorage.removeItem(k)); } catch (e) {}
}
function cDel(prefix){
  Object.keys(S._cache).forEach(k=>{
    if (!prefix||k.startsWith(prefix)){ delete S._cache[k]; delete S._cacheTs[k]; }
  });
}
/* cache keys (the server scope comes from the token, so keys only need the date) */
const K = {
  dash:    d      => 'dash_'+d,
  supdash: d      => 'supdash_'+d,
  ss:      (s,d)  => 'ss_'+s+'_'+d,
  atlow:   d      => 'atlow_'+d,
  lane:    d      => 'lanecert_'+d,
  report:  d      => 'report_'+d,
  range:   days   => 'atrange_'+days.join(',')
};

/* ── API ── */
const sleep = ms => new Promise(r => setTimeout(r, ms));
function authFail(msg) {
  const err = new Error(msg || 'Session expired — please sign in again');
  err.isAuth = true;
  return err;
}
function checkAuth(data) {
  if (data && data.code === 'AUTH') {
    const err = authFail(data.error);
    if (S.loggedIn) handleLogout(err.message);
    throw err;
  }
  return data;
}
async function apiFetch(params, retry) {
  const p = Object.assign({}, params);
  if (S.token) p.token = S.token;
  const url  = CONFIG.API_URL+'?'+new URLSearchParams(p);
  const ctrl = new AbortController();
  const tid  = setTimeout(()=>ctrl.abort(), CONFIG.REQUEST_TIMEOUT);
  try {
    const res = await fetch(url,{signal:ctrl.signal,mode:'cors'});
    clearTimeout(tid);
    if (!res.ok) throw new Error('HTTP '+res.status);
    return checkAuth(await res.json());
  } catch(e){
    clearTimeout(tid);
    if (e.isAuth) throw e;
    if (retry < 2 && (e.name === 'TypeError' || e.name === 'AbortError' || String(e.message).includes('Failed to fetch'))) {
      await sleep(1000 * (retry + 1));
      return apiFetch(params, retry + 1);
    }
    throw e;
  }
}
/* POST with a text/plain body = no CORS pre-flight (Apps Script can't answer OPTIONS) */
async function apiPost(body, timeoutMs, retry) {
  retry = retry || 0;
  const ctrl = new AbortController();
  const tid  = setTimeout(()=>ctrl.abort(), timeoutMs || CONFIG.REQUEST_TIMEOUT * 1.5);
  try {
    const res = await fetch(CONFIG.API_URL,{method:'POST',body:JSON.stringify(body),signal:ctrl.signal,mode:'cors'});
    clearTimeout(tid);
    if (!res.ok) throw new Error('HTTP '+res.status);
    return await res.json();
  } catch(e){
    clearTimeout(tid);
    if (retry < 1 && (e.name === 'TypeError' || e.name === 'AbortError' || String(e.message).includes('Failed to fetch'))) {
      await sleep(900);
      return apiPost(body, timeoutMs, retry + 1);
    }
    throw e;
  }
}
/* api(params, cacheKey) — cached for CLIENT_CACHE_TTL, identical in-flight calls are shared */
function api(params, cacheKey) {
  if (cacheKey) {
    const h = cGet(cacheKey); if (h) return Promise.resolve(h);
    if (S._inflight[cacheKey]) return S._inflight[cacheKey];
  }
  const p = apiFetch(params, 0).then(data => {
    if (cacheKey && data && data.success !== false) cSet(cacheKey, data);
    return data;
  }).finally(() => { if (cacheKey) delete S._inflight[cacheKey]; });
  if (cacheKey) S._inflight[cacheKey] = p;
  return p;
}
/* primeBatch([{key, params}]) — ONE round trip fills the client cache for several calls.
   Failure is harmless: the normal api() calls simply run one by one. */
async function primeBatch(items) {
  const todo = items.filter(i => !cGet(i.key) && !S._inflight[i.key]);
  if (todo.length < 2) return;
  const job = (async () => {
    const d = checkAuth(await apiPost({ token: S.token, action: 'batch',
      calls: todo.map(i => Object.assign({ key: i.key }, i.params)) }));
    if (d && d.success && d.results) {
      todo.forEach(i => { const r = d.results[i.key]; if (r && r.success !== false) cSet(i.key, r); });
    }
  })();
  try { await job; }
  catch(e) { if (e.isAuth) throw e; console.warn('batch failed → single calls', e.message); }
}

/* ================================================
LOGIN / SESSION
================================================ */
function saveSession() {
  try { localStorage.setItem(CONFIG.SESSION_KEY, JSON.stringify({ token:S.token, user:S.user, exp:S.exp })); } catch(e){}
}
function loadSession() {
  try {
    const s = JSON.parse(localStorage.getItem(CONFIG.SESSION_KEY) || 'null');
    if (s && s.token && s.user && s.exp > Date.now() + 60000) return s;
  } catch(e){}
  return null;
}
function clearSession() { try { localStorage.removeItem(CONFIG.SESSION_KEY); } catch(e){} }

async function handleLogin(e) {
  e.preventDefault();
  const uname = D.username.value.trim();
  const pass  = D.password.value;
  setLoginState('loading');
  try {
    const d = await apiPost({ action:'login', username:uname, password:pass }, 30000);
    if (!d || !d.success) { setLoginState('error', (d && d.error) || 'Invalid username or password'); return; }
    D.password.value = '';
    startSession(d.token, d.user, d.exp);
  } catch(err) {
    setLoginState('error','Server unavailable — check connection');
  }
}
function startSession(token, user, exp) {
  S.token = token; S.user = user; S.exp = exp; S.loggedIn = true;
  saveSession();
  D.loginOverlay.style.display = 'none';
  renderUserChip(user);
  initDashboard();
}
function setLoginState(state, msg) {
  D.loginBtn.style.display    = state==='loading' ? 'none' : 'flex';
  D.loginSpinner.style.display= state==='loading' ? 'flex' : 'none';
  D.loginError.style.display  = state==='error'   ? 'flex' : 'none';
  if (msg) D.loginErrorMsg.textContent = msg;
}
function renderUserChip(user) {
  const roleMap   = {supervisors:'Supervisor',shiftsupervisor:'Shift Supervisor',shiftSupervisor:'Shift Supervisor',qc:'QC',Qc:'QC'};
  const colorMap  = {supervisors:'chip-sup',shiftsupervisor:'chip-shift',shiftSupervisor:'chip-shift',qc:'chip-qc',Qc:'chip-qc'};
  D.userAvatar.textContent  = user.username[0].toUpperCase();
  D.userNameLabel.textContent = user.username;
  D.userRoleLabel.textContent = roleMap[user.role]||user.role;
  D.userRoleLabel.className   = 'user-role-badge '+(colorMap[user.role]||'');
  D.userChip.style.display    = 'flex';
  if (D.pendingExportBtn) D.pendingExportBtn.style.display = user.canExportPending ? 'inline-flex' : 'none';
}
function stopAutoRefresh() {
  if (S._timer) { clearInterval(S._timer); S._timer = null; }
  if (S._healthTimer) { clearInterval(S._healthTimer); S._healthTimer = null; }
  S._refreshFn = null;
}
function handleLogout(reason) {
  stopAutoRefresh();
  S.user=null; S.token=''; S.exp=0; S.loggedIn=false; S.raw={}; S.filtered={};
  S.firstLoad=true; S.lastHash=''; S._sig={}; S.atRange=null; S._inflight={}; S.health=null;
  cDel(); clearSession(); swrClear();
  try { closeCenterModal(); } catch(e){}
  D.userChip.style.display    = 'none';
  if (D.pendingExportBtn) D.pendingExportBtn.style.display = 'none';
  D.loginOverlay.style.display= 'flex';
  D.loginBtn.style.display    = 'flex';
  D.loginSpinner.style.display= 'none';
  D.loginError.style.display  = 'none';
  D.username.value=''; D.password.value='';
  D.ssView.style.display     = 'none';
  D.supervisorView.style.display = 'none';
  D.mainContent.innerHTML    = '';
  D.mainContent.style.display= 'block';
  if (typeof reason === 'string' && reason) setLoginState('error', reason);
}

/* ================================================
INIT
================================================ */
function cairoToday() {
  try { return new Intl.DateTimeFormat('en-CA',{timeZone:CONFIG.TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()); }
  catch(e) { return new Date().toISOString().split('T')[0]; }
}
function startAutoRefresh(fn) {
  stopAutoRefresh();
  S._refreshFn = fn;
  S._timer = setInterval(()=>{ if (!document.hidden) fn(false); }, CONFIG.REFRESH_INTERVAL);
}
function userKind() {
  const r = (S.user?.role || '').toLowerCase();
  if (r === 'shiftsupervisor' || r === 'shift_supervisor' || r === 'shift supervisor') return 'ss';
  if (r === 'supervisor' || r === 'supervisors') return 'sup';
  if (r === 'qc') return 'qc';
  return 'main';
}
function isQcUser() { return userKind() === 'qc'; }

function initDashboard() {
  setStatus('loading');
  D.datePicker.value = cairoToday();
  const kind = userKind();
  S._sig = {};

  if (kind === 'ss') {
    D.mainContent.style.display = 'none';
    D.supervisorView.style.display = 'none';
    D.ssView.style.display      = 'block';
    if (D.shiftFilter) D.shiftFilter.style.display='none';
    if (D.locFilter) D.locFilter.style.display='none';
    fetchShiftSupervisor(true);
    startAutoRefresh(fetchShiftSupervisor);

  } else if (kind === 'sup') {
    D.mainContent.style.display = 'none';
    D.ssView.style.display = 'none';
    D.supervisorView.style.display = 'block';
    if (D.shiftFilter) D.shiftFilter.style.display='none';
    if (D.locFilter) D.locFilter.style.display='none';
    fetchSupervisorDashboard(true);
    startAutoRefresh(fetchSupervisorDashboard);

  } else {
    D.mainContent.style.display = 'block';
    D.ssView.style.display      = 'none';
    D.supervisorView.style.display = 'none';
    if (D.shiftFilter) D.shiftFilter.style.display='';
    if (D.locFilter) D.locFilter.style.display='';
    fetchMain(true);
    startAutoRefresh(fetchMain);
  }
  startHealth();
}
function setStatus(s) {
  const h = S.health;
  if (s === 'live' && h && h.level && h.level !== 'ok') {      /* the page works but the DATA is late / stopped */
    D.statusPill.className = 'status-pill ' + (h.level === 'error' ? 'error' : 'warn');
    D.statusLabel.textContent = h.short || 'Data delayed';
    D.statusPill.title = h.message || '';
    return;
  }
  D.statusPill.title = '';
  D.statusPill.className = 'status-pill ' + (s === 'updating' ? 'loading' : s);
  D.statusLabel.textContent = {live:'Live',error:'Error',loading:'Connecting',updating:'Updating'}[s]||s;
}
/* ── data-pipeline health ──
   v4.2.0: it rides inside the normal batch (no extra request). checkHealth() is only a fallback. */
function healthItems() {
  return (Date.now() - (S._healthAt || 0) > 110000) ? [{ key: 'health', params: { action: 'health' } }] : [];
}
function absorbHealth() {
  const h = cGet('health');
  if (h && h.success !== false && h.level) { S.health = h; S._healthAt = Date.now(); }
}
async function checkHealth() {
  if (!S.loggedIn || document.hidden) return;
  try {
    const d = await api({ action: 'health' }, null);
    if (!d || d.success === false || !d.level) return;
    S.health = d; S._healthAt = Date.now();
    const cls = D.statusPill.className;
    if (/live|warn/.test(cls) || d.level === 'ok') setStatus('live');
  } catch (e) { /* the normal fetches already show connection errors */ }
}
function startHealth() {
  if (S._healthTimer) clearInterval(S._healthTimer);
  S._healthTimer = setInterval(() => { if (Date.now() - (S._healthAt || 0) > 300000) checkHealth(); }, 60000);
}
/* come back to the tab → refresh right away if the data is old */
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { S._hiddenAt = Date.now(); return; }
  if (S.loggedIn && S._refreshFn && Date.now() - S._hiddenAt > CONFIG.REFRESH_INTERVAL) S._refreshFn(false);
});

/* ================================================
STATE RENDERERS
================================================ */
function renderLoader(el) {
  el.innerHTML=`<div class="page-loader"><div class="spin-ring"></div><p>Loading…</p></div>`;
}
function renderEmpty(el,msg) {
  el.innerHTML=`<div class="page-empty"><i class="fas fa-inbox"></i><h3>No Data</h3><p>${msg}</p>
    <button class="retry-btn" onclick="manualRefresh()"><i class="fas fa-rotate"></i> Retry</button></div>`;
}
function renderError(el,e) {
  const msg=e.name==='AbortError'?'Request timed out. Try again.':e.message||'Connection error';
  el.innerHTML=`<div class="page-error"><i class="fas fa-triangle-exclamation"></i>
    <h3>Connection Error</h3><p>${esc(msg)}</p>
    <button class="retry-btn" onclick="manualRefresh()"><i class="fas fa-rotate"></i> Try Again</button></div>`;
}
function showToast() {
  D.toast.classList.add('show');
  setTimeout(()=>D.toast.classList.remove('show'),2000);
}

/* ================================================
UTILITIES
================================================ */
function fmtDate(s){ return s.split('-').reverse().join('-'); }
function makeHash(d){ let h=''; Object.values(d).forEach(l=>Object.values(l).forEach(t=>Object.values(t).forEach(tm=>h+=tm.submitted.length+'-'+tm.notSubmitted.length))); return h; }
const ESC_MAP = {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c=>ESC_MAP[c]); }

/* ================================================
BOOT
================================================ */
document.addEventListener('DOMContentLoaded', ()=>{
  Object.assign(D,{
    loginOverlay:  document.getElementById('loginOverlay'),
    loginForm:     document.getElementById('loginForm'),
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
    pendingExportBtn: document.getElementById('pendingExportBtn'),
    mainContent:   document.getElementById('mainContent'),
    ssView:        document.getElementById('ssView'),
    supervisorView: document.getElementById('supervisorView'),
    panelMask:     document.getElementById('panelMask'),
    sidePanel:     document.getElementById('sidePanel'),
    panelTitle:    document.getElementById('panelTitle'),
    panelSub:      document.getElementById('panelSub'),
    panelContent:  document.getElementById('panelContent'),
    toast:         document.getElementById('toast'),
  });
  D.statusPill.addEventListener('click', ()=>{
    if (S.health && S.health.level !== 'ok' && typeof pendingToast === 'function') pendingToast(S.health.message, 'fa-triangle-exclamation');
  });
  document.addEventListener('keydown', ev=>{
    if ((ev.ctrlKey||ev.metaKey)&&ev.key==='k'){ ev.preventDefault(); D.searchInput.focus(); }
    if (ev.key==='Escape') { closePanel(); closeCenterModal(); closeQcModal(); }
  });

  /* restore a previous session (no login screen, no extra round trip) */
  const saved = loadSession();
  if (!saved) return;
  S.token = saved.token; S.user = saved.user; S.exp = saved.exp; S.loggedIn = true;
  D.loginOverlay.style.display = 'none';
  renderUserChip(S.user);
  initDashboard();
  /* quietly confirm the profile (role / shift / locations may have changed in the sheet) */
  api({action:'session'}).then(d=>{
    if (!d || !d.success || !S.loggedIn) return;
    if (JSON.stringify(d.user) !== JSON.stringify(S.user)) {
      S.user = d.user; saveSession(); renderUserChip(S.user);
      stopAutoRefresh(); cDel(); S.atRange = null; initDashboard();
    }
  }).catch(()=>{});
});
