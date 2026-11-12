/* ================================================
VIEWS-SHIFT.JS  v4.8.0 — shift supervisor view (+ End of Shift report & non-blocking load)
================================================ */
/* ================================================
SHIFT SUPERVISOR VIEW
================================================ */
async function fetchShiftSupervisor(full) {
  const shift = S.user?.shift || S.user?.permission;

  if (!shift || shift === 'all') {
    D.ssView.innerHTML = `<div class="err-simple"><i class="fas fa-triangle-exclamation"></i>
      <strong>Shift not configured correctly.</strong><br><br>
      Your account needs a shift assignment (M, N, or ON).<br>
      Current value: "${esc(shift || 'empty')}"<br><br>
      Please ask the admin to set your Shift column (E) to M, N, or ON in the Login Users sheet.
    </div>`;
    setStatus('error');
    return;
  }

  const date = fmtDate(D.datePicker.value);
  const key  = K.ss(shift, date);
  if (full) {
    const st = swrLoad(key);
    if (st && st.success) {                                    /* instant paint, refresh right after */
      S._stalePaint = true;
      try { renderSSView(st); } finally { S._stalePaint = false; }
      setStatus('updating');
    } else {
      D.ssView.innerHTML = '<div class="ss-skeleton"><div class="spin-ring"></div><p>Loading shift data…</p></div>';
    }
  }

  try {
    /* FAST NON-BLOCKING LOAD: get primary shift dashboard first */
    const d = await api({ action: 'shiftSupervisor', date }, key, 0);
    if (!d.success) throw new Error(d.error || 'Failed');
    swrSave(key, d);

    /* Background batch for secondary cards + health */
    primeBatch([
      { key: K.atlow(date), params: { action: 'activetimeLow', date } },
      { key: K.lane(date),  params: { action: 'laneLineCert', date } }
    ].concat(healthItems())).then(() => { absorbHealth(); }).catch(() => {});

    const sig = JSON.stringify(d);
    if (!full && sig === S._sig.ss) { setStatus('live'); return; }      /* nothing changed → no re-render */
    S._sig.ss = sig;
    renderSSView(d);
    setStatus('live');
  } catch(e) {
    console.error('❌ Shift supervisor error:', e);
    D.ssView.innerHTML = `<div class="err-simple"><i class="fas fa-triangle-exclamation"></i> ${esc(e.message)}</div>`;
    setStatus('error');
  }
}

