/* ================================================
VIEWS-SUPERVISOR.JS  v4.0.0 — supervisor dashboard
================================================ */
/* ================================================
SUPERVISOR DASHBOARD
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
  const key = K.supdash(date);
  if (full) {
    D.supervisorView.innerHTML = '<div class="ss-skeleton"><div class="spin-ring"></div><p>Loading supervisor data…</p></div>';
  }
  try {
    await primeBatch([
      { key: key,          params: { action:'supervisorDashboard', date } },
      { key: K.atlow(date), params: { action:'activetimeLow', date } },
      { key: K.lane(date),  params: { action:'laneLineCert', date } }
    ]);
    const d = await api({action:'supervisorDashboard',date}, key, 0);
    if (!d.success) throw new Error(d.error || 'Failed');
    const sig = JSON.stringify(d);
    if (!full && sig === S._sig.sup) { setStatus('live'); return; }     /* nothing changed → no re-render */
    S._sig.sup = sig;
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
             onchange="D.datePicker.value=this.value;cDel('supdash_');fetchSupervisorDashboard(true)">
    </div>
  </div>`;

  const locNames = Object.keys(locations);

  locNames.forEach((locName, locIdx) => {
    const loc = locations[locName];
    const att = loc.attendance || {};
    const pct = att.totalActive > 0 ? Math.round((loc.totalSubmitted / att.totalActive) * 100) : 0;
    const pendCount = loc.totalPending || 0;
    const t = loc.tasks || {};
    const u = loc.overallUserBreakdown || {LIDAR:{FP:0,QA:0},LaneLine:{FP:0,QA:0}};

    html += `<div class="loc-section" style="margin-bottom:32px;animation-delay:${locIdx * 100}ms">`;

    html += `
    <div class="loc-header" style="margin-bottom:20px;">
      <div class="loc-icon-wrap"><i class="fas fa-building"></i></div>
      <div class="loc-title-wrap">
        <h2 class="loc-name">${esc(locName)}</h2>
        <span class="loc-sub">${CONFIG.SHIFT_LABELS[loc.shift] || loc.shift || ''} · ${Object.keys(loc.rooms||{}).length} rooms · ${att.totalActive || 0} active</span>
      </div>
    </div>`;

    html += `<div class="kpi-grid">`;

    html += `
    <div class="kpi-card kpi-clickable" onclick='openPanel("Attendance Overview","${esc(locName)}",${JSON.stringify(buildAttendanceRows(att))})'>
      <div class="kpi-icon-wrap kpi-blue"><i class="fas fa-users"></i></div>
      <div class="kpi-body">
        <div class="kpi-label">Total Active Users</div>
        <div class="kpi-val kpi-val-blue">${att.totalActive||0}</div>
      </div>
      <div class="kpi-arrow"><i class="fas fa-chevron-right"></i></div>
    </div>`;

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

    html += `
    <div class="kpi-card kpi-clickable" onclick='openPendingPanel(${JSON.stringify(loc.rooms||{})},${pendCount},${JSON.stringify(loc.pendingByTeam||{})},${JSON.stringify(loc.pendingUsers||[])})'>
      <div class="kpi-icon-wrap kpi-red"><i class="fas fa-hourglass-half"></i></div>
      <div class="kpi-body">
        <div class="kpi-label">Pending</div>
        <div class="kpi-val kpi-val-red">${pendCount}</div>
      </div>
      <div class="kpi-arrow"><i class="fas fa-chevron-right"></i></div>
    </div>`;

    html += `<div class="kpi-card kpi-ring">${ringHTML(pct)}</div>`;

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

    html += `
    <div class="kpi-card kpi-clickable at-low-card" onclick="openActivetimeLowPanel('${esc(locName)}')">
      <div class="kpi-icon-wrap kpi-orange"><i class="fas fa-clock-rotate-left"></i></div>
      <div class="kpi-body">
        <div class="kpi-label">Active Time &lt; 6.5h</div>
        <div class="kpi-val kpi-val-orange" id="atLowCountSup_${locIdx}">—</div>
        <div class="kpi-sub">employees</div>
      </div>
      <div class="kpi-arrow"><i class="fas fa-chevron-right"></i></div>
    </div>`;

    /* ── NEW v3.9.0: ATOT Below 80% card ── */
    html += `
    <div class="kpi-card kpi-clickable atot-below-card" onclick="openActivetimeLowPanel('${esc(locName)}','below')">
      <div class="kpi-icon-wrap kpi-red"><i class="fas fa-arrow-down"></i></div>
      <div class="kpi-body">
        <div class="kpi-label">Below 80% ATOT</div>
        <div class="kpi-val kpi-val-red" id="atotBelowSup_${locIdx}">—</div>
        <div class="kpi-sub">employees</div>
      </div>
      <div class="kpi-arrow"><i class="fas fa-chevron-right"></i></div>
    </div>`;

    /* ── NEW v3.9.0: ATOT Above 80% card ── */
    html += `
    <div class="kpi-card kpi-clickable atot-above-card" onclick="openActivetimeLowPanel('${esc(locName)}','above')">
      <div class="kpi-icon-wrap kpi-green"><i class="fas fa-arrow-up"></i></div>
      <div class="kpi-body">
        <div class="kpi-label">Above 80% ATOT</div>
        <div class="kpi-val kpi-val-green" id="atotAboveSup_${locIdx}">—</div>
        <div class="kpi-sub">employees</div>
      </div>
      <div class="kpi-arrow"><i class="fas fa-chevron-right"></i></div>
    </div>`;

    html += `
    <div class="kpi-card kpi-clickable lane-cert-card" onclick="openLaneLineCertPanel('${esc(locName)}')">
      <div class="kpi-icon-wrap kpi-cyan"><i class="fas fa-certificate"></i></div>
      <div class="kpi-body">
        <div class="kpi-label">Lane Line Not Certified</div>
        <div class="kpi-val" id="laneCertCountSup_${locIdx}">—</div>
        <div class="kpi-sub" id="laneCertSubSup_${locIdx}">labelers</div>
      </div>
      <div class="kpi-arrow"><i class="fas fa-chevron-right"></i></div>
    </div>`;

    html += `</div>`;
    html += `</div>`;
  });

  html += `</div>`;
  D.supervisorView.innerHTML = html;
  console.log('✅ Supervisor dashboard rendered successfully');

  const locNamesKeys = Object.keys(locations);
  locNamesKeys.forEach((locName, locIdx) => {
    fetchActivetimeLow(locName).then(d => {
      if (d.success) {
        const el = document.getElementById('atLowCountSup_' + locIdx);
        if (el) el.textContent = d.count;
        const elB = document.getElementById('atotBelowSup_' + locIdx);
        if (elB) elB.textContent = (d.below80 || []).length;
        const elA = document.getElementById('atotAboveSup_' + locIdx);
        if (elA) elA.textContent = (d.above80 || []).length;
      }
    });
    fetchLaneLineCert(locName).then(d => {
      const el  = document.getElementById('laneCertCountSup_' + locIdx);
      const sub = document.getElementById('laneCertSubSup_' + locIdx);
      if (el && d.success) {
        el.textContent = d.issuesCount;
        el.className   = 'kpi-val ' + (d.issuesCount > 0 ? 'kpi-val-red' : 'kpi-val-green');
        if (sub) sub.textContent = d.issuesCount > 0
          ? ('of ' + d.totalLaneLineUsers + ' · ' + d.registeredInScope + ' reg.')
          : (d.registeredInScope + ' registered · all OK');
      }
    });
  });
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
  const key = K.supdash(date);
  try {
    const d = await api({action:'supervisorDashboard',date}, key, 0);
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
