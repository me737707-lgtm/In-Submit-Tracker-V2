/* ================================================
SCRIPT.JS  v3.4  —  Full Feature Engine + Active Time < 6.5
Depends on config.js loaded first (no defer)
================================================ */
/* ── State ─────────────────────────────────────── */
const S = {
raw: {}, filtered: {}, openTeams: new Set(),
search: '', lastHash: '', firstLoad: true, loading: false,
user: null, users: [], loggedIn: false,
_cache: {}, _cacheTs: {}, _timer: null,
_loginRetries: 0,
_maxLoginRetries: 3,
activeTime65Data: null   // NEW: cache for Active Time < 6.5 data
};
/* ── DOM refs (populated after DOMContentLoaded) ─ */
const D = {};
/* ── Client cache ───────────────────────────────── */
function cGet(k) {
const ttl = CONFIG.CLIENT_CACHE_TTL;
const ts  = S._cacheTs[k];
if (ts && Date.now()-ts < ttl) return S._cache[k];
return null;
}
function cSet(k,v){ S._cache[k]=v; S._cacheTs[k]=Date.now(); }
function cDel(prefix){
Object.keys(S._cache).forEach(k=>{
if (!prefix||k.startsWith(prefix)){ delete S._cache[k]; delete S._cacheTs[k]; }
});
}
/* ── API fetch with cache ───────────────────────── */
async function api(params, cacheKey, retryCount = 0) {
if (cacheKey) { const h=cGet(cacheKey); if(h) return h; }
const url  = CONFIG.API_URL+'?'+new URLSearchParams(params);
const ctrl = new AbortController();
const tid  = setTimeout(()=>ctrl.abort(), CONFIG.REQUEST_TIMEOUT);
try {
const res  = await fetch(url,{signal:ctrl.signal,mode:'cors'});
clearTimeout(tid);
if (!res.ok) throw new Error('HTTP '+res.status);
const data = await res.json();
if (cacheKey) cSet(cacheKey, data);
return data;
} catch(e){
clearTimeout(tid);
if (retryCount < 2 && (e.name === 'TypeError' || e.name === 'AbortError' || e.message.includes('Failed to fetch'))) {
console.warn(`API retry ${retryCount + 1} for`, params);
await new Promise(r => setTimeout(r, 1000 * (retryCount + 1)));
return api(params, cacheKey, retryCount + 1);
}
throw e;
}
}
/* ================================================
LOGIN
================================================ */
async function loadUsers() {
try {
const d = await api({action:'users'},'users_list', 0);
if (d.success && d.users?.length) {
S.users = d.users;
S._loginRetries = 0;
console.log('✅ Users loaded:', S.users.length);
return true;
}
return false;
} catch(e){
console.warn('Users load failed:',e.message);
return false;
}
}
async function handleLogin(e) {
e.preventDefault();
const uname = D.username.value.trim();
const pass  = D.password.value.trim();
setLoginState('loading');
if (!S.users.length) {
let loaded = false;
for (let i = 0; i < S._maxLoginRetries; i++) {
console.log(`Loading users attempt ${i + 1}...`);
loaded = await loadUsers();
if (loaded) break;
await new Promise(r => setTimeout(r, 800));
}
if (!loaded) {
try {
const d = await api({action:'login',username:uname,password:pass}, null, 1);
if (d.success) {
S.user = d;
S.loggedIn = true;
S.users = [{username:d.username,password:pass,role:d.role,permission:d.permission,shift:d.shift,locations:d.locations||''}];
console.log('✅ Direct login success:', d.role, d.permission, d.shift, d.locations);
D.loginOverlay.style.display = 'none';
renderUserChip(d);
initDashboard();
return;
}
} catch(e2) {
console.warn('Direct login fallback failed:', e2.message);
}
setLoginState('error','Server unavailable — check connection');
return;
}
}
const found = S.users.find(u =>
u.username.toLowerCase()===uname.toLowerCase() && u.password===pass
);
if (found) {
S.user = found; S.loggedIn = true;
console.log('✅ Login success:', found.role, found.permission, found.shift, found.locations);
D.loginOverlay.style.display = 'none';
renderUserChip(found);
initDashboard();
} else {
setLoginState('error','Invalid username or password');
}
}
function setLoginState(state, msg) {
D.loginBtn.style.display    = state==='loading' ? 'none' : 'flex';
D.loginSpinner.style.display= state==='loading' ? 'flex' : 'none';
D.loginError.style.display  = state==='error'   ? 'flex' : 'none';
if (msg) D.loginErrorMsg.textContent = msg;
}
function renderUserChip(user) {
const roleMap   = {supervisors:'Supervisor',shiftSupervisor:'Shift Supervisor',Qc:'QC'};
const colorMap  = {supervisors:'chip-sup',shiftSupervisor:'chip-shift',Qc:'chip-qc'};
D.userAvatar.textContent  = user.username[0].toUpperCase();
D.userNameLabel.textContent = user.username;
D.userRoleLabel.textContent = roleMap[user.role]||user.role;
D.userRoleLabel.className   = 'user-role-badge '+(colorMap[user.role]||'');
D.userChip.style.display    = 'flex';
}
function handleLogout() {
S.user=null; S.loggedIn=false; S.raw={}; S.filtered={};
S.firstLoad=true; S._loginRetries=0; S.activeTime65Data=null; cDel();
if (S._timer) { clearInterval(S._timer); S._timer=null; }
D.userChip.style.display    = 'none';
D.loginOverlay.style.display= 'flex';
D.loginBtn.style.display    = 'flex';
D.loginSpinner.style.display= 'none';
D.loginError.style.display  = 'none';
D.username.value=''; D.password.value='';
D.ssView.style.display     = 'none';
D.supervisorView.style.display = 'none';
D.mainContent.innerHTML    = '';
D.mainContent.style.display= 'block';
// NEW: Hide Active Time section on logout
const at65 = document.getElementById('activeTime65Section');
if (at65) at65.style.display = 'none';
}
/* ================================================
INIT
================================================ */
function initDashboard() {
console.log('🚀 initDashboard called, user:', S.user);
setStatus('loading');
D.datePicker.value = new Date().toISOString().split('T')[0];
const role = S.user?.role;
const shift = S.user?.shift || S.user?.permission;
const locations = S.user?.locations || '';
console.log('Role:', role, '| Shift:', shift, '| Permission:', S.user?.permission, '| Locations:', locations);
const roleLower = (role || '').toLowerCase();
const isShiftSupervisor = roleLower === 'shiftsupervisor' || roleLower === 'shift_supervisor' || roleLower === 'shift supervisor' || role === CONFIG.ROLES.SHIFT_SUPERVISOR;
const isSupervisor = roleLower === 'supervisor' || roleLower === 'supervisors' || role === CONFIG.ROLES.SUPERVISOR;
const isQC = roleLower === 'qc' || role === CONFIG.ROLES.QC;
if (isShiftSupervisor) {
console.log('👉 Rendering SHIFT SUPERVISOR view');
D.mainContent.style.display = 'none';
D.supervisorView.style.display = 'none';
D.ssView.style.display      = 'block';
if (D.shiftFilter) D.shiftFilter.style.display='none';
if (D.locFilter) D.locFilter.style.display='none';
fetchShiftSupervisor(true);
S._timer = setInterval(()=>fetchShiftSupervisor(false), CONFIG.REFRESH_INTERVAL);
} else if (isSupervisor) {
console.log('👉 Rendering SUPERVISOR DASHBOARD view');
D.mainContent.style.display = 'none';
D.ssView.style.display = 'none';
D.supervisorView.style.display = 'block';
if (D.shiftFilter) D.shiftFilter.style.display='none';
if (D.locFilter) D.locFilter.style.display='none';
fetchSupervisorDashboard(true);
S._timer = setInterval(()=>fetchSupervisorDashboard(false), CONFIG.REFRESH_INTERVAL);
} else {
console.log('👉 Rendering MAIN DASHBOARD view');
D.mainContent.style.display = 'block';
D.ssView.style.display      = 'none';
D.supervisorView.style.display = 'none';
if (D.shiftFilter) D.shiftFilter.style.display='';
if (D.locFilter) D.locFilter.style.display='';
fetchMain(true);
S._timer = setInterval(()=>fetchMain(false), CONFIG.REFRESH_INTERVAL);
}
// NEW: Fetch Active Time < 6.5 data for ALL roles
fetchActiveTimeLess65(true);
document.addEventListener('keydown', ev=>{
if ((ev.ctrlKey||ev.metaKey)&&ev.key==='k'){ ev.preventDefault(); D.searchInput.focus(); }
if (ev.key==='Escape') { closePanel(); closeCenterModal(); closeQcModal(); }
});
}
/* ── Status pill ─────────────────────────────────── */
function setStatus(s) {
D.statusPill.className = 'status-pill '+s;
D.statusLabel.textContent = {live:'Live',error:'Error',loading:'Connecting'}[s]||s;
}
/* ================================================
MAIN DASHBOARD FETCH
================================================ */
async function fetchMain(showLoader, manual) {
if (S.loading && !manual) return;
const date = fmtDate(D.datePicker.value);
const key  = 'dash_'+date;
try {
S.loading = true;
if (showLoader) renderLoader(D.mainContent);
const json = await api({date}, key, 0);
const data = json.data||{};
if (!Object.keys(data).length) {
renderEmpty(D.mainContent, 'No data for '+date+'. Check the date or wait for sync.');
setStatus('error'); return;
}
S.raw      = data;
S.filtered = filterForUser(data);
setStatus('live');
const hash = makeHash(S.filtered);
if (hash!==S.lastHash || showLoader || manual) {
S.lastHash = hash;
rebuildFilters();
renderDashboard();
if (!showLoader&&!manual) showToast();
}
S.firstLoad = false;
} catch(e) {
setStatus('error');
renderError(D.mainContent, e);
} finally { S.loading=false; }
}
function manualRefresh() {
cDel('dash_'); cDel('supbr_'); cDel('ss_'); cDel('roombr_'); cDel('supdash_'); cDel('active65_');
S.activeTime65Data = null;
const roleLower = (S.user?.role || '').toLowerCase();
if (roleLower === 'shiftsupervisor') fetchShiftSupervisor(true);
else if (roleLower === 'supervisor') fetchSupervisorDashboard(true);
else fetchMain(true,true);
// NEW: Also refresh Active Time < 6.5
fetchActiveTimeLess65(true);
}
/* ── Permission filter ───────────────────────────── */
function filterForUser(data) {
const u = S.user;
if (!u) return data;
const userRoleLower = (u.role || '').toLowerCase();
if (userRoleLower === 'supervisor' || userRoleLower === 'supervisors' || u.role===CONFIG.ROLES.SUPERVISOR) return data;
if (userRoleLower === 'qc' || u.role===CONFIG.ROLES.QC || u.permission==='only') {
const out={};
for (const [shift,locs] of Object.entries(data))
for (const [loc,teams] of Object.entries(locs))
for (const [tn,td] of Object.entries(teams)) {
const base = tn.replace(/\s*\([A-Z]{1,3}\)\s*$/,'').trim();
if (base===u.username||tn===u.username) {
out[shift]          = out[shift]||{};
out[shift][loc]     = out[shift][loc]||{};
out[shift][loc][tn] = td;
}
}
return out;
}
return data;
}
/* ================================================
ACTIVE TIME LESS THAN 6.5 (NEW)
================================================ */
async function fetchActiveTimeLess65(showLoader) {
const date = fmtDate(D.datePicker.value);
const key = 'active65_' + date + '_' + (S.user?.username || 'all');
const section = document.getElementById('activeTime65Section');
if (!section) return;
if (showLoader) {
section.style.display = 'block';
section.innerHTML = '<div class="at65-loading"><div class="spin-ring"></div><p>Loading Active Time data…</p></div>';
}
try {
const d = await api({
action: 'activeTimeLess65',
date: date,
shift: S.user?.shift || '',
locations: S.user?.locations || '',
username: S.user?.username || ''
}, key, 0);
if (!d.success) throw new Error(d.error || 'Failed to load Active Time data');
S.activeTime65Data = d;
renderActiveTimeLess65Section(d);
} catch(e) {
console.error('❌ Active Time < 6.5 error:', e);
if (section) {
section.style.display = 'block';
section.innerHTML = `<div class="at65-error"><i class="fas fa-triangle-exclamation"></i> ${esc(e.message)}</div>`;
}
}
}
function renderActiveTimeLess65Section(d) {
const section = document.getElementById('activeTime65Section');
if (!section) return;
const roleLower = (S.user?.role || '').toLowerCase();
const isShiftSupervisor = roleLower === 'shiftsupervisor' || roleLower === 'shift_supervisor';
const isSupervisor = roleLower === 'supervisor' || roleLower === 'supervisors';
const isQC = roleLower === 'qc';
const total = d.total || 0;
const data = d.data || [];
const byLocation = d.byLocation || {};
const byTL = d.byTL || {};
let html = '';
// Section header
const shiftLabel = S.user?.shift ? (CONFIG.SHIFT_LABELS[S.user.shift] || S.user.shift) : 'All Shifts';
html += `
<div class="at65-header">
<div class="at65-header-left">
<div class="at65-icon-wrap"><i class="fas fa-clock"></i></div>
<div>
<h2 class="at65-title">Active Time &lt; 6.5 Hours</h2>
<span class="at65-sub">${shiftLabel} · ${total} users · ${D.datePicker.value}</span>
</div>
</div>
<div class="at65-total-badge">
<span class="at65-total-num">${total}</span>
<span class="at65-total-label">Users</span>
</div>
</div>`;
if (total === 0) {
html += `<div class="at65-empty"><i class="fas fa-check-circle"></i><p>No users with Active Time less than 6.5 hours.</p></div>`;
section.style.display = 'block';
section.innerHTML = html;
return;
}
if (isShiftSupervisor) {
// Shift Supervisor: See total card + breakdown by location
html += renderShiftSupervisorActiveTime65(d);
} else if (isSupervisor) {
// Supervisor: See breakdown by their locations
html += renderSupervisorActiveTime65(d);
} else if (isQC) {
// QC: See users assigned to them (by TL/QTC name)
html += renderQCActiveTime65(d);
} else {
// Default: Show all data grouped by location
html += renderDefaultActiveTime65(d);
}
section.style.display = 'block';
section.innerHTML = html;
}
/* NEW: Shift Supervisor view - Total card + breakdown */
function renderShiftSupervisorActiveTime65(d) {
const total = d.total || 0;
const byLocation = d.byLocation || {};
const byShift = d.byShift || {};
const data = d.data || [];
let html = '';
// Summary cards row
html += `<div class="at65-cards-row">`;
// Total card - clickable to show all breakdown
html += `
<div class="at65-card at65-card-main at65-clickable" onclick='openActiveTime65DetailPanel("All Users", ${JSON.stringify(data).replace(/'/g, "\\'")})'>
<div class="at65-card-icon at65-icon-blue"><i class="fas fa-users"></i></div>
<div class="at65-card-body">
<div class="at65-card-label">Total Users</div>
<div class="at65-card-value at65-val-blue">${total}</div>
<div class="at65-card-sub">Click for breakdown</div>
</div>
<div class="at65-card-arrow"><i class="fas fa-chevron-right"></i></div>
</div>`;
// Cards by shift
Object.entries(byShift).forEach(([shift, shiftData]) => {
const shiftLabel = CONFIG.SHIFT_LABELS[shift] || shift;
const shiftCount = shiftData.count || 0;
html += `
<div class="at65-card at65-clickable" onclick='openActiveTime65DetailPanel("${shiftLabel} Shift", ${JSON.stringify(shiftData.users || []).replace(/'/g, "\\'")})'>
<div class="at65-card-icon at65-icon-purple"><i class="fas fa-clock"></i></div>
<div class="at65-card-body">
<div class="at65-card-label">${shiftLabel}</div>
<div class="at65-card-value at65-val-purple">${shiftCount}</div>
<div class="at65-card-sub">users</div>
</div>
<div class="at65-card-arrow"><i class="fas fa-chevron-right"></i></div>
</div>`;
});
html += `</div>`;
// Breakdown by location
html += `<div class="at65-section-title"><i class="fas fa-building"></i> Breakdown by Location</div>`;
html += `<div class="at65-loc-grid">`;
Object.entries(byLocation).forEach(([loc, locData]) => {
const locCount = locData.count || 0;
const avgHours = locCount > 0 ? (locData.totalHours / locCount).toFixed(1) : '0.0';
html += `
<div class="at65-loc-card at65-clickable" onclick='openActiveTime65DetailPanel("${esc(loc)}", ${JSON.stringify(locData.users || []).replace(/'/g, "\\'")})'>
<div class="at65-loc-header">
<span class="at65-loc-name">${esc(loc)}</span>
<span class="at65-loc-count">${locCount}</span>
</div>
<div class="at65-loc-stats">
<span class="at65-stat"><i class="fas fa-clock"></i> Avg: ${avgHours}h</span>
<span class="at65-stat"><i class="fas fa-hourglass-half"></i> Total: ${locData.totalHours?.toFixed(1) || '0.0'}h</span>
</div>
</div>`;
});
html += `</div>`;
return html;
}
/* NEW: Supervisor view - Only their locations */
function renderSupervisorActiveTime65(d) {
const data = d.data || [];
const byLocation = d.byLocation || {};
const total = d.total || 0;
let html = '';
// Summary
html += `
<div class="at65-summary-bar">
<div class="at65-sum-item">
<span class="at65-sum-label">Total Users</span>
<span class="at65-sum-val">${total}</span>
</div>
<div class="at65-sum-item">
<span class="at65-sum-label">Locations</span>
<span class="at65-sum-val blue">${Object.keys(byLocation).length}</span>
</div>
<div class="at65-sum-item">
<span class="at65-sum-label">Avg Hours</span>
<span class="at65-sum-val yellow">${data.length > 0 ? (data.reduce((s,u) => s + (u.hours || 0), 0) / data.length).toFixed(1) : '0.0'}h</span>
</div>
</div>`;
// Location breakdown
html += `<div class="at65-section-title"><i class="fas fa-building"></i> Your Locations</div>`;
html += `<div class="at65-loc-grid">`;
Object.entries(byLocation).forEach(([loc, locData]) => {
const locCount = locData.count || 0;
const avgHours = locCount > 0 ? (locData.totalHours / locCount).toFixed(1) : '0.0';
html += `
<div class="at65-loc-card at65-clickable" onclick='openActiveTime65DetailPanel("${esc(loc)}", ${JSON.stringify(locData.users || []).replace(/'/g, "\\'")})'>
<div class="at65-loc-header">
<span class="at65-loc-name">${esc(loc)}</span>
<span class="at65-loc-count">${locCount}</span>
</div>
<div class="at65-loc-stats">
<span class="at65-stat"><i class="fas fa-clock"></i> Avg: ${avgHours}h</span>
<span class="at65-stat"><i class="fas fa-hourglass-half"></i> Total: ${locData.totalHours?.toFixed(1) || '0.0'}h</span>
</div>
</div>`;
});
html += `</div>`;
return html;
}
/* NEW: QC view - Only their users (by TL/QTC name) */
function renderQCActiveTime65(d) {
const data = d.data || [];
const byTL = d.byTL || {};
const username = (S.user?.username || '').toLowerCase().trim();
// Filter data to only show users where TL/QTC matches the QC's username
const myUsers = data.filter(u => {
const tl = (u.tlQtc || '').toLowerCase().trim();
return tl === username || tl.includes(username) || username.includes(tl);
});
const total = myUsers.length;
let html = '';
if (total === 0) {
html += `<div class="at65-empty"><i class="fas fa-user-check"></i><p>No users assigned to you with Active Time less than 6.5 hours.</p></div>`;
return html;
}
// Summary
html += `
<div class="at65-summary-bar">
<div class="at65-sum-item">
<span class="at65-sum-label">My Users</span>
<span class="at65-sum-val green">${total}</span>
</div>
<div class="at65-sum-item">
<span class="at65-sum-label">Avg Hours</span>
<span class="at65-sum-val yellow">${total > 0 ? (myUsers.reduce((s,u) => s + (u.hours || 0), 0) / total).toFixed(1) : '0.0'}h</span>
</div>
<div class="at65-sum-item">
<span class="at65-sum-label">Locations</span>
<span class="at65-sum-val blue">${new Set(myUsers.map(u => u.location)).size}</span>
</div>
</div>`;
// Users list
html += `<div class="at65-section-title"><i class="fas fa-users"></i> My Users (${total})</div>`;
html += `<div class="at65-users-grid">`;
myUsers.forEach((u, i) => {
const hours = u.hours || 0;
const hoursClass = hours < 4 ? 'at65-hours-critical' : hours < 5.5 ? 'at65-hours-warning' : 'at65-hours-normal';
html += `
<div class="at65-user-card" style="animation-delay:${i * 30}ms">
<div class="at65-user-avatar">${(u.email || '?')[0].toUpperCase()}</div>
<div class="at65-user-info">
<div class="at65-user-email">${esc(u.email)}</div>
<div class="at65-user-meta">
<span class="at65-meta-item"><i class="fas fa-desktop"></i> ${esc(u.pcNo || 'N/A')}</span>
<span class="at65-meta-item"><i class="fas fa-map-marker-alt"></i> ${esc(u.location || 'N/A')}</span>
<span class="at65-meta-item"><i class="fas fa-id-badge"></i> ${esc(u.attendance || 'N/A')}</span>
</div>
</div>
<div class="at65-user-hours ${hoursClass}">
<span class="at65-hours-num">${hours.toFixed(1)}</span>
<span class="at65-hours-label">hrs</span>
</div>
</div>`;
});
html += `</div>`;
return html;
}
/* NEW: Default view - All data grouped by location */
function renderDefaultActiveTime65(d) {
const byLocation = d.byLocation || {};
let html = '';
html += `<div class="at65-section-title"><i class="fas fa-building"></i> All Locations</div>`;
html += `<div class="at65-loc-grid">`;
Object.entries(byLocation).forEach(([loc, locData]) => {
const locCount = locData.count || 0;
html += `
<div class="at65-loc-card at65-clickable" onclick='openActiveTime65DetailPanel("${esc(loc)}", ${JSON.stringify(locData.users || []).replace(/'/g, "\\'")})'>
<div class="at65-loc-header">
<span class="at65-loc-name">${esc(loc)}</span>
<span class="at65-loc-count">${locCount}</span>
</div>
</div>`;
});
html += `</div>`;
return html;
}
/* NEW: Detail panel for Active Time < 6.5 */
function openActiveTime65DetailPanel(title, users) {
if (!users || !Array.isArray(users)) users = [];
const userRows = users.map((u, i) => {
const hours = u.hours || 0;
const hoursClass = hours < 4 ? 'at65-hours-critical' : hours < 5.5 ? 'at65-hours-warning' : 'at65-hours-normal';
return `
<div class="at65-detail-row" style="animation-delay:${i * 20}ms">
<div class="at65-detail-avatar">${(u.email || '?')[0].toUpperCase()}</div>
<div class="at65-detail-info">
<div class="at65-detail-email">${esc(u.email)}</div>
<div class="at65-detail-meta">
<span><i class="fas fa-user-tie"></i> ${esc(u.tlQtc || 'N/A')}</span>
<span><i class="fas fa-desktop"></i> ${esc(u.pcNo || 'N/A')}</span>
<span><i class="fas fa-map-marker-alt"></i> ${esc(u.location || 'N/A')}</span>
<span><i class="fas fa-id-badge"></i> ${esc(u.attendance || 'N/A')}</span>
<span><i class="fas fa-calendar"></i> ${esc(u.attendanceTab || 'N/A')}</span>
</div>
</div>
<div class="at65-detail-hours ${hoursClass}">
<span class="at65-hours-num">${hours.toFixed(1)}</span>
<span class="at65-hours-label">hrs</span>
</div>
</div>`;
}).join('');
const avgHours = users.length > 0 ? (users.reduce((s,u) => s + (u.hours || 0), 0) / users.length).toFixed(1) : '0.0';
const totalHours = users.reduce((s,u) => s + (u.hours || 0), 0).toFixed(1);
const html = `
<div class="br-summary-card">
<div class="br-summary-row">
<span class="brs-label">Total Users</span>
<span class="brs-val">${users.length}</span>
</div>
<div class="br-summary-row">
<span class="brs-label">Average Hours</span>
<span class="brs-val c-red">${avgHours}h</span>
</div>
<div class="br-summary-row">
<span class="brs-label">Total Hours</span>
<span class="brs-val">${totalHours}h</span>
</div>
</div>
<div class="at65-section-title" style="margin-top:20px"><i class="fas fa-users"></i> Users (${users.length})</div>
${userRows || '<p class="br-empty">No users found.</p>'}`;
openPanel('Active Time < 6.5 — ' + title, D.datePicker.value, html);
}
/* ================================================
SUPERVISOR DASHBOARD (NEW)
================================================ */
async function fetchSupervisorDashboard(full) {
const locations = S.user?.locations || '';
if (!locations) {
console.error('❌ No locations configured for supervisor');
D.supervisorView.innerHTML = `<div class="err-simple"><i class="fas fa-triangle-exclamation"></i>
<strong>Locations not configured.</strong><br><br>
Your account needs locations assigned in the Login Users sheet (column F).<br><br>
Please ask the admin to set your Locations column.
</div>`;
setStatus('error');
return;
}
const date = fmtDate(D.datePicker.value);
const key = 'supdash_' + locations.replace(/[^a-zA-Z0-9_-]/g,'_') + '_' + date;
if (full) {
D.supervisorView.innerHTML = '<div class="ss-skeleton"><div class="spin-ring"></div><p>Loading supervisor data…</p></div>';
}
try {
const d = await api({action:'supervisorDashboard',date,locations,shift:S.user?.shift||''}, key, 0);
console.log('Supervisor dashboard response:', d);
if (!d.success) throw new Error(d.error || 'Failed');
renderSupervisorDashboard(d);
setStatus('live');
} catch(e) {
console.error('❌ Supervisor dashboard error:', e);
D.supervisorView.innerHTML = `<div class="err-simple"><i class="fas fa-triangle-exclamation"></i> ${e.message}</div>`;
setStatus('error');
}
}
function renderSupervisorDashboard(d) {
console.log('renderSupervisorDashboard called with:', d);
const date = D.datePicker.value;
const locations = d.locations || {};
let html = `<div class="ss-wrap">`;
// Header
html += `
<div class="ss-header">
<div>
<div class="ss-shift-tag" style="background:var(--blue-bg);border-color:var(--blue-br);color:var(--blue);">
<i class="fas fa-user-tie"></i> Supervisor Dashboard
</div>
<p class="ss-date-label">${date}</p>
</div>
<div class="ss-date-ctrl">
<input type="date" value="${date}" class="ctrl-date"
onchange="D.datePicker.value=this.value;cDel('supdash_');cDel('active65_');S.activeTime65Data=null;fetchSupervisorDashboard(true);fetchActiveTimeLess65(true)">
</div>
</div>`;
// Render each location as a section with KPI cards
const locNames = Object.keys(locations);
locNames.forEach((locName, locIdx) => {
const loc = locations[locName];
const att = loc.attendance || {};
const pct = att.totalActive > 0 ? Math.round((loc.totalSubmitted / att.totalActive) * 100) : 0;
const pendCount = loc.totalPending || 0;
const t = loc.tasks || {};
const u = loc.overallUserBreakdown || {LIDAR:{FP:0,QA:0},LaneLine:{FP:0,QA:0}};
// NEW: Get Active Time < 6.5 count for this location
const at65Data = S.activeTime65Data || {};
const at65ByLoc = at65Data.byLocation || {};
const at65LocData = at65ByLoc[locName] || {};
const at65Count = at65LocData.count || 0;
html += `<div class="loc-section" style="margin-bottom:32px;animation-delay:${locIdx * 100}ms">`;
// Location header
html += `
<div class="loc-header" style="margin-bottom:20px;">
<div class="loc-icon-wrap"><i class="fas fa-building"></i></div>
<div class="loc-title-wrap">
<h2 class="loc-name">${esc(locName)}</h2>
<span class="loc-sub">${CONFIG.SHIFT_LABELS[loc.shift] || loc.shift || ''} · ${Object.keys(loc.rooms||{}).length} rooms · ${att.totalActive || 0} active</span>
</div>
</div>`;
// KPI Grid for this location
html += `<div class="kpi-grid">`;
// Total Active Users
html += `
<div class="kpi-card kpi-clickable" onclick='openPanel("Attendance Overview","${esc(locName)}",${JSON.stringify(buildAttendanceRows(att))})'>
<div class="kpi-icon-wrap kpi-blue"><i class="fas fa-users"></i></div>
<div class="kpi-body">
<div class="kpi-label">Total Active Users</div>
<div class="kpi-val kpi-val-blue">${att.totalActive||0}</div>
</div>
<div class="kpi-arrow"><i class="fas fa-chevron-right"></i></div>
</div>`;
// Total Submitted
html += `
<div class="kpi-card kpi-clickable" onclick='openPanel("Task Breakdown","${esc(locName)}",${JSON.stringify(buildTaskRows(t))})'>
<div class="kpi-icon-wrap kpi-green"><i class="fas fa-circle-check"></i></div>
<div class="kpi-body">
<div class="kpi-label">Total Submitted</div>
<div class="kpi-val kpi-val-green">${loc.totalSubmitted||0}</div>
<div class="kpi-sub">${t.total||0} tasks · ${t.uniqueUsers||0} labelers</div>
</div>
<div class="kpi-arrow"><i class="fas fa-chevron-right"></i></div>
</div>`;
// Pending
html += `
<div class="kpi-card kpi-clickable" onclick='openPendingPanel(${JSON.stringify(loc.rooms||{})},${pendCount},${JSON.stringify(loc.pendingByTeam||{})},${JSON.stringify(loc.pendingUsers||[])})'>
<div class="kpi-icon-wrap kpi-red"><i class="fas fa-hourglass-half"></i></div>
<div class="kpi-body">
<div class="kpi-label">Pending</div>
<div class="kpi-val kpi-val-red">${pendCount}</div>
</div>
<div class="kpi-arrow"><i class="fas fa-chevron-right"></i></div>
</div>`;
// Progress Ring
html += `
<div class="kpi-card kpi-ring">
${ringHTML(pct)}
</div>`;
// NEW: Active Time < 6.5 card
if (at65Count > 0) {
html += `
<div class="kpi-card kpi-clickable" onclick='openActiveTime65DetailPanel("${esc(locName)}", ${JSON.stringify(at65LocData.users || []).replace(/'/g, "\\'")})'>
<div class="kpi-icon-wrap kpi-yellow"><i class="fas fa-clock"></i></div>
<div class="kpi-body">
<div class="kpi-label">Active Time &lt; 6.5h</div>
<div class="kpi-val kpi-val-yellow">${at65Count}</div>
<div class="kpi-sub">Click for details</div>
</div>
<div class="kpi-arrow"><i class="fas fa-chevron-right"></i></div>
</div>`;
}
// Absent
if (att.totalAbsent > 0) {
html += `
<div class="kpi-card">
<div class="kpi-icon-wrap kpi-red"><i class="fas fa-user-xmark"></i></div>
<div class="kpi-body">
<div class="kpi-label">Absent</div>
<div class="kpi-val kpi-val-red">${att.totalAbsent||0}</div>
</div>
</div>`;
}
// Empty
if (att.totalEmpty > 0) {
html += `
<div class="kpi-card">
<div class="kpi-icon-wrap kpi-gray"><i class="fas fa-user-slash"></i></div>
<div class="kpi-body">
<div class="kpi-label">Empty</div>
<div class="kpi-val kpi-val-gray">${att.totalEmpty||0}</div>
</div>
</div>`;
}
// Training
if (att.totalTraining > 0) {
const trainingHTML = Object.entries(att.trainingByLevel||{}).map(([l,c])=>`<span class="train-badge">${l}: ${c}</span>`).join('');
html += `
<div class="kpi-card">
<div class="kpi-icon-wrap kpi-yellow"><i class="fas fa-graduation-cap"></i></div>
<div class="kpi-body">
<div class="kpi-label">In Training</div>
<div class="kpi-val kpi-val-yellow">${att.totalTraining||0}</div>
<div class="kpi-extra">${trainingHTML}</div>
</div>
</div>`;
}
// Room Breakdown
html += `
<div class="kpi-card kpi-clickable" onclick='openPanel("Room Breakdown — Detailed","${esc(locName)}",${JSON.stringify(buildRoomRows(loc.rooms||{}))})'>
<div class="kpi-icon-wrap kpi-purple"><i class="fas fa-building"></i></div>
<div class="kpi-body">
<div class="kpi-label">Room Breakdown</div>
<div class="kpi-val kpi-val-purple">${Object.keys(loc.rooms||{}).length} rooms</div>
<div class="kpi-sub">Click for details</div>
</div>
<div class="kpi-arrow"><i class="fas fa-chevron-right"></i></div>
</div>`;
// LIDAR First Pass
html += `
<div class="kpi-card kpi-clickable" onclick='openUserTypePanel("LIDAR First Pass","${esc(locName)}",${JSON.stringify(loc.roomUserBreakdown||{})},"LIDAR","FP")'>
<div class="kpi-icon-wrap kpi-blue"><i class="fas fa-cube"></i></div>
<div class="kpi-body">
<div class="kpi-label">LIDAR First Pass</div>
<div class="kpi-val kpi-val-blue">${u.LIDAR?.FP||0}</div>
<div class="kpi-sub">labelers</div>
</div>
<div class="kpi-arrow"><i class="fas fa-chevron-right"></i></div>
</div>`;
// LIDAR QA
html += `
<div class="kpi-card kpi-clickable" onclick='openUserTypePanel("LIDAR QA","${esc(locName)}",${JSON.stringify(loc.roomUserBreakdown||{})},"LIDAR","QA")'>
<div class="kpi-icon-wrap kpi-green"><i class="fas fa-cube"></i></div>
<div class="kpi-body">
<div class="kpi-label">LIDAR QA</div>
<div class="kpi-val kpi-val-green">${u.LIDAR?.QA||0}</div>
<div class="kpi-sub">labelers</div>
</div>
<div class="kpi-arrow"><i class="fas fa-chevron-right"></i></div>
</div>`;
// Lane Line First Pass
html += `
<div class="kpi-card kpi-clickable" onclick='openUserTypePanel("Lane Line First Pass","${esc(locName)}",${JSON.stringify(loc.roomUserBreakdown||{})},"LaneLine","FP")'>
<div class="kpi-icon-wrap kpi-purple"><i class="fas fa-road"></i></div>
<div class="kpi-body">
<div class="kpi-label">Lane Line First Pass</div>
<div class="kpi-val kpi-val-purple">${u.LaneLine?.FP||0}</div>
<div class="kpi-sub">labelers</div>
</div>
<div class="kpi-arrow"><i class="fas fa-chevron-right"></i></div>
</div>`;
// Lane Line QA
html += `
<div class="kpi-card kpi-clickable" onclick='openUserTypePanel("Lane Line QA","${esc(locName)}",${JSON.stringify(loc.roomUserBreakdown||{})},"LaneLine","QA")'>
<div class="kpi-icon-wrap kpi-yellow"><i class="fas fa-road"></i></div>
<div class="kpi-body">
<div class="kpi-label">Lane Line QA</div>
<div class="kpi-val kpi-val-yellow">${u.LaneLine?.QA||0}</div>
<div class="kpi-sub">labelers</div>
</div>
<div class="kpi-arrow"><i class="fas fa-chevron-right"></i></div>
</div>`;
// QC Breakdown
html += `
<div class="kpi-card kpi-clickable" onclick='openSupervisorQcPanel("${esc(locName)}","${fmtDate(D.datePicker.value)}")'>
<div class="kpi-icon-wrap kpi-purple"><i class="fas fa-user-tie"></i></div>
<div class="kpi-body">
<div class="kpi-label">QC Breakdown</div>
<div class="kpi-val kpi-val-purple">${loc.qcCount||0} QCs</div>
<div class="kpi-sub">Click for details</div>
</div>
<div class="kpi-arrow"><i class="fas fa-chevron-right"></i></div>
</div>`;
html += `</div>`; // end kpi-grid
html += `</div>`; // end loc-section
});
html += `</div>`; // end ss-wrap
D.supervisorView.innerHTML = html;
console.log('✅ Supervisor dashboard rendered successfully');
}
function buildAttendanceRows(att) {
let html = `
<div class="br-section">Attendance Overview</div>
<div class="br-row">
<span class="br-label"><i class="fas fa-user-check"></i>Active Users</span>
<span class="br-pill pill-green">${att.totalActive||0}</span>
</div>
<div class="br-row">
<span class="br-label"><i class="fas fa-user-xmark"></i>Absent (0)</span>
<span class="br-pill pill-red">${att.totalAbsent||0}</span>
</div>
<div class="br-row">
<span class="br-label"><i class="fas fa-user-slash"></i>Empty (E)</span>
<span class="br-pill pill-gray">${att.totalEmpty||0}</span>
</div>`;
if (att.totalTraining > 0) {
html += `
<div class="br-row">
<span class="br-label"><i class="fas fa-graduation-cap"></i>In Training</span>
<span class="br-pill pill-yellow">${att.totalTraining||0}</span>
</div>
<div class="br-training-detail">
${Object.entries(att.trainingByLevel||{}).map(([l,c])=>`<span class="train-badge">${l}: ${c}</span>`).join('')}
</div>`;
}
return html;
}
function buildTaskRows(t) {
let html = `
<div class="br-section">LIDAR</div>
<div class="br-row"><span class="br-label">First Pass (FP)</span><span class="br-pill pill-blue">${t.LIDAR?.FP||0} tasks</span></div>
<div class="br-row"><span class="br-label">QA</span><span class="br-pill pill-green">${t.LIDAR?.QA||0} tasks</span></div>
<div class="br-section" style="margin-top:12px">Lane Line</div>
<div class="br-row"><span class="br-label">First Pass (FP)</span><span class="br-pill pill-blue">${t.LaneLine?.FP||0} tasks</span></div>
<div class="br-row"><span class="br-label">QA</span><span class="br-pill pill-green">${t.LaneLine?.QA||0} tasks</span></div>`;
if (Object.keys(t.other||{}).length) {
html += `<div class="br-section" style="margin-top:12px">Other</div>` +
Object.entries(t.other||{}).map(([k,v])=>`<div class="br-row"><span class="br-label">${k}</span><span class="br-pill pill-yellow">${v}</span></div>`).join('');
}
return html;
}
function buildRoomRows(rooms) {
return Object.entries(rooms).map(([room,r])=>{
const trainingBadges = Object.entries(r.trainingByLevel||{}).map(([l,c])=>`<span class="train-badge-sm">${l}: ${c}</span>`).join('');
return `
<div class="br-row room-detail-row">
<div class="room-detail-main">
<span class="br-label"><i class="fas fa-door-open"></i>${room}</span>
<span class="br-pill pill-blue">${r.total} total</span>
</div>
<div class="room-detail-stats">
<span class="br-pill pill-green"><i class="fas fa-user-check"></i>${r.active||0} active</span>
<span class="br-pill pill-green"><i class="fas fa-check"></i>${r.submitted||0} done</span>
<span class="br-pill pill-red"><i class="fas fa-hourglass"></i>${r.pending||0} pending</span>
${r.absent>0?`<span class="br-pill pill-gray"><i class="fas fa-user-xmark"></i>${r.absent} absent</span>`:''}
${r.empty>0?`<span class="br-pill pill-gray"><i class="fas fa-user-slash"></i>${r.empty} empty</span>`:''}
${r.training>0?`<span class="br-pill pill-yellow"><i class="fas fa-graduation-cap"></i>${r.training} training</span>`:''}
</div>
${trainingBadges?`<div class="room-training-badges">${trainingBadges}</div>`:''}
</div>`;
}).join('');
}
/* NEW: Show submitted users with team info */
function openSubmittedUsersPanel(locName, submittedUsers, totalTasks, totalLabelers) {
const userRows = submittedUsers.map((u, i) => `
<div class="br-row" style="animation-delay:${i * 30}ms">
<div style="display:flex;align-items:center;gap:12px;flex:1;">
<div style="width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,var(--blue),var(--green));display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff;flex-shrink:0;">${u.email[0].toUpperCase()}</div>
<div>
<div style="font-size:13px;font-weight:600;color:var(--t-1);">${esc(u.email)}</div>
<div style="font-size:11px;color:var(--t-4);display:flex;align-items:center;gap:6px;margin-top:2px;">
<i class="fas fa-desktop" style="font-size:10px;"></i>${esc(u.pc || 'N/A')}
<span style="color:var(--br-2)">|</span>
<i class="fas fa-user-tie" style="font-size:10px;"></i>${esc(u.team)}
</div>
</div>
</div>
<span class="br-pill pill-green"><i class="fas fa-check"></i> Submitted</span>
</div>
`).join('');
const html = `
<div class="br-summary-card">
<div class="br-summary-row">
<span class="brs-label">Total Submitted</span>
<span class="brs-val c-green">${submittedUsers.length}</span>
</div>
<div class="br-summary-row">
<span class="brs-label">Total Tasks</span>
<span class="brs-val">${totalTasks || 0}</span>
</div>
<div class="br-summary-row">
<span class="brs-label">Unique Labelers</span>
<span class="brs-val">${totalLabelers || 0}</span>
</div>
</div>
<div class="br-section" style="margin-top:20px">Submitted Users (${submittedUsers.length})</div>
${userRows || '<p class="br-empty">No submitted users.</p>'}`;
openPanel('Submitted Users', locName, html);
}
/* NEW: Show pending users */
function openPendingUsersPanel(locName, pendingUsers) {
const userRows = pendingUsers.map((u, i) => `
<div class="br-row" style="animation-delay:${i * 30}ms">
<div style="display:flex;align-items:center;gap:12px;flex:1;">
<div style="width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,var(--red),var(--yellow));display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff;flex-shrink:0;">${u.email[0].toUpperCase()}</div>
<div>
<div style="font-size:13px;font-weight:600;color:var(--t-1);">${esc(u.email)}</div>
<div style="font-size:11px;color:var(--t-4);display:flex;align-items:center;gap:6px;margin-top:2px;">
<i class="fas fa-clock" style="font-size:10px;"></i>Pending submission
</div>
</div>
</div>
<span class="br-pill pill-red"><i class="fas fa-hourglass"></i> Pending</span>
</div>
`).join('');
const html = `
<div class="br-summary-card">
<div class="br-summary-row">
<span class="brs-label">Total Pending</span>
<span class="brs-val c-red">${pendingUsers.length}</span>
</div>
</div>
<div class="br-section" style="margin-top:20px">Pending Users (${pendingUsers.length})</div>
${userRows || '<p class="br-empty">All users have submitted!</p>'}`;
openPanel('Pending Users', locName, html);
}
/* NEW: Show active users with their status */
function openActiveUsersPanel(locName, submittedUsers, pendingUsers) {
const allActive = [
...submittedUsers.map(u => ({ ...u, status: 'submitted' })),
...pendingUsers.map(u => ({ ...u, status: 'pending' }))
];
const userRows = allActive.map((u, i) => `
<div class="br-row" style="animation-delay:${i * 30}ms">
<div style="display:flex;align-items:center;gap:12px;flex:1;">
<div style="width:32px;height:32px;border-radius:8px;background:${u.status === 'submitted' ? 'linear-gradient(135deg,var(--blue),var(--green))' : 'linear-gradient(135deg,var(--red),var(--yellow))'};display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff;flex-shrink:0;">${u.email[0].toUpperCase()}</div>
<div>
<div style="font-size:13px;font-weight:600;color:var(--t-1);">${esc(u.email)}</div>
${u.team && u.team !== 'N/A' ? `<div style="font-size:11px;color:var(--t-4);display:flex;align-items:center;gap:6px;margin-top:2px;"><i class="fas fa-user-tie" style="font-size:10px;"></i>${esc(u.team)}</div>` : ''}
</div>
</div>
<span class="br-pill ${u.status === 'submitted' ? 'pill-green' : 'pill-red'}"><i class="fas fa-${u.status === 'submitted' ? 'check' : 'hourglass'}"></i> ${u.status === 'submitted' ? 'Submitted' : 'Pending'}</span>
</div>
`).join('');
const html = `
<div class="br-summary-card">
<div class="br-summary-row">
<span class="brs-label">Total Active</span>
<span class="brs-val">${allActive.length}</span>
</div>
<div class="br-summary-row">
<span class="brs-label">Submitted</span>
<span class="brs-val c-green">${submittedUsers.length}</span>
</div>
<div class="br-summary-row">
<span class="brs-label">Pending</span>
<span class="brs-val c-red">${pendingUsers.length}</span>
</div>
</div>
<div class="br-section" style="margin-top:20px">Active Users (${allActive.length})</div>
${userRows || '<p class="br-empty">No active users.</p>'}`;
openPanel('Active Users', locName, html);
}
async function openSupervisorQcPanel(locName, date) {
openCenterModal('QC Breakdown', locName, '<div class="qc-modal-spin"><div class="spin-ring"></div></div>');
const key = 'supdash_' + (S.user?.locations||'').replace(/[^a-zA-Z0-9_-]/g,'_') + '_' + date;
try {
const d = await api({action:'supervisorDashboard',date,locations:S.user?.locations||''}, key, 0);
if (!d.success) throw new Error(d.error || 'Failed');
const loc = d.locations?.[locName];
if (!loc) {
document.getElementById('centerModalContent').innerHTML = '<div class="qc-empty"><i class="fas fa-inbox"></i><p>No QC data found.</p></div>';
return;
}
const qcDetails = loc.qcDetails || {};
const qcNames = Object.keys(qcDetails);
if (qcNames.length === 0) {
document.getElementById('centerModalContent').innerHTML = '<div class="qc-empty"><i class="fas fa-inbox"></i><p>No QC data found.</p></div>';
return;
}
let totalTasks = 0, totalLidarFP = 0, totalLidarQA = 0, totalLaneFP = 0, totalLaneQA = 0;
const qcCards = qcNames.map(qc => {
const q = qcDetails[qc];
totalTasks += q.total;
totalLidarFP += q.LIDAR?.FP || 0;
totalLidarQA += q.LIDAR?.QA || 0;
totalLaneFP += q.LaneLine?.FP || 0;
totalLaneQA += q.LaneLine?.QA || 0;
return `
<div class="qc-card">
<div class="qc-card-header">
<div class="qc-avatar">${qc[0].toUpperCase()}</div>
<div class="qc-info">
<div class="qc-name">${esc(qc)}</div>
<div class="qc-meta">${q.total} tasks</div>
</div>
</div>
<div class="qc-task-grid">
<div class="qc-task-item lidar-fp">
<span class="qc-task-label">LIDAR FP</span>
<span class="qc-task-val">${q.LIDAR?.FP || 0}</span>
</div>
<div class="qc-task-item lidar-qa">
<span class="qc-task-label">LIDAR QA</span>
<span class="qc-task-val">${q.LIDAR?.QA || 0}</span>
</div>
<div class="qc-task-item lane-fp">
<span class="qc-task-label">LaneLine FP</span>
<span class="qc-task-val">${q.LaneLine?.FP || 0}</span>
</div>
<div class="qc-task-item lane-qa">
<span class="qc-task-label">LaneLine QA</span>
<span class="qc-task-val">${q.LaneLine?.QA || 0}</span>
</div>
</div>
${Object.keys(q.other || {}).length ? `
<div class="qc-other">
${Object.entries(q.other).map(([k,v]) => `<span class="qc-other-badge">${k}: ${v}</span>`).join('')}
</div>` : ''}
</div>`;
}).join('');
document.getElementById('centerModalContent').innerHTML = `
<div class="qc-summary-bar">
<div class="qc-sum-item">
<span class="qc-sum-label">Total Tasks</span>
<span class="qc-sum-val">${totalTasks}</span>
</div>
<div class="qc-sum-item">
<span class="qc-sum-label">LIDAR FP</span>
<span class="qc-sum-val blue">${totalLidarFP}</span>
</div>
<div class="qc-sum-item">
<span class="qc-sum-label">LIDAR QA</span>
<span class="qc-sum-val green">${totalLidarQA}</span>
</div>
<div class="qc-sum-item">
<span class="qc-sum-label">LaneLine FP</span>
<span class="qc-sum-val purple">${totalLaneFP}</span>
</div>
<div class="qc-sum-item">
<span class="qc-sum-label">LaneLine QA</span>
<span class="qc-sum-val yellow">${totalLaneQA}</span>
</div>
</div>
<div class="qc-cards-grid">
${qcCards}
</div>`;
} catch(e) {
document.getElementById('centerModalContent').innerHTML = `<div class="qc-empty"><i class="fas fa-triangle-exclamation"></i><p>${e.message}</p></div>`;
}
}
/* ================================================
SHIFT SUPERVISOR VIEW
================================================ */
async function fetchShiftSupervisor(full) {
const shift = S.user?.shift || S.user?.permission;
console.log('fetchShiftSupervisor called, shift:', shift);
if (!shift || shift === 'all') {
console.error('❌ No valid shift found for user. shift:', shift, 'user:', S.user);
D.ssView.innerHTML = `<div class="err-simple"><i class="fas fa-triangle-exclamation"></i>
<strong>Shift not configured correctly.</strong><br><br>
Your account needs a shift assignment (M, N, or ON).<br>
Current value: "${shift || 'empty'}"<br><br>
Please ask the admin to set your Shift column (E) to M, N, or ON in the Login Users sheet.
</div>`;
setStatus('error');
return;
}
const date  = fmtDate(D.datePicker.value);
const key   = 'ss_'+shift+'_'+date;
if (full) { D.ssView.innerHTML='<div class="ss-skeleton"><div class="spin-ring"></div><p>Loading shift data…</p></div>'; }
try {
const d = await api({action:'shiftSupervisor',shift,date}, key, 0);
console.log('Shift supervisor response:', d);
if (!d.success) throw new Error(d.error||'Failed');
renderSSView(d);
setStatus('live');
} catch(e) {
console.error('❌ Shift supervisor error:', e);
D.ssView.innerHTML=`<div class="err-simple"><i class="fas fa-triangle-exclamation"></i> ${e.message}</div>`;
setStatus('error');
}
}
function renderSSView(d) {
console.log('renderSSView called with:', d);
const shift      = d.shift;
const label      = CONFIG.SHIFT_LABELS[shift]||shift;
const att        = d.attendance || {};
const totalActive = d.totalUsers || att.totalActive || 0;
const pct        = totalActive>0 ? Math.round((d.totalSubmitted/totalActive)*100) : 0;
const pendCount  = d.totalPending || 0;
// NEW: Get Active Time < 6.5 data
const at65Data = S.activeTime65Data || {};
const at65Total = at65Data.total || 0;
const at65ByShift = at65Data.byShift || {};
const at65ShiftData = at65ByShift[shift] || {};
const at65Count = at65ShiftData.count || 0;
const roomRows = Object.entries(d.roomBreakdown||{}).map(([room,r])=>{
const trainingBadges = Object.entries(r.trainingByLevel||{}).map(([l,c])=>`<span class="train-badge-sm">${l}: ${c}</span>`).join('');
return `
<div class="br-row room-detail-row">
<div class="room-detail-main">
<span class="br-label"><i class="fas fa-door-open"></i>${room}</span>
<span class="br-pill pill-blue">${r.total} total</span>
</div>
<div class="room-detail-stats">
<span class="br-pill pill-green"><i class="fas fa-user-check"></i>${r.active||0} active</span>
<span class="br-pill pill-green"><i class="fas fa-check"></i>${r.submitted||0} done</span>
<span class="br-pill pill-red"><i class="fas fa-hourglass"></i>${r.pending||0} pending</span>
${r.absent>0?`<span class="br-pill pill-gray"><i class="fas fa-user-xmark"></i>${r.absent} absent</span>`:''}
${r.empty>0?`<span class="br-pill pill-gray"><i class="fas fa-user-slash"></i>${r.empty} empty</span>`:''}
${r.training>0?`<span class="br-pill pill-yellow"><i class="fas fa-graduation-cap"></i>${r.training} training</span>`:''}
</div>
${trainingBadges?`<div class="room-training-badges">${trainingBadges}</div>`:''}
</div>`;
}).join('');
const t = d.tasks||{};
const u = d.overallUserBreakdown || {LIDAR:{FP:0,QA:0},LaneLine:{FP:0,QA:0}};
const taskRows = `
<div class="br-section">LIDAR</div>
<div class="br-row"><span class="br-label">First Pass (FP)</span><span class="br-pill pill-blue">${t.LIDAR?.FP||0} tasks</span></div>
<div class="br-row"><span class="br-label">QA</span><span class="br-pill pill-green">${t.LIDAR?.QA||0} tasks</span></div>
<div class="br-section" style="margin-top:12px">Lane Line</div>
<div class="br-row"><span class="br-label">First Pass (FP)</span><span class="br-pill pill-blue">${t.LaneLine?.FP||0} tasks</span></div>
<div class="br-row"><span class="br-label">QA</span><span class="br-pill pill-green">${t.LaneLine?.QA||0} tasks</span></div>
${Object.keys(t.other||{}).length?`<div class="br-section" style="margin-top:12px">Other</div>`+
Object.entries(t.other||{}).map(([k,v])=>`<div class="br-row"><span class="br-label">${k}</span><span class="br-pill pill-yellow">${v}</span></div>`).join(''):''}
`;
const attRows = `
<div class="br-section">Attendance Overview</div>
<div class="br-row">
<span class="br-label"><i class="fas fa-user-check"></i>Active Users</span>
<span class="br-pill pill-green">${att.totalActive||0}</span>
</div>
<div class="br-row">
<span class="br-label"><i class="fas fa-user-xmark"></i>Absent (0)</span>
<span class="br-pill pill-red">${att.totalAbsent||0}</span>
</div>
<div class="br-row">
<span class="br-label"><i class="fas fa-user-slash"></i>Empty (E)</span>
<span class="br-pill pill-gray">${att.totalEmpty||0}</span>
</div>
${att.totalTraining>0?`
<div class="br-row">
<span class="br-label"><i class="fas fa-graduation-cap"></i>In Training</span>
<span class="br-pill pill-yellow">${att.totalTraining||0}</span>
</div>
<div class="br-training-detail">
${Object.entries(att.trainingByLevel||{}).map(([l,c])=>`<span class="train-badge">${l}: ${c}</span>`).join('')}
</div>`:''}
`;
const trainingHTML = att.totalTraining>0
? `<div class="kpi-extra">${Object.entries(att.trainingByLevel||{}).map(([l,c])=>`<span class="train-badge">${l}: ${c}</span>`).join('')}</div>`
: '';
D.ssView.innerHTML = `
<div class="ss-wrap">
<div class="ss-header">
<div>
<div class="ss-shift-tag"><i class="fas fa-clock"></i> ${label} Shift</div>
<p class="ss-date-label">${D.datePicker.value}</p>
</div>
<div class="ss-date-ctrl">
<input type="date" value="${D.datePicker.value}" class="ctrl-date"
onchange="D.datePicker.value=this.value;cDel('ss_');cDel('active65_');S.activeTime65Data=null;fetchShiftSupervisor(true);fetchActiveTimeLess65(true)">
</div>
</div>
<div class="kpi-grid">
<div class="kpi-card kpi-clickable" onclick='openPanel("Attendance Overview","${label} Shift",${JSON.stringify(attRows)})'>
<div class="kpi-icon-wrap kpi-blue"><i class="fas fa-users"></i></div>
<div class="kpi-body">
<div class="kpi-label">Total Active Users</div>
<div class="kpi-val kpi-val-blue">${att.totalActive||0}</div>
</div>
<div class="kpi-arrow"><i class="fas fa-chevron-right"></i></div>
</div>
<div class="kpi-card kpi-clickable" onclick='openPanel("Task Breakdown","${label} Shift",${JSON.stringify(taskRows)})'>
<div class="kpi-icon-wrap kpi-green"><i class="fas fa-circle-check"></i></div>
<div class="kpi-body">
<div class="kpi-label">Total Submitted</div>
<div class="kpi-val kpi-val-green">${d.totalSubmitted||0}</div>
<div class="kpi-sub">${t.total||0} tasks · ${t.uniqueUsers||0} labelers</div>
</div>
<div class="kpi-arrow"><i class="fas fa-chevron-right"></i></div>
</div>
<div class="kpi-card kpi-clickable" onclick='openPendingPanel(${JSON.stringify(d.roomBreakdown||{})},${d.totalPending||0},{},${JSON.stringify(d.pendingUsers||[])})'>
<div class="kpi-icon-wrap kpi-red"><i class="fas fa-hourglass-half"></i></div>
<div class="kpi-body">
<div class="kpi-label">Pending</div>
<div class="kpi-val kpi-val-red">${pendCount}</div>
</div>
<div class="kpi-arrow"><i class="fas fa-chevron-right"></i></div>
</div>
<div class="kpi-card kpi-ring">
${ringHTML(pct)}
</div>
${at65Count > 0 ? `
<div class="kpi-card kpi-clickable" onclick='openActiveTime65DetailPanel("${label} Shift", ${JSON.stringify(at65ShiftData.users || []).replace(/'/g, "\\'")})'>
<div class="kpi-icon-wrap kpi-yellow"><i class="fas fa-clock"></i></div>
<div class="kpi-body">
<div class="kpi-label">Active Time &lt; 6.5h</div>
<div class="kpi-val kpi-val-yellow">${at65Count}</div>
<div class="kpi-sub">Click for breakdown</div>
</div>
<div class="kpi-arrow"><i class="fas fa-chevron-right"></i></div>
</div>` : ''}
${att.totalAbsent>0?`
<div class="kpi-card">
<div class="kpi-icon-wrap kpi-red"><i class="fas fa-user-xmark"></i></div>
<div class="kpi-body">
<div class="kpi-label">Absent</div>
<div class="kpi-val kpi-val-red">${att.totalAbsent||0}</div>
</div>
</div>`:''}
${att.totalEmpty>0?`
<div class="kpi-card">
<div class="kpi-icon-wrap kpi-gray"><i class="fas fa-user-slash"></i></div>
<div class="kpi-body">
<div class="kpi-label">Empty</div>
<div class="kpi-val kpi-val-gray">${att.totalEmpty||0}</div>
</div>
</div>`:''}
${att.totalTraining>0?`
<div class="kpi-card">
<div class="kpi-icon-wrap kpi-yellow"><i class="fas fa-graduation-cap"></i></div>
<div class="kpi-body">
<div class="kpi-label">In Training</div>
<div class="kpi-val kpi-val-yellow">${att.totalTraining||0}</div>
${trainingHTML}
</div>
</div>`:''}
<div class="kpi-card kpi-clickable" onclick='openPanel("Room Breakdown — Detailed","${label} Shift",${JSON.stringify(roomRows)})'>
<div class="kpi-icon-wrap kpi-purple"><i class="fas fa-building"></i></div>
<div class="kpi-body">
<div class="kpi-label">Room Breakdown</div>
<div class="kpi-val kpi-val-purple">${Object.keys(d.roomBreakdown||{}).length} rooms</div>
<div class="kpi-sub">Click for details</div>
</div>
<div class="kpi-arrow"><i class="fas fa-chevron-right"></i></div>
</div>
<div class="kpi-card kpi-clickable" onclick='openUserTypePanel("LIDAR First Pass","${label} Shift",${JSON.stringify(d.roomUserBreakdown||{})},"LIDAR","FP")'>
<div class="kpi-icon-wrap kpi-blue"><i class="fas fa-cube"></i></div>
<div class="kpi-body">
<div class="kpi-label">LIDAR First Pass</div>
<div class="kpi-val kpi-val-blue">${u.LIDAR?.FP||0}</div>
<div class="kpi-sub">labelers</div>
</div>
<div class="kpi-arrow"><i class="fas fa-chevron-right"></i></div>
</div>
<div class="kpi-card kpi-clickable" onclick='openUserTypePanel("LIDAR QA","${label} Shift",${JSON.stringify(d.roomUserBreakdown||{})},"LIDAR","QA")'>
<div class="kpi-icon-wrap kpi-green"><i class="fas fa-cube"></i></div>
<div class="kpi-body">
<div class="kpi-label">LIDAR QA</div>
<div class="kpi-val kpi-val-green">${u.LIDAR?.QA||0}</div>
<div class="kpi-sub">labelers</div>
</div>
<div class="kpi-arrow"><i class="fas fa-chevron-right"></i></div>
</div>
<div class="kpi-card kpi-clickable" onclick='openUserTypePanel("Lane Line First Pass","${label} Shift",${JSON.stringify(d.roomUserBreakdown||{})},"LaneLine","FP")'>
<div class="kpi-icon-wrap kpi-purple"><i class="fas fa-road"></i></div>
<div class="kpi-body">
<div class="kpi-label">Lane Line First Pass</div>
<div class="kpi-val kpi-val-purple">${u.LaneLine?.FP||0}</div>
<div class="kpi-sub">labelers</div>
</div>
<div class="kpi-arrow"><i class="fas fa-chevron-right"></i></div>
</div>
<div class="kpi-card kpi-clickable" onclick='openUserTypePanel("Lane Line QA","${label} Shift",${JSON.stringify(d.roomUserBreakdown||{})},"LaneLine","QA")'>
<div class="kpi-icon-wrap kpi-yellow"><i class="fas fa-road"></i></div>
<div class="kpi-body">
<div class="kpi-label">Lane Line QA</div>
<div class="kpi-val kpi-val-yellow">${u.LaneLine?.QA||0}</div>
<div class="kpi-sub">labelers</div>
</div>
<div class="kpi-arrow"><i class="fas fa-chevron-right"></i></div>
</div>
<div class="kpi-card kpi-clickable" onclick='openQcShiftPanel("${label} Shift","${shift}","${fmtDate(D.datePicker.value)}")'>
<div class="kpi-icon-wrap kpi-purple"><i class="fas fa-user-tie"></i></div>
<div class="kpi-body">
<div class="kpi-label">QC Breakdown</div>
<div class="kpi-val kpi-val-purple">${d.qcCount||0} QCs</div>
<div class="kpi-sub">Click for details</div>
</div>
<div class="kpi-arrow"><i class="fas fa-chevron-right"></i></div>
</div>
</div>
</div>`;
console.log('✅ Shift Supervisor view rendered successfully');
}
function ringHTML(pct) {
const r    = 44;
const circ = 2*Math.PI*r;
const off  = circ - (pct/100)*circ;
return `
<div class="ring-box">
<svg class="ring-svg" viewBox="0 0 100 100">
<circle class="ring-track" cx="50" cy="50" r="${r}"/>
<circle class="ring-fill" cx="50" cy="50" r="${r}"
style="stroke-dasharray:${circ.toFixed(1)};stroke-dashoffset:${off.toFixed(1)}"/>
</svg>
<div class="ring-center"><span class="ring-pct">${pct}%</span><span class="ring-lbl">Done</span></div>
</div>`;
}
/* ================================================
BREAKDOWN PANEL
================================================ */
function openPanel(title, sub, htmlContent) {
openCenterModal(title, sub, htmlContent);
}
function closePanel() {
closeCenterModal();
}
/* Center Modal System */
function openCenterModal(title, sub, htmlContent) {
let modal = document.getElementById('centerModal');
let mask = document.getElementById('centerModalMask');
if (!modal) {
const modalHTML = `
<div id="centerModalMask" class="qc-modal-mask" onclick="closeCenterModal()"></div>
<div id="centerModal" class="qc-modal">
<div class="qc-modal-header">
<div>
<p id="centerModalSub" class="qc-modal-sub"></p>
<h2 id="centerModalTitle" class="qc-modal-title"></h2>
</div>
<button class="qc-modal-close" onclick="closeCenterModal()"><i class="fas fa-xmark"></i></button>
</div>
<div id="centerModalContent" class="qc-modal-content"></div>
</div>`;
document.body.insertAdjacentHTML('beforeend', modalHTML);
modal = document.getElementById('centerModal');
mask = document.getElementById('centerModalMask');
}
document.getElementById('centerModalTitle').textContent = title;
document.getElementById('centerModalSub').textContent = sub || '';
document.getElementById('centerModalContent').innerHTML = typeof htmlContent === 'string' ? htmlContent
: '<div class="qc-modal-spin"><div class="spin-ring"></div></div>';
modal.classList.add('open');
mask.classList.add('open');
document.body.style.overflow = 'hidden';
}
function closeCenterModal() {
const modal = document.getElementById('centerModal');
const mask = document.getElementById('centerModalMask');
if (modal) modal.classList.remove('open');
if (mask) mask.classList.remove('open');
document.body.style.overflow = '';
}
/* NEW: Pending breakdown by room */
function openPendingPanel(roomBreakdown, totalPending, pendingByTeam, pendingUsers) {
// Room breakdown section
const roomRows = Object.entries(roomBreakdown).map(([room, r]) => {
if ((r.pending || 0) <= 0) return '';
return `
<div class="br-row room-detail-row">
<div class="room-detail-main">
<span class="br-label"><i class="fas fa-door-open"></i>${room}</span>
<span class="br-pill pill-red">${r.pending || 0} pending</span>
</div>
<div class="room-detail-stats">
<span class="br-pill pill-green"><i class="fas fa-user-check"></i>${r.active || 0} active</span>
<span class="br-pill pill-blue"><i class="fas fa-check"></i>${r.submitted || 0} done</span>
</div>
</div>`;
}).join('');
// Team breakdown section (NEW)
let teamRows = '';
if (pendingByTeam && Object.keys(pendingByTeam).length > 0) {
teamRows = Object.entries(pendingByTeam).map(([team, data]) => {
const userList = data.users.map(u =>
`<span class="pending-user-chip">${esc(u)}</span>`
).join('');
return `
<div class="br-row team-pending-row">
<div class="team-pending-header">
<span class="br-label"><i class="fas fa-user-tie"></i>${esc(team)}</span>
<span class="br-pill pill-red">${data.count} pending</span>
</div>
<div class="pending-users-list">
${userList}
</div>
</div>`;
}).join('');
}
// Individual pending users list (NEW)
let userRows = '';
if (pendingUsers && pendingUsers.length > 0) {
userRows = pendingUsers.map((u, i) => `
<div class="br-row" style="animation-delay:${i * 30}ms">
<div style="display:flex;align-items:center;gap:12px;flex:1;">
<div style="width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,var(--red),var(--yellow));display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff;flex-shrink:0;">${u.email[0].toUpperCase()}</div>
<div>
<div style="font-size:13px;font-weight:600;color:var(--t-1);">${esc(u.email)}</div>
<div style="font-size:11px;color:var(--t-4);display:flex;align-items:center;gap:6px;margin-top:2px;">
<i class="fas fa-desktop" style="font-size:10px;"></i>${esc(u.pc || 'N/A')}
<span style="color:var(--br-2)">|</span>
<i class="fas fa-user-tie" style="font-size:10px;"></i>${esc(u.team || 'Unknown')}
</div>
</div>
</div>
<span class="br-pill pill-red"><i class="fas fa-hourglass"></i> Pending</span>
</div>
`).join('');
}
const totalActiveCount = totalPending + (roomBreakdown ? Object.values(roomBreakdown).reduce((sum, r) => sum + (r.submitted || 0), 0) : 0);
const html = `
<div class="br-summary-card">
<div class="br-summary-row">
<span class="brs-label">Total Pending</span>
<span class="brs-val c-red">${totalPending}</span>
</div>
<div class="br-summary-row">
<span class="brs-label">Total Active</span>
<span class="brs-val">${totalActiveCount}</span>
</div>
</div>
${teamRows ? `
<div class="br-section" style="margin-top:20px">Pending by Team (QC)</div>
${teamRows}
` : ''}
<div class="br-section" style="margin-top:20px">Pending by Room</div>
${roomRows || '<p class="br-empty">No pending users by room.</p>'}
${userRows ? `
<div class="br-section" style="margin-top:20px">All Pending Users (${pendingUsers.length})</div>
${userRows}
` : ''}`;
openPanel('Pending Breakdown', 'By Team & Room', html);
}
/* NEW: QC Shift Modal */
async function openQcShiftPanel(label, shift, date) {
if (!document.getElementById('qcModal')) {
const modalHTML = `
<div id="qcModalMask" class="qc-modal-mask" onclick="closeQcModal()"></div>
<div id="qcModal" class="qc-modal">
<div class="qc-modal-header">
<div>
<p id="qcModalSub" class="qc-modal-sub"></p>
<h2 id="qcModalTitle" class="qc-modal-title">QC Breakdown</h2>
</div>
<button class="qc-modal-close" onclick="closeQcModal()"><i class="fas fa-xmark"></i></button>
</div>
<div id="qcModalContent" class="qc-modal-content">
<div class="qc-modal-spin"><div class="spin-ring"></div></div>
</div>
</div>`;
document.body.insertAdjacentHTML('beforeend', modalHTML);
}
const modal = document.getElementById('qcModal');
const mask = document.getElementById('qcModalMask');
const title = document.getElementById('qcModalTitle');
const sub = document.getElementById('qcModalSub');
const content = document.getElementById('qcModalContent');
title.textContent = 'QC Breakdown';
sub.textContent = label + ' • ' + date;
content.innerHTML = '<div class="qc-modal-spin"><div class="spin-ring"></div></div>';
modal.classList.add('open');
mask.classList.add('open');
document.body.style.overflow = 'hidden';
try {
const d = await api({action:'qcShiftBreakdown',shift,date}, 'qcshift_'+shift+'_'+date, 0);
if (!d.success) throw new Error(d.error || 'Failed');
const qcs = d.qcs || {};
const qcNames = Object.keys(qcs);
if (qcNames.length === 0) {
content.innerHTML = '<div class="qc-empty"><i class="fas fa-inbox"></i><p>No QC data found.</p></div>';
return;
}
let totalTasks = 0, totalLabelers = 0;
let totalLidarFP = 0, totalLidarQA = 0, totalLaneFP = 0, totalLaneQA = 0;
const qcCards = qcNames.map(qc => {
const q = qcs[qc];
totalTasks += q.total;
totalLabelers += q.uniqueUsers;
totalLidarFP += q.LIDAR?.FP || 0;
totalLidarQA += q.LIDAR?.QA || 0;
totalLaneFP += q.LaneLine?.FP || 0;
totalLaneQA += q.LaneLine?.QA || 0;
return `
<div class="qc-card">
<div class="qc-card-header">
<div class="qc-avatar">${qc[0].toUpperCase()}</div>
<div class="qc-info">
<div class="qc-name">${esc(qc)}</div>
<div class="qc-meta">${q.total} tasks • ${q.uniqueUsers} labelers</div>
</div>
</div>
<div class="qc-task-grid">
<div class="qc-task-item lidar-fp">
<span class="qc-task-label">LIDAR FP</span>
<span class="qc-task-val">${q.LIDAR?.FP || 0}</span>
</div>
<div class="qc-task-item lidar-qa">
<span class="qc-task-label">LIDAR QA</span>
<span class="qc-task-val">${q.LIDAR?.QA || 0}</span>
</div>
<div class="qc-task-item lane-fp">
<span class="qc-task-label">LaneLine FP</span>
<span class="qc-task-val">${q.LaneLine?.FP || 0}</span>
</div>
<div class="qc-task-item lane-qa">
<span class="qc-task-label">LaneLine QA</span>
<span class="qc-task-val">${q.LaneLine?.QA || 0}</span>
</div>
</div>
${Object.keys(q.other || {}).length ? `
<div class="qc-other">
${Object.entries(q.other).map(([k,v]) => `<span class="qc-other-badge">${k}: ${v}</span>`).join('')}
</div>` : ''}
</div>`;
}).join('');
content.innerHTML = `
<div class="qc-summary-bar">
<div class="qc-sum-item">
<span class="qc-sum-label">Total Tasks</span>
<span class="qc-sum-val">${totalTasks}</span>
</div>
<div class="qc-sum-item">
<span class="qc-sum-label">Total Labelers</span>
<span class="qc-sum-val">${totalLabelers}</span>
</div>
<div class="qc-sum-item">
<span class="qc-sum-label">LIDAR FP</span>
<span class="qc-sum-val blue">${totalLidarFP}</span>
</div>
<div class="qc-sum-item">
<span class="qc-sum-label">LIDAR QA</span>
<span class="qc-sum-val green">${totalLidarQA}</span>
</div>
<div class="qc-sum-item">
<span class="qc-sum-label">LaneLine FP</span>
<span class="qc-sum-val purple">${totalLaneFP}</span>
</div>
<div class="qc-sum-item">
<span class="qc-sum-label">LaneLine QA</span>
<span class="qc-sum-val yellow">${totalLaneQA}</span>
</div>
</div>
<div class="qc-cards-grid">
${qcCards}
</div>`;
} catch(e) {
content.innerHTML = `<div class="qc-empty"><i class="fas fa-triangle-exclamation"></i><p>${e.message}</p></div>`;
}
}
function closeQcModal() {
const modal = document.getElementById('qcModal');
const mask = document.getElementById('qcModalMask');
if (modal) modal.classList.remove('open');
if (mask) mask.classList.remove('open');
document.body.style.overflow = '';
}
/* NEW: User type breakdown by room */
function openUserTypePanel(title, sub, roomUserBreakdown, modality, pass) {
const roomRows = Object.entries(roomUserBreakdown).map(([room, r]) => {
let count = 0;
if (modality === 'LIDAR' && pass === 'FP') count = r.LIDAR?.FP || 0;
else if (modality === 'LIDAR' && pass === 'QA') count = r.LIDAR?.QA || 0;
else if (modality === 'LaneLine' && pass === 'FP') count = r.LaneLine?.FP || 0;
else if (modality === 'LaneLine' && pass === 'QA') count = r.LaneLine?.QA || 0;
if (count <= 0) return '';
return `
<div class="br-row room-detail-row">
<div class="room-detail-main">
<span class="br-label"><i class="fas fa-door-open"></i>${room}</span>
<span class="br-pill pill-blue">${count} labelers</span>
</div>
<div class="room-detail-stats">
<span class="br-pill pill-green"><i class="fas fa-cube"></i>LIDAR FP: ${r.LIDAR?.FP || 0}</span>
<span class="br-pill pill-green"><i class="fas fa-cube"></i>LIDAR QA: ${r.LIDAR?.QA || 0}</span>
<span class="br-pill pill-purple"><i class="fas fa-road"></i>LaneLine FP: ${r.LaneLine?.FP || 0}</span>
<span class="br-pill pill-yellow"><i class="fas fa-road"></i>LaneLine QA: ${r.LaneLine?.QA || 0}</span>
</div>
</div>`;
}).join('');
const totalCount = Object.values(roomUserBreakdown).reduce((sum, r) => {
if (modality === 'LIDAR' && pass === 'FP') return sum + (r.LIDAR?.FP || 0);
if (modality === 'LIDAR' && pass === 'QA') return sum + (r.LIDAR?.QA || 0);
if (modality === 'LaneLine' && pass === 'FP') return sum + (r.LaneLine?.FP || 0);
if (modality === 'LaneLine' && pass === 'QA') return sum + (r.LaneLine?.QA || 0);
return sum;
}, 0);
const html = `
<div class="br-summary-card">
<div class="br-summary-row">
<span class="brs-label">Total ${title} Labelers</span>
<span class="brs-val">${totalCount}</span>
</div>
</div>
<div class="br-section" style="margin-top:20px">Labelers by Room</div>
${roomRows || '<p class="br-empty">No labelers for this type.</p>'}`;
openPanel(title, sub, html);
}
/* Supervisor location breakdown */
async function openSupervisorPanel(locName) {
openCenterModal('Location Breakdown', locName, '<div class="qc-modal-spin"><div class="spin-ring"></div></div>');
const date = fmtDate(D.datePicker.value);
try {
const d = await api({action:'supervisorBreakdown',date},'supbr_'+date, 0);
if (!d.success) throw new Error(d.error);
const loc = (d.locations||{})[locName];
if (!loc) { document.getElementById('centerModalContent').innerHTML='<p class="br-empty">No data for this location.</p>'; return; }
const t = loc.tasks||{};
const teamRows = Object.entries(loc.teams||{}).map(([tn,tm])=>`
<div class="br-row">
<span class="br-label"><i class="fas fa-user-tie"></i>${tn}</span>
<span class="br-pill pill-green">${tm.submitted} done</span>
<span class="br-pill pill-red">${tm.pending} pending</span>
</div>`).join('');
const html = `
<div class="br-summary-card">
<div class="br-summary-row">
<span class="brs-label">Total Active</span><span class="brs-val">${loc.total}</span>
</div>
<div class="br-summary-row">
<span class="brs-label">Submitted</span><span class="brs-val c-green">${loc.submitted}</span>
</div>
<div class="br-summary-row">
<span class="brs-label">Pending</span><span class="brs-val c-red">${loc.pending}</span>
</div>
</div>
<div class="br-section" style="margin-top:20px">Teams</div>
${teamRows||'<p class="br-empty">No team data.</p>'}
<div class="br-section" style="margin-top:20px">Task Breakdown</div>
<div class="br-task-grid">
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
${Object.keys(t.other||{}).length?`
<div class="br-section" style="margin-top:16px">Other Tasks</div>
${Object.entries(t.other).map(([k,v])=>`<div class="br-row"><span class="br-label">${k}</span><span class="br-pill pill-yellow">${v}</span></div>`).join('')}
`:''}`;
const content = document.getElementById('centerModalContent');
if (content) content.innerHTML = html;
} catch(e) {
const content = document.getElementById('centerModalContent');
if (content) content.innerHTML = `<div class="err-simple">${e.message}</div>`;
}
}
/* NEW: Supervisor Room Breakdown */
async function openRoomPanel(roomName) {
openCenterModal('Room Task Breakdown', roomName, '<div class="qc-modal-spin"><div class="spin-ring"></div></div>');
const date = fmtDate(D.datePicker.value);
try {
const d = await api({action:'supervisorRoomBreakdown',room:roomName,date},'roombr_'+roomName.replace(/\s+/g,'_')+'_'+date, 0);
if (!d.success) throw new Error(d.error);
const teamRows = Object.entries(d.teams||{}).map(([tn,tm])=>`
<div class="br-row">
<span class="br-label"><i class="fas fa-user-tie"></i>${tn}</span>
<span class="br-pill pill-blue">${tm.total} total</span>
<span class="br-pill pill-green">${(tm.LIDAR?.FP||0)+(tm.LaneLine?.FP||0)} FP</span>
<span class="br-pill pill-yellow">${(tm.LIDAR?.QA||0)+(tm.LaneLine?.QA||0)} QA</span>
</div>
<div class="br-task-mini">
<div class="br-mini-row"><span>LIDAR FP</span><strong>${tm.LIDAR?.FP||0}</strong></div>
<div class="br-mini-row"><span>LIDAR QA</span><strong>${tm.LIDAR?.QA||0}</strong></div>
<div class="br-mini-row"><span>LaneLine FP</span><strong>${tm.LaneLine?.FP||0}</strong></div>
<div class="br-mini-row"><span>LaneLine QA</span><strong>${tm.LaneLine?.QA||0}</strong></div>
</div>
`).join('');
const html = `
<div class="br-summary-card">
<div class="br-summary-row">
<span class="brs-label">Total Tasks</span><span class="brs-val">${d.totalTasks||0}</span>
</div>
<div class="br-summary-row">
<span class="brs-label">Unique Labelers</span><span class="brs-val">${d.uniqueLabelers||0}</span>
</div>
</div>
<div class="br-section" style="margin-top:20px">Overall Task Breakdown</div>
<div class="br-task-grid">
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
<div class="br-section" style="margin-top:16px">Other Tasks</div>
${Object.entries(d.other).map(([k,v])=>`<div class="br-row"><span class="br-label">${k}</span><span class="br-pill pill-yellow">${v}</span></div>`).join('')}
`:''}
<div class="br-section" style="margin-top:20px">Team Breakdown</div>
${teamRows||'<p class="br-empty">No team data.</p>'}`;
const content = document.getElementById('centerModalContent');
if (content) content.innerHTML = html;
} catch(e) {
const content = document.getElementById('centerModalContent');
if (content) content.innerHTML = `<div class="err-simple">${e.message}</div>`;
}
}
/* QC task breakdown */
async function openQcPanel(qtcName) {
openCenterModal('Task Breakdown', qtcName, '<div class="qc-modal-spin"><div class="spin-ring"></div></div>');
const date = fmtDate(D.datePicker.value);
const key  = 'qcbr_'+qtcName.replace(/\s+/g,'_')+'_'+date;
try {
const d = await api({action:'qcBreakdown',qtcName,date}, key, 0);
if (!d.success) throw new Error(d.error);
const html = `
<div class="br-summary-card">
<div class="br-summary-row">
<span class="brs-label">Total Tasks</span><span class="brs-val">${d.totalTasks}</span>
</div>
<div class="br-summary-row">
<span class="brs-label">Unique Labelers</span><span class="brs-val">${d.uniqueLabelers}</span>
</div>
</div>
<div class="br-task-grid" style="margin-top:20px">
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
const content = document.getElementById('centerModalContent');
if (content) content.innerHTML = html;
} catch(e) {
const content = document.getElementById('centerModalContent');
if (content) content.innerHTML = `<div class="err-simple">${e.message}</div>`;
}
}
/* ================================================
FILTERS & SEARCH
================================================ */
function rebuildFilters() {
const shifts=new Set(), locs=new Set();
const data = S.filtered;
Object.keys(data).forEach(s=>{ shifts.add(s); Object.keys(data[s]).forEach(l=>locs.add(l)); });
Object.keys(CONFIG.LOCATION_GROUPS).forEach(g=>locs.add(g));
const curS=D.shiftFilter.value, curL=D.locFilter.value;
D.shiftFilter.innerHTML='<option value="all">All Shifts</option>';
Array.from(shifts).sort().forEach(s=>{
const o=document.createElement('option');
o.value=s; o.textContent=CONFIG.SHIFT_LABELS[s]||'Shift '+s;
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
function handleSearch() {
S.search = D.searchInput.value.toLowerCase().trim();
renderDashboard();
}
function matches(email, pc) {
if (!S.search) return true;
return email.toLowerCase().includes(S.search)||String(pc).toLowerCase().includes(S.search);
}
/* ================================================
RENDER DASHBOARD
================================================ */
function renderDashboard() {
const selShift = D.shiftFilter.value;
const selLoc   = D.locFilter.value;
const data     = S.filtered;
const userRoleLower = (S.user?.role || '').toLowerCase();
const isSup    = userRoleLower === 'supervisor' || userRoleLower === 'supervisors' || S.user?.role===CONFIG.ROLES.SUPERVISOR;
const isQC     = userRoleLower === 'qc' || S.user?.role===CONFIG.ROLES.QC;
D.mainContent.innerHTML='';
if (!Object.keys(data).length) {
renderEmpty(D.mainContent, isQC ? 'No data found for your team today.' : 'No data available.'); return;
}
let animIdx=0;
for (const [shift,locs] of Object.entries(data)) {
if (selShift!=='all'&&shift!==selShift) continue;
const wrapper=document.createElement('div');
wrapper.className='shift-block';
wrapper.innerHTML=`<div class="shift-badge"><i class="fas fa-clock"></i>${CONFIG.SHIFT_LABELS[shift]||shift} Shift</div>`;
const rendered=new Set();
Object.keys(CONFIG.LOCATION_GROUPS).forEach(grp=>{
if (selLoc!=='all'&&selLoc!==grp) return;
const members=(CONFIG.LOCATION_GROUPS[grp]||[]).filter(r=>locs[r]);
if (!members.length) return;
wrapper.appendChild(buildGroupSection(grp,shift,locs,members,animIdx++,isSup,isQC));
members.forEach(m=>rendered.add(m));
});
for (const [loc,teams] of Object.entries(locs)) {
if (selLoc!=='all'&&selLoc!==loc) continue;
if (rendered.has(loc)) continue;
wrapper.appendChild(buildLocSection(loc,teams,shift,animIdx++,isSup,isQC));
}
D.mainContent.appendChild(wrapper);
}
}
function buildGroupSection(grpName,shift,allLocs,members,idx,isSup,isQC) {
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
const sub=document.createElement('div');
sub.className='room-block';
sub.innerHTML=`<div class="room-header ${isSup?'clickable':''}" ${isSup?`onclick="openRoomPanel('${esc(r)}')"`:''}>
<i class="fas fa-door-open"></i><span>${r}</span>
${isSup?'<i class="fas fa-chart-bar room-bd-ic"></i>':''}
</div>`;
sub.appendChild(buildTeamsGrid(roomData[r],shift,r,i,isSup,isQC));
roomsWrap.appendChild(sub);
});
sec.appendChild(roomsWrap);
return sec;
}
function buildLocSection(loc,teams,shift,idx,isSup,isQC) {
let s=0,n=0;
Object.values(teams).forEach(t=>{ s+=t.submitted.length; n+=t.notSubmitted.length; });
const total=s+n, pct=total?Math.round((s/total)*100):0;
const sec=document.createElement('div');
sec.className='loc-section'; sec.style.animationDelay=(idx*CONFIG.ANIMATION_STAGGER_DELAY)+'ms';
sec.innerHTML=`
<div class="loc-header ${isSup?'clickable':''}" ${isSup?`onclick="openSupervisorPanel('${esc(loc)}')"`:''}>
<div class="loc-icon-wrap"><i class="fas fa-map-marker-alt"></i></div>
<div class="loc-title-wrap">
<h2 class="loc-name">${loc}</h2>
${isSup?'<span class="loc-bd-hint"><i class="fas fa-chart-bar"></i> View Breakdown</span>':''}
</div>
</div>
${heroStats(s,n,total,pct)}`;
sec.appendChild(buildTeamsGrid(teams,shift,loc,0,isSup,isQC));
return sec;
}
function heroStats(sub,pend,total,pct) {
const r=40, circ=(2*Math.PI*r).toFixed(1), off=(circ-(pct/100)*circ).toFixed(1);
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
function buildTeamsGrid(teams,shift,loc,roomIdx,isSup,isQC) {
const grid=document.createElement('div');
grid.className='teams-grid';
let cardIdx=0;
for (const [tl,td] of Object.entries(teams)) {
const id  = ('tc-'+shift+'-'+loc+'-'+tl).replace(/\s+/g,'-');
const fSub  = td.submitted.filter(u=>matches(u.email,u.pc));
const fPend = td.notSubmitted.filter(u=>matches(u.email,u.pc));
if (S.search&&!fSub.length&&!fPend.length) continue;
const isOpen=S.openTeams.has(id)?'open':'';
const delay =(roomIdx+1)*50+(++cardIdx)*50;
const bdBtn = isQC
? `<button class="tl-bd-btn" onclick="event.stopPropagation();openQcPanel('${esc(tl)}')" title="Task breakdown"><i class="fas fa-chart-bar"></i></button>`
: isSup
? `<button class="tl-bd-btn" onclick="event.stopPropagation();openSupervisorPanel('${esc(loc)}')" title="Location breakdown"><i class="fas fa-chart-bar"></i></button>`
: '';
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
${fPend.length ? fPend.map((u,i)=>userCard(u,'pend',i)).join('') : '<div class="col-empty">All clear ✓</div>'}
</div>
<div class="col-wrap">
<div class="col-head done-head"><i class="fas fa-check-double"></i>Submitted<span class="col-cnt">${fSub.length}</span></div>
${fSub.length ? fSub.map((u,i)=>userCard(u,'done',i)).join('') : '<div class="col-empty">None yet</div>'}
</div>
</div>
</div>`;
grid.appendChild(card);
}
return grid;
}
function toggleTeam(id) {
const c=document.getElementById(id); if(!c) return;
c.classList.toggle('open');
c.querySelector('.chevron')?.classList.toggle('open');
if (c.classList.contains('open')) S.openTeams.add(id); else S.openTeams.delete(id);
}
function userCard(u,type,idx) {
return `<div class="user-card uc-${type}" style="animation-delay:${idx*30}ms">
<div class="uc-email">${esc(u.email)}</div>
<div class="uc-pc"><i class="fas fa-desktop"></i>${esc(u.pc)}</div>
</div>`;
}
/* ================================================
STATE RENDERERS
================================================ */
function renderLoader(el) {
el.innerHTML=`<div class="page-loader"><div class="spin-ring"></div><p>Loading data…</p></div>`;
}
function renderEmpty(el,msg) {
el.innerHTML=`<div class="page-empty"><i class="fas fa-inbox"></i><p>${msg}</p>
<button class="retry-btn" onclick="manualRefresh()"><i class="fas fa-rotate"></i> Retry</button></div>`;
}
function renderError(el,e) {
const msg=e.name==='AbortError'?'Request timed out. Try again.':e.message||'Connection error';
el.innerHTML=`<div class="page-error"><i class="fas fa-triangle-exclamation"></i>
<h3>Connection Error</h3><p>${msg}</p>
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
function esc(s){ const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }
/* ================================================
BOOT
================================================ */
document.addEventListener('DOMContentLoaded', async ()=>{
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
console.log('🚀 App initialized, loading users...');
await loadUsers();
console.log('Users loaded:', S.users.length);
});
