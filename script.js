/**
 * ============================================
 * SCRIPT.JS  v2.0  —  Application Engine
 * No Demo Mode | Client Cache | Role Views
 * ============================================
 * Depends on: config.js  (loaded first via defer)
 */

/* ── State ── */
const state = {
  rawData:       {},
  filteredData:  {},
  openTeams:     new Set(),
  searchTerm:    '',
  lastDataHash:  '',
  isFirstLoad:   true,
  isLoading:     false,
  lastError:     null,
  currentUser:   null,
  usersData:     [],
  isLoggedIn:    false,
  // client-side cache
  _cache:        {},
  _cacheTime:    {}
};

/* ── DOM cache ── */
const el = {};

/* ══════════════════════════════════════════
   CLIENT-SIDE CACHE
══════════════════════════════════════════ */
function cacheGet(key) {
  const ttl = CONFIG.CLIENT_CACHE_TTL || 25000;
  const ts  = state._cacheTime[key];
  if (ts && (Date.now() - ts) < ttl) return state._cache[key];
  return null;
}
function cacheSet(key, val) {
  state._cache[key]     = val;
  state._cacheTime[key] = Date.now();
}
function cacheClear(prefix) {
  Object.keys(state._cache).forEach(k => {
    if (!prefix || k.startsWith(prefix)) {
      delete state._cache[k];
      delete state._cacheTime[k];
    }
  });
}

/* ══════════════════════════════════════════
   API HELPERS
══════════════════════════════════════════ */
async function apiFetch(params, cacheKey) {
  if (cacheKey) {
    const hit = cacheGet(cacheKey);
    if (hit) return hit;
  }

  const url = CONFIG.API_URL + '?' + new URLSearchParams(params).toString();
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), CONFIG.REQUEST_TIMEOUT);

  try {
    const res  = await fetch(url, { signal: ctrl.signal, mode: 'cors' });
    clearTimeout(tid);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (cacheKey) cacheSet(cacheKey, data);
    return data;
  } catch (e) {
    clearTimeout(tid);
    throw e;
  }
}

/* ══════════════════════════════════════════
   LOGIN
══════════════════════════════════════════ */
async function loadLoginUsers() {
  try {
    const data = await apiFetch({ action: 'users' }, 'users_60s');
    if (data.success && data.users && data.users.length) {
      state.usersData = data.users;
    }
  } catch (e) {
    console.warn('Could not load users from sheet:', e.message);
  }
}

function handleLogin(event) {
  event.preventDefault();
  const username   = document.getElementById('username').value.trim();
  const password   = document.getElementById('password').value.trim();
  const errDiv     = document.getElementById('loginError');
  const loginBtn   = document.getElementById('loginBtn');
  const loginLoad  = document.getElementById('loginLoading');

  loginBtn.style.display  = 'none';
  loginLoad.style.display = 'flex';
  errDiv.style.display    = 'none';

  if (!state.usersData.length) {
    showLoginError(errDiv, loginBtn, loginLoad, 'No users loaded. Check your connection.');
    return;
  }

  const user = state.usersData.find(u =>
    u.username.toLowerCase() === username.toLowerCase() &&
    u.password === password
  );

  if (user) {
    state.currentUser = user;
    state.isLoggedIn  = true;
    document.getElementById('loginOverlay').style.display = 'none';
    showUserBadge(user);
    initApp();
  } else {
    showLoginError(errDiv, loginBtn, loginLoad, 'Invalid username or password');
  }
}

function showLoginError(errDiv, loginBtn, loginLoad, msg) {
  errDiv.innerHTML        = `<i class="fas fa-exclamation-circle"></i><span>${msg}</span>`;
  errDiv.style.display    = 'flex';
  loginBtn.style.display  = 'flex';
  loginLoad.style.display = 'none';
}

function showUserBadge(user) {
  const roleMap = {
    supervisors:      'SUPERVISOR',
    shiftSupervisor:  'SHIFT SUPERVISOR',
    Qc:               'QC'
  };
  const classMap = {
    supervisors:      'supervisor',
    shiftSupervisor:  'shift-supervisor',
    Qc:               'qc'
  };
  document.getElementById('userNameDisplay').textContent = user.username;
  const roleEl = document.getElementById('userRoleDisplay');
  roleEl.textContent = roleMap[user.role] || user.role;
  roleEl.className   = 'user-role ' + (classMap[user.role] || '');
  document.getElementById('userInfo').style.display = 'flex';
}

