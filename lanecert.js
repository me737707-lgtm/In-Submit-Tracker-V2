/* ================================================
LANECERT.JS  v4.2.0 — Lane Line certification
================================================ */
/* ================================================
LANE LINE CERTIFICATION (v3.8.0 — Shift Sup sees Not Certified rows)
================================================ */
async function fetchLaneLineCert(locFilter) {
  if (S._stalePaint) return new Promise(() => {});       /* see fetchActivetimeLow */
  const date = fmtDate(D.datePicker.value);
  const d = await api({ action: 'laneLineCert', date }, K.lane(date));

  if (!d.success) return d;

  let users = d.users || [];
  let registered = d.registered || [];

  if (locFilter) {
    const locLow = locFilter.toLowerCase();
    const locOk = (x) => {
      if (x && x.locKey && String(x.locKey).toLowerCase() === locLow) return true;
      const e = ((x && x.location) || '').toLowerCase();
      return (e && (e === locLow || e.includes(locLow) || locLow.includes(e))) ||
        (locLow === 'saint fatima' && (e.startsWith('sf ') || e.includes('saint fatima')));
    };
    users = users.filter(locOk);
    registered = registered.filter(locOk);
  }

  const issues = users.filter(u => u.issueType);
  const regFP = registered.filter(r => r.level === 'FP').length;
  const regQA = registered.filter(r => r.level === 'QA').length;

  return {
    success: true,
    users: users,
    issues: issues,
    totalLaneLineUsers: users.length,
    totalLaneLineTasks: d.totalLaneLineTasks || 0,
    issuesCount: issues.length,
    certifiedOk: users.length - issues.length,
    registered: registered,
    registeredInScope: registered.length,
    registeredFP: regFP,
    registeredQA: regQA
  };
}

/* ── per-user row (working labelers / violations) ── */
function certUserRow(e, i) {
  const isQaIssue = e.issueType === 'NOT_CERTIFIED_QA';
  const isNotCert = e.issueType === 'NOT_CERTIFIED';

  const statusBadge = isNotCert
    ? '<span class="br-pill pill-red"><i class="fas fa-ban"></i> Not Certified</span>'
    : isQaIssue
      ? '<span class="br-pill pill-yellow"><i class="fas fa-triangle-exclamation"></i> Not Cert. for QA</span>'
      : '<span class="br-pill pill-green"><i class="fas fa-circle-check"></i> OK</span>';

  const certBadge = e.certifiedLevel === 'QA'
    ? '<span class="br-pill pill-green"><i class="fas fa-certificate"></i> Cert: QA</span>'
    : e.certifiedLevel === 'FP'
      ? '<span class="br-pill pill-blue"><i class="fas fa-certificate"></i> Cert: FP</span>'
      : '<span class="br-pill pill-gray"><i class="fas fa-circle-xmark"></i> Not in List</span>';

  const workBadges = (e.workingPasses||[]).map(p => p === 'QA'
    ? '<span class="br-pill pill-yellow"><i class="fas fa-gavel"></i> QA</span>'
    : '<span class="br-pill pill-blue"><i class="fas fa-road"></i> FP</span>').join('');

  return `
  <div class="br-row lane-user-row" style="animation-delay:${i * 15}ms">
    <div class="lane-user-id">
      <div class="lane-avatar">${(e.email||'?')[0].toUpperCase()}</div>
      <div class="lane-user-meta">
        <div class="lane-user-email">${esc(e.email)}</div>
        <div class="lane-user-sub">
          <span><i class="fas fa-desktop"></i>${esc(e.pc||'N/A')}</span>
          <span><i class="fas fa-map-marker-alt"></i>${esc(e.location||'N/A')}</span>
          <span><i class="fas fa-user-tie"></i>${esc(e.team||'N/A')}</span>
        </div>
      </div>
    </div>
    <div class="lane-user-badges">
      <div class="lane-badge-line">${statusBadge}</div>
      <div class="lane-badge-line">${certBadge}${workBadges}</div>
    </div>
  </div>`;
}