function renderSSView(d) {
  S._ssData         = d;                      /* saved for the Shift Supervisor End-of-Shift report */
  const shift       = d.shift;
  const label       = CONFIG.SHIFT_LABELS[shift] || shift;
  const att         = d.attendance || {};
  const totalActive = d.totalUsers || att.totalActive || 0;
  const pct         = totalActive > 0 ? Math.round((d.totalSubmitted / totalActive) * 100) : 0;
  const pendCount   = d.totalPending || 0;

  const roomRows = Object.entries(d.roomBreakdown || {}).map(([room, r]) => {
    const trainingBadges = Object.entries(r.trainingByLevel || {}).map(([l, c]) => `<span class="train-badge-sm">${esc(l)}: ${c}</span>`).join('');
    return `
    <div class="br-row room-detail-row">
      <div class="room-detail-main">
        <span class="br-label"><i class="fas fa-door-open"></i>${esc(room)}</span>
        <span class="br-pill pill-blue">${r.total} total</span>
      </div>
      <div class="room-detail-stats">
        <span class="br-pill pill-green"><i class="fas fa-user-check"></i>${r.active || 0} active</span>
        <span class="br-pill pill-green"><i class="fas fa-check"></i>${r.submitted || 0} done</span>
        <span class="br-pill pill-red"><i class="fas fa-hourglass-half"></i>${r.pending || 0} pending</span>
        ${r.absent > 0 ? `<span class="br-pill pill-gray"><i class="fas fa-user-xmark"></i>${r.absent} absent</span>` : ''}
        ${r.empty > 0 ? `<span class="br-pill pill-gray"><i class="fas fa-user-slash"></i>${r.empty} empty</span>` : ''}
        ${r.training > 0 ? `<span class="br-pill pill-yellow"><i class="fas fa-graduation-cap"></i>${r.training} training</span>` : ''}
      </div>
      ${trainingBadges ? `<div class="room-training-badges">${trainingBadges}</div>` : ''}
    </div>`;
  }).join('');

  const t = d.tasks || {};
  const u = d.overallUserBreakdown || { LIDAR: { FP: 0, QA: 0 }, LaneLine: { FP: 0, QA: 0 } };

  const taskRows = `
  <div class="br-section">LIDAR</div>
  <div class="br-row"><span class="br-label">First Pass (FP)</span><span class="br-pill pill-blue">${t.LIDAR?.FP || 0} tasks</span></div>
  <div class="br-row"><span class="br-label">QA</span><span class="br-pill pill-green">${t.LIDAR?.QA || 0} tasks</span></div>
  <div class="br-section" style="margin-top:12px">Lane Line</div>
  <div class="br-row"><span class="br-label">First Pass (FP)</span><span class="br-pill pill-blue">${t.LaneLine?.FP || 0} tasks</span></div>
  <div class="br-row"><span class="br-label">QA</span><span class="br-pill pill-green">${t.LaneLine?.QA || 0} tasks</span></div>
  ${Object.keys(t.other || {}).length ? `<div class="br-section" style="margin-top:12px">Other</div>` +
    Object.entries(t.other || {}).map(([k, v]) => `<div class="br-row"><span class="br-label">${esc(k)}</span><span class="br-pill pill-yellow">${v}</span></div>`).join('') : ''}
  `;

  const attRows = `
  <div class="br-section">Attendance Overview</div>
  <div class="br-row">
    <span class="br-label"><i class="fas fa-user-check"></i>Active Users</span>
    <span class="br-pill pill-green">${att.totalActive || 0}</span>
  </div>
  <div class="br-row">
    <span class="br-label"><i class="fas fa-user-xmark"></i>Absent (0)</span>
    <span class="br-pill pill-red">${att.totalAbsent || 0}</span>
  </div>
  <div class="br-row">
    <span class="br-label"><i class="fas fa-user-slash"></i>Empty (E)</span>
    <span class="br-pill pill-gray">${att.totalEmpty || 0}</span>
  </div>
  ${att.totalTraining > 0 ? `
  <div class="br-row">
    <span class="br-label"><i class="fas fa-graduation-cap"></i>In Training</span>
    <span class="br-pill pill-yellow">${att.totalTraining || 0}</span>
  </div>
  <div class="br-training-detail">
    ${Object.entries(att.trainingByLevel || {}).map(([l, c]) => `<span class="train-badge">${esc(l)}: ${c}</span>`).join('')}
  </div>` : ''}
  `;

  const trainingHTML = att.totalTraining > 0
    ? `<div class="kpi-extra">${Object.entries(att.trainingByLevel || {}).map(([l, c]) => `<span class="train-badge">${esc(l)}: ${c}</span>`).join('')}</div>`
    : '';

  D.ssView.innerHTML = `
  <div class="ss-wrap">
    <div class="ss-header">
      <div>
        <div class="ss-shift-tag"><i class="fas fa-clock"></i> ${esc(label)} Shift</div>
        <p class="ss-date-label">${esc(D.datePicker.value)}</p>
      </div>
      <div class="ss-date-ctrl">
        <input type="date" value="${esc(D.datePicker.value)}" class="ctrl-date"
               onchange="D.datePicker.value=this.value;cDel('ss_');fetchShiftSupervisor(true)">
      </div>
    </div>

    <div class="kpi-grid">

      <div class="kpi-card kpi-clickable" onclick='openPanel("Attendance Overview","${esc(label)} Shift",${JSON.stringify(attRows)})'>
        <div class="kpi-icon-wrap kpi-blue"><i class="fas fa-users"></i></div>
        <div class="kpi-body">
          <div class="kpi-label">Total Active Users</div>
          <div class="kpi-val kpi-val-blue">${att.totalActive || 0}</div>
        </div>
        <div class="kpi-arrow"><i class="fas fa-chevron-right"></i></div>
      </div>

      <div class="kpi-card kpi-clickable" onclick='openPanel("Task Breakdown","${esc(label)} Shift",${JSON.stringify(taskRows)})'>
        <div class="kpi-icon-wrap kpi-green"><i class="fas fa-circle-check"></i></div>
        <div class="kpi-body">
          <div class="kpi-label">Total Submitted</div>
          <div class="kpi-val kpi-val-green">${d.totalSubmitted || 0}</div>
          <div class="kpi-sub">${t.total || 0} tasks · ${t.uniqueUsers || 0} labelers</div>
        </div>
        <div class="kpi-arrow"><i class="fas fa-chevron-right"></i></div>
      </div>

      <div class="kpi-card kpi-clickable" onclick='openPendingPanel(${JSON.stringify(d.roomBreakdown || {})},${d.totalPending || 0},${JSON.stringify(d.pendingByTeam || {})},${JSON.stringify(d.pendingUsers || [])})'>
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

      ${att.totalAbsent > 0 ? `
      <div class="kpi-card">
        <div class="kpi-icon-wrap kpi-red"><i class="fas fa-user-xmark"></i></div>
        <div class="kpi-body">
          <div class="kpi-label">Absent</div>
          <div class="kpi-val kpi-val-red">${att.totalAbsent || 0}</div>
        </div>
      </div>` : ''}

      ${att.totalEmpty > 0 ? `
      <div class="kpi-card">
        <div class="kpi-icon-wrap kpi-gray"><i class="fas fa-user-slash"></i></div>
        <div class="kpi-body">
          <div class="kpi-label">Empty</div>
          <div class="kpi-val kpi-val-gray">${att.totalEmpty || 0}</div>
        </div>
      </div>` : ''}

      ${att.totalTraining > 0 ? `
      <div class="kpi-card">
        <div class="kpi-icon-wrap kpi-yellow"><i class="fas fa-graduation-cap"></i></div>
        <div class="kpi-body">
          <div class="kpi-label">In Training</div>
          <div class="kpi-val kpi-val-yellow">${att.totalTraining || 0}</div>
          ${trainingHTML}
        </div>
      </div>` : ''}

      <div class="kpi-card kpi-clickable" onclick='openPanel("Room Breakdown — Detailed","${esc(label)} Shift",${JSON.stringify(roomRows)})'>
        <div class="kpi-icon-wrap kpi-purple"><i class="fas fa-building"></i></div>
        <div class="kpi-body">
          <div class="kpi-label">Room Breakdown</div>
          <div class="kpi-val kpi-val-purple">${Object.keys(d.roomBreakdown || {}).length} rooms</div>
          <div class="kpi-sub">Click for details</div>
        </div>
        <div class="kpi-arrow"><i class="fas fa-chevron-right"></i></div>
      </div>

      <div class="kpi-card kpi-clickable" onclick='openUserTypePanel("LIDAR First Pass","${esc(label)} Shift",${JSON.stringify(d.roomUserBreakdown || {})},"LIDAR","FP")'>
        <div class="kpi-icon-wrap kpi-blue"><i class="fas fa-cube"></i></div>
        <div class="kpi-body">
          <div class="kpi-label">LIDAR First Pass</div>
          <div class="kpi-val kpi-val-blue">${u.LIDAR?.FP || 0}</div>
          <div class="kpi-sub">labelers</div>
        </div>
        <div class="kpi-arrow"><i class="fas fa-chevron-right"></i></div>
      </div>

      <div class="kpi-card kpi-clickable" onclick='openUserTypePanel("LIDAR QA","${esc(label)} Shift",${JSON.stringify(d.roomUserBreakdown || {})},"LIDAR","QA")'>
        <div class="kpi-icon-wrap kpi-green"><i class="fas fa-cube"></i></div>
        <div class="kpi-body">
          <div class="kpi-label">LIDAR QA</div>
          <div class="kpi-val kpi-val-green">${u.LIDAR?.QA || 0}</div>
          <div class="kpi-sub">labelers</div>
        </div>
        <div class="kpi-arrow"><i class="fas fa-chevron-right"></i></div>
      </div>

      <div class="kpi-card kpi-clickable" onclick='openUserTypePanel("Lane Line First Pass","${esc(label)} Shift",${JSON.stringify(d.roomUserBreakdown || {})},"LaneLine","FP")'>
        <div class="kpi-icon-wrap kpi-purple"><i class="fas fa-road"></i></div>
        <div class="kpi-body">
          <div class="kpi-label">Lane Line First Pass</div>
          <div class="kpi-val kpi-val-purple">${u.LaneLine?.FP || 0}</div>
          <div class="kpi-sub">labelers</div>
        </div>
        <div class="kpi-arrow"><i class="fas fa-chevron-right"></i></div>
      </div>

      <div class="kpi-card kpi-clickable" onclick='openUserTypePanel("Lane Line QA","${esc(label)} Shift",${JSON.stringify(d.roomUserBreakdown || {})},"LaneLine","QA")'>
        <div class="kpi-icon-wrap kpi-yellow"><i class="fas fa-road"></i></div>
        <div class="kpi-body">
          <div class="kpi-label">Lane Line QA</div>
          <div class="kpi-val kpi-val-yellow">${u.LaneLine?.QA || 0}</div>
          <div class="kpi-sub">labelers</div>
        </div>
        <div class="kpi-arrow"><i class="fas fa-chevron-right"></i></div>
      </div>

      <div class="kpi-card kpi-clickable" onclick='openQcShiftPanel("${esc(label)} Shift","${esc(shift)}","${fmtDate(D.datePicker.value)}")'>
        <div class="kpi-icon-wrap kpi-purple"><i class="fas fa-user-tie"></i></div>
        <div class="kpi-body">
          <div class="kpi-label">QC Breakdown</div>
          <div class="kpi-val kpi-val-purple">${d.qcCount || 0} QCs</div>
          <div class="kpi-sub">Click for details</div>
        </div>
        <div class="kpi-arrow"><i class="fas fa-chevron-right"></i></div>
      </div>

      <div class="kpi-card kpi-clickable at-low-card" onclick="openActivetimeLowPanel()">
        <div class="kpi-icon-wrap kpi-orange"><i class="fas fa-clock-rotate-left"></i></div>
        <div class="kpi-body">
          <div class="kpi-label">Active Time &lt; 6.5h</div>
          <div class="kpi-val kpi-val-orange" id="atLowCountSS">—</div>
          <div class="kpi-sub">employees</div>
        </div>
        <div class="kpi-arrow"><i class="fas fa-chevron-right"></i></div>
      </div>

      <div class="kpi-card kpi-clickable atot-below-card" onclick="openActivetimeLowPanel(null,'below')">
        <div class="kpi-icon-wrap kpi-red"><i class="fas fa-arrow-down"></i></div>
        <div class="kpi-body">
          <div class="kpi-label">Below 80% ATOT</div>
          <div class="kpi-val kpi-val-red" id="atotBelowSS">—</div>
          <div class="kpi-sub">employees</div>
        </div>
        <div class="kpi-arrow"><i class="fas fa-chevron-right"></i></div>
      </div>

      <div class="kpi-card kpi-clickable atot-above-card" onclick="openActivetimeLowPanel(null,'above')">
        <div class="kpi-icon-wrap kpi-green"><i class="fas fa-arrow-up"></i></div>
        <div class="kpi-body">
          <div class="kpi-label">Above 80% ATOT</div>
          <div class="kpi-val kpi-val-green" id="atotAboveSS">—</div>
          <div class="kpi-sub">employees</div>
        </div>
        <div class="kpi-arrow"><i class="fas fa-chevron-right"></i></div>
      </div>

      <div class="kpi-card kpi-clickable lane-cert-card" onclick="openLaneLineCertPanel()">
        <div class="kpi-icon-wrap kpi-cyan"><i class="fas fa-certificate"></i></div>
        <div class="kpi-body">
          <div class="kpi-label">Lane Line Not Certified</div>
          <div class="kpi-val" id="laneCertCountSS">—</div>
          <div class="kpi-sub" id="laneCertSubSS">labelers</div>
        </div>
        <div class="kpi-arrow"><i class="fas fa-chevron-right"></i></div>
      </div>

      <div class="kpi-card kpi-clickable kpi-report" onclick="openShiftReport()">
        <div class="kpi-icon-wrap kpi-blue"><i class="fas fa-file-lines"></i></div>
        <div class="kpi-body">
          <div class="kpi-label">Generate End of Shift Report</div>
          <div class="kpi-sub">${esc(label)} Shift · all rooms</div>
        </div>
        <div class="kpi-arrow"><i class="fas fa-chevron-right"></i></div>
      </div>

    </div>
  </div>`;

  fetchActivetimeLow().then(d => {
    if (d.success) {
      const el = document.getElementById('atLowCountSS');
      if (el) el.textContent = d.count;
      const elB = document.getElementById('atotBelowSS');
      if (elB) elB.textContent = (d.below80 || []).length;
      const elA = document.getElementById('atotAboveSS');
      if (elA) elA.textContent = (d.above80 || []).length;
    }
  });

  fetchLaneLineCert().then(d => {
    const el  = document.getElementById('laneCertCountSS');
    const sub = document.getElementById('laneCertSubSS');
    if (el && d.success) {
      el.textContent = d.issuesCount;
      el.className   = 'kpi-val ' + (d.issuesCount > 0 ? 'kpi-val-red' : 'kpi-val-green');
      if (sub) sub.textContent = d.issuesCount > 0
        ? ('of ' + d.totalLaneLineUsers + ' · ' + d.registeredInScope + ' reg.')
        : (d.registeredInScope + ' registered · all OK');
    }
  });
}

function ringHTML(pct) {
  const r    = 36;
  const circ = 2 * Math.PI * r;
  const off  = circ - (pct / 100) * circ;
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