function handleLogout() {
  state.currentUser  = null;
  state.isLoggedIn   = false;
  state.rawData      = {};
  state.filteredData = {};
  state.isFirstLoad  = true;
  cacheClear();

  ['shiftFilter','locFilter','searchInput'].forEach(id => {
    const e = document.getElementById(id);
    if (e) e.value = '';
  });
  state.searchTerm = '';

  document.getElementById('userInfo').style.display       = 'none';
  document.getElementById('loginOverlay').style.display   = 'flex';
  document.getElementById('loginLoading').style.display   = 'none';
  document.getElementById('loginBtn').style.display       = 'flex';
  document.getElementById('loginError').style.display     = 'none';
  document.getElementById('username').value               = '';
  document.getElementById('password').value               = '';
  document.getElementById('shiftSupervisorView').style.display = 'none';
  el.contentArea.innerHTML = '';
}

/* ══════════════════════════════════════════
   INIT
══════════════════════════════════════════ */
async function initApp() {
  updateStatus('loading');

  el.contentArea    = document.getElementById('contentArea');
  el.shiftFilter    = document.getElementById('shiftFilter');
  el.locFilter      = document.getElementById('locFilter');
  el.datePicker     = document.getElementById('datePicker');
  el.searchInput    = document.getElementById('searchInput');
  el.silentUpdate   = document.getElementById('silentUpdate');
  el.statusIndicator = document.getElementById('statusIndicator');
  el.statusDot      = document.getElementById('statusDot');
  el.statusText     = document.getElementById('statusText');

  el.datePicker.value = new Date().toISOString().split('T')[0];

  const user = state.currentUser;
  const role = user ? user.role : '';

  if (role === CONFIG.ROLES.SHIFT_SUPERVISOR) {
    await loadShiftSupervisorView();
    setInterval(() => loadShiftSupervisorView(true), CONFIG.REFRESH_INTERVAL);
  } else {
    fetchData(true);
    setInterval(() => fetchData(false), CONFIG.REFRESH_INTERVAL);
  }

  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      el.searchInput && el.searchInput.focus();
    }
    if (e.key === 'Escape') closePanel();
  });
}

/* ══════════════════════════════════════════
   STATUS INDICATOR
══════════════════════════════════════════ */
function updateStatus(status) {
  const labels = { live:'LIVE', error:'ERROR', loading:'CONNECTING…' };
  el.statusIndicator.className = 'status-indicator ' + status;
  el.statusDot.className       = 'status-dot ' + status + '-dot';
  el.statusText.textContent    = labels[status] || 'CONNECTING…';
}

/* ══════════════════════════════════════════
   DATA FETCHING  (supervisor / QC view)
══════════════════════════════════════════ */
async function fetchData(showLoader, isManual) {
  if (state.isLoading && !isManual) return;

  const date     = formatDateForAPI(el.datePicker.value);
  const cacheKey = 'dash_' + date;

  try {
    state.isLoading = true;
    if (showLoader) renderLoader();

    const json    = await apiFetch({ date }, cacheKey);
    const newData = json.data || {};

    if (!Object.keys(newData).length) {
      renderEmpty('No data found for ' + date + '. Make sure the date is correct and the sync is running.');
      updateStatus('error');
      return;
    }

    state.rawData     = newData;
    state.filteredData = filterByUser(newData);
    updateStatus('live');

    const hash = hashData(state.filteredData);
    if (hash !== state.lastDataHash || showLoader || isManual) {
      state.lastDataHash = hash;
      updateFilters();
      renderData();
      if (!showLoader && !isManual) showSilentToast();
    }

    state.lastError  = null;
    state.isFirstLoad = false;

  } catch (e) {
    state.lastError = e.message;
    updateStatus('error');
    renderError(e);
  } finally {
    state.isLoading = false;
  }
}

function manualRefresh() {
  cacheClear('dash_');
  cacheClear('supbr_');
  const user = state.currentUser;
  if (user && user.role === CONFIG.ROLES.SHIFT_SUPERVISOR) {
    cacheClear('ss_');
    loadShiftSupervisorView(true);
  } else {
    fetchData(true, true);
  }
}