/* ── per-user row for REGISTERED-BUT-IDLE users ── */
function regNotWorkingRow(r, i) {
  const certBadge = r.level === 'QA'
    ? '<span class="br-pill pill-green"><i class="fas fa-certificate"></i> Cert: QA</span>'
    : r.level === 'FP'
      ? '<span class="br-pill pill-blue"><i class="fas fa-certificate"></i> Cert: FP</span>'
      : '<span class="br-pill pill-gray"><i class="fas fa-circle-xmark"></i> Not in List</span>';

  return `
  <div class="br-row lane-user-row" style="animation-delay:${i * 15}ms">
    <div class="lane-user-id">
      <div class="lane-avatar" style="background:linear-gradient(135deg,var(--gray),var(--t-4));color:#0d1117;box-shadow:none;">${(r.email||'?')[0].toUpperCase()}</div>
      <div class="lane-user-meta">
        <div class="lane-user-email">${esc(r.email)}</div>
        <div class="lane-user-sub">
          <span><i class="fas fa-desktop"></i>${esc(r.pc||'N/A')}</span>
          <span><i class="fas fa-map-marker-alt"></i>${esc(r.location||'N/A')}</span>
          <span><i class="fas fa-user-tie"></i>${esc(r.team||'N/A')}</span>
        </div>
      </div>
    </div>
    <div class="lane-user-badges">
      <div class="lane-badge-line"><span class="br-pill pill-gray"><i class="fas fa-user-clock"></i> Not on Lane Line</span></div>
      <div class="lane-badge-line">${certBadge}</div>
    </div>
  </div>`;
}

/* ── room aggregation (Shift Supervisor view) ── */
function buildRoomCertRows(users, registered) {
  const map = {};
  const ensure = (r) => {
    if (!map[r]) map[r] = { room:r, fp:0, qa:0, violations:0, workingSet:new Set(), regFP:0, regQA:0 };
    return map[r];
  };

  users.forEach(u => {
    const r = u.location || 'Unknown';
    const m = ensure(r);
    m.workingSet.add(u.email);
    (u.workingPasses||[]).forEach(p => { if (p === 'FP') m.fp++; else if (p === 'QA') m.qa++; });
    if (u.issueType) m.violations++;
  });

  registered.forEach(r => {
    const m = ensure(r.location || 'Unknown');
    if (r.level === 'FP') m.regFP++; else if (r.level === 'QA') m.regQA++;
  });

  const rooms = Object.values(map).sort((a,b) => (b.regFP+b.regQA) - (a.regFP+a.regQA));
  if (!rooms.length) return '';

  return rooms.map((m, i) => {
    const working = m.workingSet.size;
    const reg = m.regFP + m.regQA;
    return `
    <div class="br-row room-detail-row" style="animation-delay:${i * 20}ms">
      <div class="room-detail-main">
        <span class="br-label"><i class="fas fa-door-open"></i>${esc(m.room)}</span>
        <span class="br-pill pill-cyan"><i class="fas fa-certificate"></i>${reg} registered</span>
      </div>
      <div class="room-detail-stats">
        <span class="br-pill pill-blue"><i class="fas fa-users"></i>${working} working</span>
        <span class="br-pill pill-blue"><i class="fas fa-road"></i>${m.fp} FP</span>
        <span class="br-pill pill-yellow"><i class="fas fa-gavel"></i>${m.qa} QA</span>
        ${m.violations > 0
          ? `<span class="br-pill pill-red"><i class="fas fa-triangle-exclamation"></i>${m.violations} issue${m.violations>1?'s':''}</span>`
          : `<span class="br-pill pill-green"><i class="fas fa-circle-check"></i>all OK</span>`}
      </div>
    </div>`;
  }).join('');
}

