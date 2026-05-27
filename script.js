/* ================================================
   SCRIPT.JS  v3.4  —  Submit Tracker Frontend
   ================================================ */

const S = {
  user: null,
  users: [],
  filtered: {},
  search: '',
  openTeams: new Set(),
  autoTimer: null,
  abortCtrl: null
};

const D = {};

/* ================================================
   API
   ================================================ */
async function api(params, cacheKey, ttl = CONFIG.CLIENT_CACHE_TTL) {
  const url = CONFIG.API_URL + '?' + new URLSearchParams(params).toString();
  if (!window._apiCache) window._apiCache = {};
  const now = Date.now();
  if (cacheKey && window._apiCache[cacheKey] && (now - window._apiCache[cacheKey].t < (ttl || 0))) {
    return window._apiCache[cacheKey].data;
  }
  if (S.abortCtrl) S.abortCtrl.abort();
  S.abortCtrl = new AbortController();
  const timer = setTimeout(() => S.abortCtrl.abort(), CONFIG.REQUEST_TIMEOUT);
  try {
    const res = await fetch(url, { signal: S.abortCtrl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (cacheKey) window._apiCache[cacheKey] = { t: now, data };
    return data;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

/* ================================================
   AUTH & BOOT
   ================================================ */
async function loadUsers() {
  try {
    const d = await api({ action: 'users' }, 'users', 60000);
    if (d.success) S.users = d.users || [];
  } catch (e) {
    console.error('loadUsers failed', e);
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const u = D.username.value.trim();
  const p = D.password.value;
  if (!u || !p) return;
  D.loginBtn.disabled = true;
  D.loginSpinner.style.display = 'flex';
  D.loginError.style.display = 'none';
  try {
    const d = await api({ action: 'login', username: u, password: p }, null, 0);
    if (!d.success) throw new Error(d.error || 'Invalid credentials');
    S.user = d;
    D.loginOverlay.style.display = 'none';
    D.userChip.style.display = 'flex';
    D.userNameLabel.textContent = d.username;
    D.userRoleLabel.textContent = d.role;
    D.userAvatar.textContent = d.username[0].toUpperCase();
    D.userRoleLabel.className = 'user-role-badge';
    if (d.role === CONFIG.ROLES.SUPERVISOR) D.userRoleLabel.classList.add('chip-sup');
    else if (d.role === CONFIG.ROLES.SHIFT_SUPERVISOR) D.userRoleLabel.classList.add('chip-shift');
    else if (d.role === CONFIG.ROLES.QC) D.userRoleLabel.classList.add('chip-qc');
    const today = new Date().toISOString().split('T')[0];
    D.datePicker.value = today;
    startAutoRefresh();
    await routeByRole();
  } catch (err) {
    D.loginErrorMsg.textContent = err.message;
    D.loginError.style.display = 'flex';
  } finally {
    D.loginBtn.disabled = false;
    D.loginSpinner.style.display = 'none';
  }
}

function handleLogout() {
  S.user = null;
  S.filtered = {};
  S.openTeams.clear();
  S.search = '';
  stopAutoRefresh();
  if (S.abortCtrl) { S.abortCtrl.abort(); S.abortCtrl = null; }
  D.loginOverlay.style.display = 'flex';
  D.userChip.style.display = 'none';
  D.mainContent.innerHTML = '';
  D.ssView.style.display = 'none';
  D.supervisorView.style.display = 'none';
  D.shiftFilter.innerHTML = '<option value="all">All Shifts</option>';
  D.locFilter.innerHTML = '<option value="all">All Locations</option>';
  D.searchInput.value = '';
  D.statusPill.className = 'status-pill loading';
  D.statusLabel.textContent = 'Connecting';
}

function startAutoRefresh() {
  stopAutoRefresh();
  S.autoTimer = setInterval(manualRefresh, CONFIG.REFRESH_INTERVAL);
}

function stopAutoRefresh() {
  if (S.autoTimer) { clearInterval(S.autoTimer); S.autoTimer = null; }
}

async function manualRefresh() {
  showToast();
  await routeByRole();
}

async function routeByRole() {
  if (!S.user) return;
  const date = fmtDate(D.datePicker.value);
  D.mainContent.innerHTML = '';
  D.ssView.style.display = 'none';
  D.supervisorView.style.display = 'none';
  if (S.user.role === CONFIG.ROLES.SHIFT_SUPERVISOR) {
    D.ssView.style.display = 'block';
    await renderShiftSupervisorView(date);
  } else if (S.user.role === CONFIG.ROLES.SUPERVISOR) {
    D.supervisorView.style.display = 'block';
    await renderSupervisorDashboard(date);
  } else {
    await renderMainDashboard(date);
  }
}

/* ================================================
   SHIFT SUPERVISOR VIEW
   ================================================ */
async function renderShiftSupervisorView(date) {
  const shift = S.user.shift;
  if (!shift) {
    D.ssView.innerHTML = '<div class="page-error"><i class="fas fa-triangle-exclamation"></i><h3>Error</h3><p>No shift assigned to your account.</p></div>';
    return;
  }
  D.ssView.innerHTML = '<div class="ss-skeleton"><div class="spin-ring"></div><p>Loading shift data…</p></div>';
  try {
    const d = await api({ action: 'shiftSupervisor', shift, date }, 'ss_' + shift + '_' + date, 0);
    if (!d.success) throw new Error(d.error);
    const att = d.attendance || {};
    const rooms = d.roomBreakdown || {};
    const overall = d.overallUserBreakdown || {};
    const shiftLabel = CONFIG.SHIFT_LABELS[d.shift] || d.shift;
    const pct = d.totalUsers ? Math.round((d.totalSubmitted / d.totalUsers) * 100) : 0;

    let roomsHtml = '';
    Object.entries(rooms).forEach(([room, r]) => {
      const roomTasks = (d.roomTaskBreakdown || {})[room] || {};
      const pctRoom = r.total ? Math.round((r.submitted / r.total) * 100) : 0;
      roomsHtml += `
      <div class="loc-section" style="animation-delay:0ms">
        <div class="loc-header">
          <div class="loc-icon-wrap"><i class="fas fa-door-open"></i></div>
          <div class="loc-title-wrap">
            <h2 class="loc-name">${esc(room)}</h2>
            <span class="loc-sub">${r.total} labelers • ${r.active} active</span>
          </div>
        </div>
        ${heroStats(r.submitted, r.pending, r.total, pctRoom)}
        <div class="br-task-mini" style="margin-top:12px">
          <div class="br-mini-row"><span>LIDAR FP</span><strong>${roomTasks.LIDAR?.FP || 0}</strong></div>
          <div class="br-mini-row"><span>LIDAR QA</span><strong>${roomTasks.LIDAR?.QA || 0}</strong></div>
          <div class="br-mini-row"><span>LaneLine FP</span><strong>${roomTasks.LaneLine?.FP || 0}</strong></div>
          <div class="br-mini-row"><span>LaneLine QA</span><strong>${roomTasks.LaneLine?.QA || 0}</strong></div>
        </div>
        ${buildAllQueueAccordions(roomTasks.queues)}
      </div>`;
    });

    const kpiHtml = `
    <div class="kpi-grid">
      <div class="kpi-card kpi-blue">
        <div class="kpi-icon-wrap kpi-blue"><i class="fas fa-users"></i></div>
        <div class="kpi-body"><div class="kpi-label">Total Active</div><div class="kpi-val kpi-val-blue">${att.totalActive || 0}</div></div>
      </div>
      <div class="kpi-card kpi-green">
        <div class="kpi-icon-wrap kpi-green"><i class="fas fa-check-circle"></i></div>
        <div class="kpi-body"><div class="kpi-label">Submitted</div><div class="kpi-val kpi-val-green">${d.totalSubmitted || 0}</div></div>
      </div>
      <div class="kpi-card kpi-red">
        <div class="kpi-icon-wrap kpi-red"><i class="fas fa-clock"></i></div>
        <div class="kpi-body"><div class="kpi-label">Pending</div><div class="kpi-val kpi-val-red">${d.totalPending || 0}</div></div>
      </div>
      <div class="kpi-card kpi-yellow">
        <div class="kpi-icon-wrap kpi-yellow"><i class="fas fa-user-slash"></i></div>
        <div class="kpi-body"><div class="kpi-label">Absent</div><div class="kpi-val kpi-val-yellow">${att.totalAbsent || 0}</div></div>
      </div>
      <div class="kpi-card kpi-gray">
        <div class="kpi-icon-wrap kpi-gray"><i class="fas fa-bed"></i></div>
        <div class="kpi-body"><div class="kpi-label">Empty</div><div class="kpi-val kpi-val-gray">${att.totalEmpty || 0}</div></div>
      </div>
      <div class="kpi-card kpi-purple">
        <div class="kpi-icon-wrap kpi-purple"><i class="fas fa-graduation-cap"></i></div>
        <div class="kpi-body"><div class="kpi-label">Training</div><div class="kpi-val kpi-val-purple">${att.totalTraining || 0}</div></div>
      </div>
      <div class="kpi-card kpi-ring">
        <div class="ring-box">
          <svg class="ring-svg" viewBox="0 0 100 100">
            <circle class="ring-track" cx="50" cy="50" r="40"/>
            <circle class="ring-fill" cx="50" cy="50" r="40" style="stroke-dasharray:251.2;stroke-dashoffset:${251.2 - (251.2 * pct / 100)}"/>
          </svg>
          <div class="ring-center"><span class="ring-pct">${pct}%</span><span class="ring-lbl">Done</span></div>
        </div>
      </div>
    </div>`;

    const taskTypes = [
      {mod:'LIDAR', pass:'FP', label:'LIDAR First Pass', color:'blue', icon:'fa-cube'},
      {mod:'LIDAR', pass:'QA', label:'LIDAR QA', color:'green', icon:'fa-cube'},
      {mod:'LaneLine', pass:'FP', label:'LaneLine First Pass', color:'purple', icon:'fa-road'},
      {mod:'LaneLine', pass:'QA', label:'LaneLine QA', color:'yellow', icon:'fa-road'}
    ];
    let taskCards = '';
    taskTypes.forEach(tt => {
      const count = overall[tt.mod]?.[tt.pass] || 0;
      const roomBd = d.roomUserBreakdown || {};
      taskCards += `
      <div class="kpi-card kpi-clickable" onclick="openUserTypePanel('${tt.label}','${shiftLabel} • ${date}',${JSON.stringify(roomBd).replace(/"/g,'&quot;')},'${tt.mod}','${tt.pass}')">
        <div class="kpi-icon-wrap kpi-${tt.color}"><i class="fas ${tt.icon}"></i></div>
        <div class="kpi-body"><div class="kpi-label">${tt.label}</div><div class="kpi-val kpi-val-${tt.color}">${count}</div></div>
        <i class="fas fa-chevron-right kpi-arrow"></i>
      </div>`;
    });

    D.ssView.innerHTML = `
    <div class="ss-wrap">
      <div class="ss-header">
        <div>
          <div class="ss-shift-tag"><i class="fas fa-clock"></i>${shiftLabel} Shift Supervisor</div>
          <div class="ss-date-label">${date}</div>
        </div>
      </div>
      ${kpiHtml}
      <div style="margin-top:24px">
        <div class="br-section">Task Type Breakdown</div>
        <div class="kpi-grid">${taskCards}</div>
      </div>
      <div style="margin-top:24px">
        <div class="br-section">Rooms</div>
        ${roomsHtml || '<p class="br-empty">No rooms found.</p>'}
      </div>
    </div>`;
  } catch (e) {
    D.ssView.innerHTML = `<div class="page-error"><i class="fas fa-triangle-exclamation"></i><h3>Error</h3><p>${e.message}</p><button class="retry-btn" onclick="manualRefresh()"><i class="fas fa-rotate"></i> Retry</button></div>`;
  }
}

/* ================================================
   SUPERVISOR DASHBOARD VIEW
   ================================================ */
async function renderSupervisorDashboard(date) {
  const locs = S.user.locations || '';
  const shift = S.user.shift || '';
  if (!locs) {
    D.supervisorView.innerHTML = '<div class="page-error"><i class="fas fa-triangle-exclamation"></i><h3>Error</h3><p>No locations assigned.</p></div>';
    return;
  }
  D.supervisorView.innerHTML = '<div class="ss-skeleton"><div class="spin-ring"></div><p>Loading supervisor data…</p></div>';
  try {
    const d = await api({ action: 'supervisorDashboard', date, locations: locs, shift }, 'supdash_' + locs.replace(/[^a-zA-Z0-9_-]/g,'_') + '_' + (shift||'all') + '_' + date, 0);
    if (!d.success) throw new Error(d.error);
    const locations = d.locations || {};
    let locHtml = '';
    Object.entries(locations).forEach(([locName, loc], idx) => {
      const att = loc.attendance || {};
      const rooms = loc.rooms || {};
      const tasks = loc.tasks || {};
      const pct = loc.totalUsers ? Math.round((loc.totalSubmitted / loc.totalUsers) * 100) : 0;
      let roomRows = '';
      Object.entries(rooms).forEach(([room, r]) => {
        roomRows += `
        <div class="br-row room-detail-row">
          <div class="room-detail-main">
            <span class="br-label"><i class="fas fa-door-open"></i>${esc(room)}</span>
            <span class="br-pill pill-blue">${r.total} total</span>
            <span class="br-pill pill-green">${r.submitted} done</span>
            <span class="br-pill pill-red">${r.pending} pending</span>
          </div>
          ${Object.keys(r.trainingByLevel||{}).length ? `<div class="room-training-badges">${Object.entries(r.trainingByLevel).map(([lvl,c])=>`<span class="train-badge-sm">${esc(lvl)}: ${c}</span>`).join('')}</div>` : ''}
        </div>`;
      });
      let teamRows = '';
      Object.entries(loc.pendingByTeam || {}).forEach(([team, t]) => {
        teamRows += `
        <div class="br-row team-pending-row">
          <div class="team-pending-header">
            <span class="br-label"><i class="fas fa-user-tie"></i>${esc(team)}</span>
            <span class="br-pill pill-red">${t.count} pending</span>
          </div>
          <div class="pending-users-list">
            ${(t.users || []).map(u => `<span class="pending-user-chip">${esc(u)}</span>`).join('')}
          </div>
        </div>`;
      });
      locHtml += `
      <div class="loc-section" style="animation-delay:${idx * CONFIG.ANIMATION_STAGGER_DELAY}ms">
        <div class="loc-header clickable" onclick="openSupervisorPanel('${esc(locName)}')">
          <div class="loc-icon-wrap"><i class="fas fa-building"></i></div>
          <div class="loc-title-wrap">
            <h2 class="loc-name">${esc(locName)}</h2>
            <span class="loc-bd-hint"><i class="fas fa-chart-bar"></i> View Breakdown</span>
          </div>
        </div>
        ${heroStats(loc.totalSubmitted, loc.totalPending, loc.totalUsers, pct)}
        <div class="br-task-grid" style="margin-top:16px">
          <div class="br-task-card lidar">
            <div class="brtc-label">LIDAR</div>
            <div class="brtc-row"><span>First Pass</span><strong>${tasks.LIDAR?.FP || 0}</strong></div>
            <div class="brtc-row"><span>QA</span><strong>${tasks.LIDAR?.QA || 0}</strong></div>
            <div class="brtc-total">${(tasks.LIDAR?.FP||0)+(tasks.LIDAR?.QA||0)} total</div>
          </div>
          <div class="br-task-card laneline">
            <div class="brtc-label">Lane Line</div>
            <div class="brtc-row"><span>First Pass</span><strong>${tasks.LaneLine?.FP || 0}</strong></div>
            <div class="brtc-row"><span>QA</span><strong>${tasks.LaneLine?.QA || 0}</strong></div>
            <div class="brtc-total">${(tasks.LaneLine?.FP||0)+(tasks.LaneLine?.QA||0)} total</div>
          </div>
        </div>
        ${buildAllQueueAccordions(tasks.queues)}
        <div class="br-section" style="margin-top:20px">Rooms</div>
        ${roomRows || '<p class="br-empty">No room data.</p>'}
        ${teamRows ? `<div class="br-section" style="margin-top:20px">Pending by Team</div>${teamRows}` : ''}
      </div>`;
    });
    D.supervisorView.innerHTML = `
    <div class="ss-wrap">
      <div class="ss-header">
        <div>
          <div class="ss-shift-tag"><i class="fas fa-user-tie"></i>Supervisor Dashboard</div>
          <div class="ss-date-label">${date}</div>
        </div>
      </div>
      ${locHtml || '<div class="page-empty"><i class="fas fa-inbox"></i><p>No locations found.</p></div>'}
    </div>`;
  } catch (e) {
    D.supervisorView.innerHTML = `<div class="page-error"><i class="fas fa-triangle-exclamation"></i><h3>Error</h3><p>${e.message}</p><button class="retry-btn" onclick="manualRefresh()"><i class="fas fa-rotate"></i> Retry</button></div>`;
  }
}

/* ================================================
   MAIN DASHBOARD (QC / Default)
   ================================================ */
async function renderMainDashboard(date) {
  renderLoader(D.mainContent);
  try {
    const data = await api({ date }, 'dash_' + date, 0);
    S.filtered = data.data || {};
    rebuildFilters();
    renderDashboard();
    D.statusPill.className = 'status-pill live';
    D.statusLabel.textContent = 'Live';
  } catch (e) {
    renderError(D.mainContent, e);
    D.statusPill.className = 'status-pill error';
    D.statusLabel.textContent = 'Error';
  }
}

/* ================================================
   PANELS & MODALS
   ================================================ */
function openPanel(title, sub, html) {
  D.panelTitle.textContent = title;
  D.panelSub.textContent = sub;
  D.panelContent.innerHTML = html;
  D.sidePanel.classList.add('open');
  D.panelMask.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closePanel() {
  D.sidePanel.classList.remove('open');
  D.panelMask.classList.remove('open');
  document.body.style.overflow = '';
}

function openCenterModal(title, sub, html) {
  let modal = document.getElementById('centerModal');
  let mask = document.getElementById('centerModalMask');
  if (!modal) {
    const htmlStr = `
    <div id="centerModalMask" class="qc-modal-mask" onclick="closeCenterModal()"></div>
    <div id="centerModal" class="qc-modal">
      <div class="qc-modal-header">
        <div>
          <p id="centerModalSub" class="qc-modal-sub"></p>
          <h2 id="centerModalTitle" class="qc-modal-title">Breakdown</h2>
        </div>
        <button class="qc-modal-close" onclick="closeCenterModal()"><i class="fas fa-xmark"></i></button>
      </div>
      <div id="centerModalContent" class="qc-modal-content">
        <div class="qc-modal-spin"><div class="spin-ring"></div></div>
      </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', htmlStr);
    modal = document.getElementById('centerModal');
    mask = document.getElementById('centerModalMask');
  }
  document.getElementById('centerModalTitle').textContent = title;
  document.getElementById('centerModalSub').textContent = sub;
  document.getElementById('centerModalContent').innerHTML = html;
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

/* ================================================
   QUEUE ACCORDIONS
   ================================================ */
function buildAllQueueAccordions(queues) {
  if (!queues || !Object.keys(queues).length) return '';
  let html = '<div class="queue-section">';
  Object.entries(queues).forEach(([group, qData]) => {
    const total = Object.values(qData).reduce((a, b) => a + b, 0);
    const [mod, pass] = group.split('_');
    let iconClass = 'queue-icon-blue';
    if (mod === 'LIDAR' && pass === 'QA') iconClass = 'queue-icon-green';
    else if (mod === 'LaneLine') iconClass = 'queue-icon-purple';
    let rows = '';
    Object.entries(qData).forEach(([qName, count]) => {
      rows += `<div class="queue-row"><span class="queue-name">${esc(qName)}</span><span class="queue-count">${count}</span></div>`;
    });
    html += `
    <div class="queue-accordion" id="qa-${esc(group)}">
      <div class="queue-header" onclick="this.parentElement.classList.toggle('open');this.querySelector('.queue-chevron').classList.toggle('open')">
        <div class="queue-header-left">
          <i class="fas fa-layer-group ${iconClass}"></i>
          <span class="queue-group-label">${esc(mod)} ${esc(pass)}</span>
          <span class="queue-total-badge">${total} queues</span>
        </div>
        <i class="fas fa-chevron-down queue-chevron"></i>
      </div>
      <div class="queue-body">${rows}</div>
    </div>`;
  });
  html += '</div>';
  return html;
}

/* ================================================
   PENDING BREAKDOWN (NEW)
   ================================================ */
function openPendingBreakdown(pendingUsers, roomUserBreakdown, modality, pass) {
  const teamMap = {};
  pendingUsers.forEach(u => {
    const t = u.team || 'Unknown';
    if (!teamMap[t]) teamMap[t] = [];
    teamMap[t].push(u);
  });
  const teamRows = Object.entries(teamMap).map(([team, users]) => {
    return `
    <div class="br-row team-pending-row">
      <div class="team-pending-header">
        <span class="br-label"><i class="fas fa-user-tie"></i>${esc(team)}</span>
        <span class="br-pill pill-red">${users.length} pending</span>
      </div>
      <div class="pending-users-list">
        ${users.map(u => `<span class="pending-user-chip">${esc(u.email)}</span>`).join('')}
      </div>
    </div>`;
  }).join('');

  const roomRows = Object.entries(roomUserBreakdown || {}).map(([room, r]) => {
    let count = 0;
    if (modality === 'LIDAR' && pass === 'FP') count = r.LIDAR?.FP || 0;
    else if (modality === 'LIDAR' && pass === 'QA') count = r.LIDAR?.QA || 0;
    else if (modality === 'LaneLine' && pass === 'FP') count = r.LaneLine?.FP || 0;
    else if (modality === 'LaneLine' && pass === 'QA') count = r.LaneLine?.QA || 0;
    if (count <= 0) return '';
    return `
    <div class="br-row room-detail-row">
      <div class="room-detail-main">
        <span class="br-label"><i class="fas fa-door-open"></i>${esc(room)}</span>
        <span class="br-pill pill-blue">${count} labelers</span>
      </div>
    </div>`;
  }).join('');

  const userRows = pendingUsers.map(u => `
    <div class="br-row">
      <span class="br-label"><i class="fas fa-user"></i>${esc(u.email)}</span>
      <span class="br-pill pill-gray">${u.pc || 'N/A'}</span>
    </div>
  `).join('');

  const html = `
    <div class="br-summary-card">
      <div class="br-summary-row">
        <span class="brs-label">Total Pending</span>
        <span class="brs-val c-red">${pendingUsers.length}</span>
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
        ${buildAllQueueAccordions(q.queues)}
        ${Object.keys(q.other || {}).length ? `
        <div class="qc-other">
          ${Object.entries(q.other).map(([k,v]) => `<span class="qc-other-badge">${esc(k)}: ${v}</span>`).join('')}
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
        <span class="br-label"><i class="fas fa-door-open"></i>${esc(room)}</span>
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
        <span class="brs-label">Total ${esc(title)} Labelers</span>
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
        <span class="br-label"><i class="fas fa-user-tie"></i>${esc(tn)}</span>
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
      ${buildAllQueueAccordions(t.queues)}
      ${Object.keys(t.other||{}).length?`
        <div class="br-section" style="margin-top:16px">Other Tasks</div>
        ${Object.entries(t.other).map(([k,v])=>`<div class="br-row"><span class="br-label">${esc(k)}</span><span class="br-pill pill-yellow">${v}</span></div>`).join('')}
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
        <span class="br-label"><i class="fas fa-user-tie"></i>${esc(tn)}</span>
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
      ${buildAllQueueAccordions(tm.queues)}
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
      ${buildAllQueueAccordions(d.queues)}
      ${Object.keys(d.other||{}).length?`
        <div class="br-section" style="margin-top:16px">Other Tasks</div>
        ${Object.entries(d.other).map(([k,v])=>`<div class="br-row"><span class="br-label">${esc(k)}</span><span class="br-pill pill-yellow">${v}</span></div>`).join('')}
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
      ${buildAllQueueAccordions(d.queues)}
      ${Object.keys(d.other||{}).length?`
        <div class="br-section" style="margin-top:16px">Other</div>
        ${Object.entries(d.other).map(([k,v])=>`<div class="br-row"><span class="br-label">${esc(k)}</span><span class="br-pill pill-yellow">${v}</span></div>`).join('')}
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