/* ══════════════════════════════════════════
   PERMISSION FILTER
══════════════════════════════════════════ */
function filterByUser(data) {
  const user = state.currentUser;
  if (!user) return data;
  if (user.role === CONFIG.ROLES.SUPERVISOR) return data;

  if (user.role === CONFIG.ROLES.QC || user.permission === 'only') {
    const out = {};
    for (const [shift, locs] of Object.entries(data)) {
      for (const [loc, teams] of Object.entries(locs)) {
        for (const [tn, td] of Object.entries(teams)) {
          const base = tn.replace(/\s*\([A-Z]{1,3}\)\s*$/, '').trim();
          if (base === user.username || tn === user.username) {
            if (!out[shift])          out[shift]       = {};
            if (!out[shift][loc])     out[shift][loc]  = {};
            out[shift][loc][tn]                        = td;
          }
        }
      }
    }
    return out;
  }

  return data;
}

/* ══════════════════════════════════════════
   SHIFT SUPERVISOR VIEW
══════════════════════════════════════════ */
async function loadShiftSupervisorView(silent) {
  const user  = state.currentUser;
  const shift = user.permission; // permission field holds "M", "N", or "ON"
  const date  = formatDateForAPI(el.datePicker ? el.datePicker.value : new Date().toISOString().split('T')[0]);

  if (!silent) {
    document.getElementById('shiftSupervisorView').style.display = 'block';
    document.getElementById('shiftSupervisorView').innerHTML =
      `<div class="ss-loader"><div class="spinner-ring"></div><p>Loading shift data…</p></div>`;
  }

  try {
    const cacheKey = 'ss_' + shift + '_' + date;
    const data = await apiFetch({ action: 'shiftSupervisor', shift, date }, cacheKey);

    if (!data.success) throw new Error(data.error || 'Failed to load shift data');

    renderShiftSupervisorView(data, shift);
    document.getElementById('contentArea').style.display = 'none';
    updateStatus('live');

  } catch (e) {
    document.getElementById('shiftSupervisorView').innerHTML =
      `<div class="error-simple"><i class="fas fa-exclamation-triangle"></i> ${e.message}</div>`;
    updateStatus('error');
  }
}

function renderShiftSupervisorView(d, shift) {
  const shiftLabel = CONFIG.SHIFT_LABELS[shift] || shift;
  const subPct  = d.tasks.totalSubmitted && d.totalActive
    ? Math.round((d.tasks.totalSubmitted / d.totalActive) * 100) : 0;

  const radius = 54;
  const circ   = 2 * Math.PI * radius;
  const offset = circ - (subPct / 100) * circ;

  // Training rows
  let trainingHTML = '';
  if (d.totalTraining > 0) {
    trainingHTML = `<div class="ss-training-row">`;
    for (const [lvl, cnt] of Object.entries(d.trainingByLevel || {})) {
      trainingHTML += `<span class="training-badge">${lvl}: ${cnt}</span>`;
    }
    trainingHTML += `</div>`;
  }

  // Room breakdown rows (for panel)
  const roomRows = Object.entries(d.roomBreakdown || {}).map(([room, r]) => `
    <div class="breakdown-row">
      <span class="br-label"><i class="fas fa-door-open"></i> ${room}</span>
      <span class="br-chip total">${r.total}</span>
      <span class="br-chip done">${r.submitted} done</span>
      <span class="br-chip pend">${r.pending} pending</span>
    </div>
  `).join('');

  // Task breakdown rows (for panel)
  const taskRows = `
    <div class="breakdown-section-title"><i class="fas fa-layer-group"></i> LIDAR</div>
    <div class="breakdown-row"><span class="br-label">First Pass</span><span class="br-chip total">${d.tasks.LIDAR.FP}</span></div>
    <div class="breakdown-row"><span class="br-label">QA</span><span class="br-chip done">${d.tasks.LIDAR.QA}</span></div>
    <div class="breakdown-section-title" style="margin-top:12px;"><i class="fas fa-road"></i> Lane Line</div>
    <div class="breakdown-row"><span class="br-label">First Pass</span><span class="br-chip total">${d.tasks.LaneLine.FP}</span></div>
    <div class="breakdown-row"><span class="br-label">QA</span><span class="br-chip done">${d.tasks.LaneLine.QA}</span></div>
  `;

  document.getElementById('shiftSupervisorView').innerHTML = `
    <div class="ss-view">
      <div class="ss-header">
        <div class="ss-shift-badge"><i class="fas fa-clock"></i> ${shiftLabel} Shift</div>
        <div class="ss-date" id="ssDatePicker">
          <input type="date" id="ssDate" value="${el.datePicker ? el.datePicker.value : ''}" onchange="onSSDateChange(this.value)">
        </div>
      </div>

      <div class="ss-kpi-grid">

        <!-- Total Active -->
        <div class="ss-kpi clickable" onclick='openRoomBreakdown(${JSON.stringify(roomRows)}, "${shiftLabel} — Active Users by Room")'>
          <div class="kpi-icon active-icon"><i class="fas fa-users"></i></div>
          <div class="kpi-body">
            <div class="kpi-label">Total Active Users</div>
            <div class="kpi-value accent-indigo">${d.totalActive}</div>
          </div>
          <div class="kpi-drill"><i class="fas fa-chevron-right"></i></div>
        </div>

        <!-- Submitted -->
        <div class="ss-kpi clickable" onclick='openTaskBreakdown(${JSON.stringify(taskRows)}, "${shiftLabel} — Task Breakdown")'>
          <div class="kpi-icon submitted-icon"><i class="fas fa-check-circle"></i></div>
          <div class="kpi-body">
            <div class="kpi-label">Total Submitted</div>
            <div class="kpi-value accent-emerald">${d.tasks.totalSubmitted}</div>
          </div>
          <div class="kpi-drill"><i class="fas fa-chevron-right"></i></div>
        </div>

        <!-- Pending -->
        <div class="ss-kpi">
          <div class="kpi-icon pending-icon"><i class="fas fa-hourglass-half"></i></div>
          <div class="kpi-body">
            <div class="kpi-label">Pending</div>
            <div class="kpi-value accent-crimson">${d.totalActive - d.tasks.totalSubmitted}</div>
          </div>
        </div>

        <!-- Progress ring -->
        <div class="ss-kpi ring-kpi">
          <div class="ring-wrapper-sm">
            <svg class="progress-ring-svg" viewBox="0 0 120 120">
              <circle class="ring-bg"       cx="60" cy="60" r="${radius}"/>
              <circle class="ring-progress" cx="60" cy="60" r="${radius}"
                style="stroke-dasharray:${circ};stroke-dashoffset:${offset};"/>
            </svg>
            <div class="ring-center">
              <div class="ring-percentage">${subPct}%</div>
              <div class="ring-label">Done</div>
            </div>
          </div>
        </div>

        ${d.totalTraining ? `
        <!-- Training -->
        <div class="ss-kpi training-kpi">
          <div class="kpi-icon training-icon"><i class="fas fa-graduation-cap"></i></div>
          <div class="kpi-body">
            <div class="kpi-label">In Training</div>
            <div class="kpi-value accent-yellow">${d.totalTraining}</div>
            ${trainingHTML}
          </div>
        </div>` : ''}

      </div>
    </div>
  `;
}