async function openLaneLineCertPanel(locFilter) {
  const sub = locFilter ? locFilter : 'Lane Line certification overview';
  openCenterModal('Lane Line Certification', sub,
    '<div class="qc-modal-spin"><div class="spin-ring"></div></div>');

  try {
    const d = await fetchLaneLineCert(locFilter);
    if (!d.success) throw new Error(d.error || 'Failed');

    const users      = d.users || [];
    const registered = d.registered || [];
    const regIn      = d.registeredInScope || 0;
    const regFP      = d.registeredFP || 0;
    const regQA      = d.registeredQA || 0;
    const issues     = (d.issues && d.issues.length) ? d.issues : users.filter(u => u.issueType);
    const ok         = users.length - issues.length;
    const workingEmails = new Set(users.map(u => u.email));
    const regNotWorking = registered.filter(r => !workingEmails.has(r.email));

    const role = (S.user?.role || '').toLowerCase();
    const isShiftSup = role.includes('shift');

    const content = document.getElementById('centerModalContent');

    if (regIn === 0 && users.length === 0) {
      content.innerHTML = `
      <div class="qc-empty">
        <i class="fas fa-road"></i>
        <p>No Lane Line labelers registered or working in this scope today.</p>
      </div>`;
      return;
    }

    let html = `
    <div class="br-summary-card lane-cert-summary">
      <div class="br-summary-row">
        <span class="brs-label"><i class="fas fa-certificate"></i>Registered in Lane Line Teams</span>
        <span class="brs-val">${regIn}</span>
      </div>
      <div class="br-summary-row">
        <span class="brs-label"><span class="reg-dot reg-dot-fp"></span>Certified FP</span>
        <span class="brs-val brs-val-sm c-blue">${regFP}</span>
      </div>
      <div class="br-summary-row">
        <span class="brs-label"><span class="reg-dot reg-dot-qa"></span>Certified QA</span>
        <span class="brs-val brs-val-sm c-green">${regQA}</span>
      </div>
      <div class="br-summary-row">
        <span class="brs-label"><i class="fas fa-road"></i>Working on Lane Line today</span>
        <span class="brs-val">${users.length}</span>
      </div>
      <div class="br-summary-row">
        <span class="brs-label"><i class="fas fa-circle-check"></i>Certified OK</span>
        <span class="brs-val c-green">${ok}</span>
      </div>
      <div class="br-summary-row">
        <span class="brs-label"><i class="fas fa-triangle-exclamation"></i>Not Certified / Violations</span>
        <span class="brs-val c-red">${issues.length}</span>
      </div>
      ${regNotWorking.length ? `
      <div class="br-summary-row">
        <span class="brs-label"><i class="fas fa-user-clock"></i>Registered · not on Lane Line today</span>
        <span class="brs-val brs-val-sm" style="color:var(--t-3)">${regNotWorking.length}</span>
      </div>` : ''}
    </div>`;

    if (isShiftSup) {
      html += `<div class="br-section" style="margin-top:20px">Lane Line by Room</div>`;
      html += buildRoomCertRows(users, registered) ||
        '<p class="br-empty">No Lane Line activity in this shift.</p>';

      html += `<div class="br-section" style="margin-top:20px">Not Certified Labelers (${issues.length})</div>`;
      if (issues.length) {
        html += issues.map((u, i) => certUserRow(u, i)).join('');
      } else {
        html += '<p class="br-empty">All Lane Line labelers in this shift are certified ✓</p>';
      }
    } else {
      html += `<div class="br-section" style="margin-top:20px">Lane Line Labelers — Working Today (${users.length})</div>`;
      if (users.length) {
        html += users.map((u, i) => certUserRow(u, i)).join('');
      } else {
        html += '<p class="br-empty">No one working Lane Line in your scope today.</p>';
      }
      if (regNotWorking.length) {
        html += `<div class="br-section" style="margin-top:20px">Registered but not on Lane Line today (${regNotWorking.length})</div>`;
        html += regNotWorking.map((r, i) => regNotWorkingRow(r, i)).join('');
      }
    }

    content.innerHTML = html;
  } catch(e) {
    document.getElementById('centerModalContent').innerHTML = `<div class="qc-empty"><i class="fas fa-triangle-exclamation"></i><p>${e.message}</p></div>`;
  }
}