function onSSDateChange(val) {
  if (el.datePicker) el.datePicker.value = val;
  cacheClear('ss_');
  loadShiftSupervisorView(false);
}

/* ══════════════════════════════════════════
   BREAKDOWN PANEL
══════════════════════════════════════════ */
function openPanel(title, html) {
  document.getElementById('panelTitle').textContent = title;
  document.getElementById('panelBody').innerHTML    = html;
  document.getElementById('breakdownPanel').classList.add('open');
  document.getElementById('panelOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closePanel() {
  document.getElementById('breakdownPanel').classList.remove('open');
  document.getElementById('panelOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

function openRoomBreakdown(roomRowsHTML, title) {
  openPanel(title, `<div class="breakdown-list">${roomRowsHTML}</div>`);
}

function openTaskBreakdown(taskRowsHTML, title) {
  openPanel(title, `<div class="breakdown-list">${taskRowsHTML}</div>`);
}

async function openSupervisorBreakdown(locName) {
  openPanel(locName + ' — Breakdown', '<div class="panel-loader"><div class="spinner-ring"></div></div>');

  const date = formatDateForAPI(el.datePicker.value);
  try {
    const data = await apiFetch({ action: 'supervisorBreakdown', date }, 'supbr_' + date);
    if (!data.success) throw new Error(data.error);

    const loc = (data.locations || {})[locName];
    if (!loc) { document.getElementById('panelBody').innerHTML = '<p class="text-muted">No data for this location.</p>'; return; }

    const teamRows = Object.entries(loc.teams || {}).map(([tn, t]) => `
      <div class="breakdown-row">
        <span class="br-label"><i class="fas fa-user-tie"></i> ${tn}</span>
        <span class="br-chip done">${t.submitted} done</span>
        <span class="br-chip pend">${t.pending} pending</span>
      </div>
    `).join('');

    document.getElementById('panelBody').innerHTML = `
      <div class="breakdown-list">
        <div class="breakdown-row summary-row">
          <span class="br-label">Total Active</span><span class="br-chip total">${loc.total}</span>
          <span class="br-chip done">${loc.submitted} submitted</span>
          <span class="br-chip pend">${loc.pending} pending</span>
        </div>
        <div class="breakdown-section-title"><i class="fas fa-users"></i> Team Breakdown</div>
        ${teamRows}
        <div class="breakdown-section-title" style="margin-top:16px;"><i class="fas fa-layer-group"></i> Task Totals</div>
        <div class="breakdown-row"><span class="br-label">LIDAR — First Pass</span><span class="br-chip total">${loc.lidarFP}</span></div>
        <div class="breakdown-row"><span class="br-label">LIDAR — QA</span><span class="br-chip done">${loc.lidarQA}</span></div>
        <div class="breakdown-row"><span class="br-label">Lane Line — First Pass</span><span class="br-chip total">${loc.laneLineFP}</span></div>
        <div class="breakdown-row"><span class="br-label">Lane Line — QA</span><span class="br-chip done">${loc.laneLineQA}</span></div>
      </div>
    `;
  } catch (e) {
    document.getElementById('panelBody').innerHTML = `<div class="error-simple">${e.message}</div>`;
  }
}

async function openQcBreakdown(tlName) {
  openPanel(tlName + ' — Task Breakdown', '<div class="panel-loader"><div class="spinner-ring"></div></div>');

  const date = formatDateForAPI(el.datePicker.value);
  try {
    const data = await apiFetch({ action: 'qcBreakdown', tlName, date },
      'qcbr_' + tlName.replace(/\s/g,'_') + '_' + date);

    if (!data.success) throw new Error(data.error);

    document.getElementById('panelBody').innerHTML = `
      <div class="breakdown-list">
        <div class="breakdown-row summary-row">
          <span class="br-label">Total Submitted</span>
          <span class="br-chip done">${data.totalSubmitted}</span>
        </div>
        <div class="breakdown-section-title"><i class="fas fa-layer-group"></i> LIDAR</div>
        <div class="breakdown-row"><span class="br-label">First Pass</span><span class="br-chip total">${data.LIDAR.FP}</span></div>
        <div class="breakdown-row"><span class="br-label">QA</span><span class="br-chip done">${data.LIDAR.QA}</span></div>
        <div class="breakdown-section-title" style="margin-top:12px;"><i class="fas fa-road"></i> Lane Line</div>
        <div class="breakdown-row"><span class="br-label">First Pass</span><span class="br-chip total">${data.LaneLine.FP}</span></div>
        <div class="breakdown-row"><span class="br-label">QA</span><span class="br-chip done">${data.LaneLine.QA}</span></div>
      </div>
    `;
  } catch (e) {
    document.getElementById('panelBody').innerHTML = `<div class="error-simple">${e.message}</div>`;
  }
}

/* ══════════════════════════════════════════
   UTILITY
══════════════════════════════════════════ */
function formatDateForAPI(s) { return s.split('-').reverse().join('-'); }

function hashData(data) {
  let h = '';
  Object.keys(data).forEach(s =>
    Object.keys(data[s]).forEach(l =>
      Object.values(data[s][l]).forEach(t =>
        h += t.submitted.length + '-' + t.notSubmitted.length
      )
    )
  );
  return h;
}

function escapeHTML(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function cardID(shift, loc, tl) {
  return ('card-' + shift + '-' + loc + '-' + tl).replace(/\s+/g, '-');
}

/* ══════════════════════════════════════════
   FILTERS
══════════════════════════════════════════ */
function updateFilters() {
  const shifts = new Set();
  const locs   = new Set();
  const data   = state.filteredData;

  Object.keys(data).forEach(s => {
    shifts.add(s);
    Object.keys(data[s]).forEach(l => locs.add(l));
  });
  Object.keys(CONFIG.LOCATION_GROUPS).forEach(g => locs.add(g));

  const curS = el.shiftFilter.value;
  const curL = el.locFilter.value;

  el.shiftFilter.innerHTML = '<option value="all">All Shifts</option>';
  Array.from(shifts).sort().forEach(s => {
    const o = document.createElement('option');
    o.value = s; o.textContent = 'Shift: ' + s;
    if (s === curS) o.selected = true;
    el.shiftFilter.appendChild(o);
  });

  el.locFilter.innerHTML = '<option value="all">All Locations</option>';
  Object.keys(CONFIG.LOCATION_GROUPS).sort().forEach(g => {
    const o = document.createElement('option');
    o.value = g; o.textContent = '📍 ' + g;
    o.style.fontWeight = 'bold';
    if (g === curL) o.selected = true;
    el.locFilter.appendChild(o);
  });

  const grouped = new Set(Object.values(CONFIG.LOCATION_GROUPS).flat());
  Array.from(locs)
    .filter(l => !grouped.has(l) && !CONFIG.LOCATION_GROUPS[l])
    .sort()
    .forEach(l => {
      const o = document.createElement('option');
      o.value = l; o.textContent = l;
      if (l === curL) o.selected = true;
      el.locFilter.appendChild(o);
    });
}

/* ══════════════════════════════════════════
   SEARCH
══════════════════════════════════════════ */
function handleSearch() {
  state.searchTerm = el.searchInput.value.toLowerCase().trim();
  renderData();
}

function matchSearch(email, pc) {
  if (!state.searchTerm) return true;
  return email.toLowerCase().includes(state.searchTerm) ||
         String(pc).toLowerCase().includes(state.searchTerm);
}

/* ══════════════════════════════════════════
   ACCORDION
══════════════════════════════════════════ */
function toggleTeam(id) {
  const card = document.getElementById(id);
  if (!card) return;
  card.classList.toggle('active');
  if (card.classList.contains('active')) state.openTeams.add(id);
  else                                    state.openTeams.delete(id);
}

/* ══════════════════════════════════════════
   RENDER
══════════════════════════════════════════ */
function renderLoader() {
  el.contentArea.innerHTML = `
    <div id="loader">
      <div class="loader-spinner">
        <div class="spinner-ring"></div>
        <div class="loader-text">Connecting to server<span class="loader-dots"><span>.</span><span>.</span><span>.</span></span></div>
      </div>
    </div>`;
}

function renderEmpty(msg) {
  el.contentArea.innerHTML = `
    <div class="empty-state" style="padding:80px;text-align:center;">
      <i class="fas fa-inbox" style="font-size:56px;opacity:.2;display:block;margin-bottom:20px;"></i>
      <p style="font-size:15px;color:var(--text-muted);">${msg}</p>
      <button class="btn btn-primary" style="margin-top:20px;" onclick="manualRefresh()">
        <i class="fas fa-redo"></i> Try Again
      </button>
    </div>`;
}

function renderError(e) {
  const msg = e.name === 'AbortError'
    ? 'Request timed out. Server may be slow.'
    : e.message || 'Unknown error';

  el.contentArea.innerHTML = `
    <div class="error-state">
      <div class="error-header">
        <div class="error-icon"><i class="fas fa-exclamation-triangle"></i></div>
        <div class="error-title-section">
          <div class="error-title">Connection Error</div>
          <div class="error-subtitle">${escapeHTML(msg)}</div>
        </div>
      </div>
      <div class="error-actions">
        <button class="btn btn-primary" onclick="manualRefresh()">
          <i class="fas fa-redo"></i> Try Again
        </button>
      </div>
    </div>`;
}

function renderData() {
  const selShift = el.shiftFilter.value;
  const selLoc   = el.locFilter.value;
  const data     = state.filteredData;

  el.contentArea.innerHTML = '';

  if (!Object.keys(data).length) {
    renderEmpty(
      state.currentUser && state.currentUser.role === CONFIG.ROLES.QC
        ? 'No data for your team today.'
        : 'No data available for selected date.'
    );
    return;
  }

  const isGroup = selLoc !== 'all' && CONFIG.LOCATION_GROUPS[selLoc];
  const user    = state.currentUser;
  const isQC    = user && user.role === CONFIG.ROLES.QC;
  const isSup   = user && user.role === CONFIG.ROLES.SUPERVISOR;
  let animIdx   = 0;

  for (const [shift, locations] of Object.entries(data)) {
    if (selShift !== 'all' && shift !== selShift) continue;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = `<div class="shift-tag"><i class="fas fa-clock"></i> Shift: ${shift}</div>`;

    if (isGroup) {
      const sec = buildGroupSection(selLoc, shift, locations, animIdx++);
      if (sec) wrapper.appendChild(sec);
    } else {
      const rendered = new Set();
      Object.keys(CONFIG.LOCATION_GROUPS).forEach(grp => {
        if (selLoc !== 'all' && selLoc !== grp) return;
        const members = (CONFIG.LOCATION_GROUPS[grp] || []).filter(l => locations[l]);
        if (!members.length) return;
        const sec = buildGroupSection(grp, shift, locations, animIdx++, members, isSup);
        wrapper.appendChild(sec);
        members.forEach(l => rendered.add(l));
      });

      for (const [loc, teams] of Object.entries(locations)) {
        if (selLoc !== 'all' && loc !== selLoc) continue;
        if (rendered.has(loc)) continue;
        wrapper.appendChild(buildLocationSection(loc, teams, shift, animIdx++ * CONFIG.ANIMATION_STAGGER_DELAY, isSup, isQC));
      }
    }

    el.contentArea.appendChild(wrapper);
  }
}

/* ── Group section (e.g. Saint Fatima) ── */
function buildGroupSection(grpName, shift, allLocs, delay, rooms, isSup) {
  const roomList = rooms || (CONFIG.LOCATION_GROUPS[grpName] || []).filter(r => allLocs[r]);
  if (!roomList.length) return null;

  let totalSub = 0, totalPend = 0;
  const roomData = {};
  roomList.forEach(r => {
    roomData[r] = allLocs[r];
    Object.values(allLocs[r]).forEach(t => { totalSub += t.submitted.length; totalPend += t.notSubmitted.length; });
  });

  const total = totalSub + totalPend;
  const pct   = total ? Math.round((totalSub / total) * 100) : 0;

  let roomsHTML = '';
  roomList.forEach((r, i) => {
    const bdClick = isSup ? `onclick="openSupervisorBreakdown('${escapeHTML(r)}')"` : '';
    roomsHTML += `
      <div class="room-subsection" style="animation:sectionAppear .5s ease ${(delay * CONFIG.ANIMATION_STAGGER_DELAY) + (i + 1) * 100}ms backwards;">
        <div class="room-title ${isSup ? 'clickable-title' : ''}" ${bdClick}>
          <i class="fas fa-door-open"></i> ${r}
          ${isSup ? '<i class="fas fa-chart-bar room-bd-icon"></i>' : ''}
        </div>
        ${buildTeamsGrid(roomData[r], shift, r, i, isSup, false)}
      </div>`;
  });

  const sec = document.createElement('div');
  sec.className = 'location-section';
  sec.style.animationDelay = delay * CONFIG.ANIMATION_STAGGER_DELAY + 'ms';
  sec.innerHTML = `
    <div class="location-title">
      <div class="location-icon"><i class="fas fa-building"></i></div>
      ${grpName}
    </div>
    ${buildHeroStats({ submitted: totalSub, notSubmitted: totalPend, total, percentage: pct })}
    <div class="room-group">${roomsHTML}</div>`;
  return sec;
}

/* ── Individual location section ── */
function buildLocationSection(loc, teams, shift, delay, isSup, isQC) {
  const stats    = calcStats(teams);
  const bdClick  = isSup ? `onclick="openSupervisorBreakdown('${escapeHTML(loc)}')"` : '';

  const sec = document.createElement('div');
  sec.className = 'location-section';
  sec.style.animationDelay = delay + 'ms';
  sec.innerHTML = `
    <div class="location-title ${isSup ? 'clickable-title' : ''}" ${bdClick}>
      <div class="location-icon"><i class="fas fa-map-marker-alt"></i></div>
      ${loc}
      ${isSup ? '<span class="bd-hint"><i class="fas fa-chart-bar"></i> Breakdown</span>' : ''}
    </div>
    ${buildHeroStats(stats)}
    ${buildTeamsGrid(teams, shift, loc, 0, isSup, isQC)}`;
  return sec;
}

function calcStats(teams) {
  let s = 0, n = 0;
  Object.values(teams).forEach(t => { s += t.submitted.length; n += t.notSubmitted.length; });
  const total = s + n;
  return { submitted: s, notSubmitted: n, total, percentage: total ? Math.round((s / total) * 100) : 0 };
}

/* ── Hero stats bar ── */
function buildHeroStats({ submitted, notSubmitted, total, percentage }) {
  const r    = 54;
  const circ = 2 * Math.PI * r;
  const off  = circ - (percentage / 100) * circ;
  return `
    <div class="hero-stats">
      <div class="stat-card submitted"><div class="stat-icon"><i class="fas fa-check-circle"></i></div>
        <div class="stat-info"><span class="stat-label">Submitted</span><span class="stat-value">${submitted}</span></div></div>
      <div class="stat-card not-submitted"><div class="stat-icon"><i class="fas fa-exclamation-circle"></i></div>
        <div class="stat-info"><span class="stat-label">Pending</span><span class="stat-value">${notSubmitted}</span></div></div>
      <div class="stat-card total"><div class="stat-icon"><i class="fas fa-users"></i></div>
        <div class="stat-info"><span class="stat-label">Total Users</span><span class="stat-value">${total}</span></div></div>
      <div class="progress-ring-container">
        <div class="ring-wrapper">
          <svg class="progress-ring-svg" viewBox="0 0 120 120">
            <circle class="ring-bg" cx="60" cy="60" r="${r}"/>
            <circle class="ring-progress" cx="60" cy="60" r="${r}"
              style="stroke-dasharray:${circ};stroke-dashoffset:${off};"/>
          </svg>
          <div class="ring-center">
            <div class="ring-percentage">${percentage}%</div>
            <div class="ring-label">Done</div>
          </div>
        </div>
        <div class="ring-details">
          <div class="detail-row"><span class="detail-dot done"></span><span>${submitted} Completed</span></div>
          <div class="detail-row"><span class="detail-dot pending"></span><span>${notSubmitted} Remaining</span></div>
        </div>
      </div>
    </div>`;
}

/* ── Teams grid ── */
function buildTeamsGrid(teams, shift, loc, roomIdx, isSup, isQC) {
  let html = '<div class="teams-grid">';
  let idx  = 0;

  for (const [tl, td] of Object.entries(teams)) {
    const id       = cardID(shift, loc, tl);
    const isActive = state.openTeams.has(id) ? 'active' : '';
    const filtSub  = td.submitted.filter(u => matchSearch(u.email, u.pc));
    const filtPend = td.notSubmitted.filter(u => matchSearch(u.email, u.pc));
    if (state.searchTerm && !filtSub.length && !filtPend.length) continue;

    const delay     = (roomIdx + 1) * 60 + (++idx) * 60;
    const bdClick   = isQC
      ? `<button class="tl-breakdown-btn" onclick="event.stopPropagation();openQcBreakdown('${escapeHTML(tl)}')"><i class="fas fa-chart-bar"></i></button>`
      : '';

    html += `
      <div class="team-card ${isActive}" id="${id}" style="animation-delay:${delay}ms;">
        <div class="team-header" onclick="toggleTeam('${id}')">
          <div class="tl-info">
            <span class="team-name"><i class="fas fa-user-tie"></i> ${tl} ${bdClick}</span>
            <div class="tl-badge-container">
              <span class="badge badge-done"><span class="badge-dot"></span>Done: ${filtSub.length}</span>
              <span class="badge badge-not"><span class="badge-dot"></span>Pending: ${filtPend.length}</span>
            </div>
          </div>
          <div class="chevron-icon"><i class="fas fa-chevron-down"></i></div>
        </div>
        <div class="team-content">
          <div class="content-inner">
            <div class="split-view">
              <div class="column">
                <div class="col-title not-submit"><i class="fas fa-clock"></i>Pending<span class="col-count">${filtPend.length}</span></div>
                ${filtPend.length ? filtPend.map((u, i) => userBox(u, 'not-sub', i)).join('') : '<div class="empty-state">No pending users</div>'}
              </div>
              <div class="column">
                <div class="col-title submit"><i class="fas fa-check-double"></i>Submitted<span class="col-count">${filtSub.length}</span></div>
                ${filtSub.length ? filtSub.map((u, i) => userBox(u, 'sub', i)).join('') : '<div class="empty-state">No submissions yet</div>'}
              </div>
            </div>
          </div>
        </div>
      </div>`;
  }

  html += '</div>';
  return html;
}

/* ── User box ── */
function userBox(user, type, idx) {
  return `
    <div class="user-box ${type}-box" style="animation-delay:${idx * 35}ms;">
      <span class="u-email">${escapeHTML(user.email)}</span>
      <span class="u-meta"><i class="fas fa-desktop"></i>PC: ${escapeHTML(user.pc)}</span>
    </div>`;
}

/* ── Silent toast ── */
function showSilentToast() {
  const t = el.silentUpdate;
  if (!t) return;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

/* ══════════════════════════════════════════
   BOOT
══════════════════════════════════════════ */
window.addEventListener('DOMContentLoaded', async () => {
  await loadLoginUsers();
  // cache elements for later
  el.contentArea = document.getElementById('contentArea');
  el.shiftFilter = document.getElementById('shiftFilter');
  el.locFilter   = document.getElementById('locFilter');
  el.datePicker  = document.getElementById('datePicker');
  el.searchInput = document.getElementById('searchInput');
  el.silentUpdate = document.getElementById('silentUpdate');
  el.statusIndicator = document.getElementById('statusIndicator');
  el.statusDot   = document.getElementById('statusDot');
  el.statusText  = document.getElementById('statusText');
});
