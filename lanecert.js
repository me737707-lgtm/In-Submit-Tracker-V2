/* ================================================
LANECERT.JS  v4.10.0 — Lane Line certification + LIDAR QA certification
(one shared fetch + one shared panel; the only differences are in CERT_KINDS)
================================================ */
const CERT_KINDS = {
  lane: {
    action:       'laneLineCert',
    key:          d => K.lane(d),
    title:        'Lane Line Certification',
    overview:     'Lane Line certification overview',
    regLabel:     'Registered in Lane Line Teams',
    workLabel:    'Working on Lane Line today',
    workIcon:     'fa-road',
    idleLabel:    'Not on Lane Line',
    idleSummary:  'Registered · not on Lane Line today',
    roomTitle:    'Lane Line by Room',
    workingTitle: 'Lane Line Labelers — Working Today',
    noWorkMsg:    'No one working Lane Line in your scope today.',
    allOkMsg:     'All Lane Line labelers in this shift are certified ✓',
    noActivity:   'No Lane Line activity in this shift.',
    emptyMsg:     'No Lane Line labelers registered or working in this scope today.',
    idleTitle:    'Registered but not on Lane Line today',
    levels:       true
  },
  lidar: {
    action:       'lidarQaCert',
    key:          d => K.lidar(d),
    title:        'LIDAR QA Certification',
    overview:     'LIDAR QA certification overview',
    regLabel:     'Registered in QA Teams',
    workLabel:    'Working on LIDAR QA today',
    workIcon:     'fa-cube',
    idleLabel:    'Not on LIDAR QA',
    idleSummary:  'Registered · not on LIDAR QA today',
    roomTitle:    'LIDAR QA by Room',
    workingTitle: 'LIDAR QA Labelers — Working Today',
    noWorkMsg:    'No one working LIDAR QA in your scope today.',
    allOkMsg:     'All LIDAR QA labelers in this shift are certified ✓',
    noActivity:   'No LIDAR QA activity in this shift.',
    emptyMsg:     'No LIDAR QA labelers registered or working in this scope today.',
    idleTitle:    'Registered but not on LIDAR QA today',
    levels:       false
  }
};

/* ── shared fetch: same location filtering for both certifications ── */
async function fetchCert(kind, locFilter) {
  if (S._stalePaint) return new Promise(() => {});       /* see fetchActivetimeLow */
  const cfg  = CERT_KINDS[kind];
  const date = fmtDate(D.datePicker.value);
  const d = await api({ action: cfg.action, date }, cfg.key(date));

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
    totalLaneLineTasks: d.totalLaneLineTasks || d.totalLidarQaTasks || 0,
    issuesCount: issues.length,
    certifiedOk: users.length - issues.length,
    registered: registered,
    registeredInScope: registered.length,
    registeredFP: regFP,
    registeredQA: regQA
  };
}
function fetchLaneLineCert(locFilter) { return fetchCert('lane', locFilter); }
function fetchLidarQaCert(locFilter)  { return fetchCert('lidar', locFilter); }

/* ── per-user row (working labelers / violations) ── */
function certUserRow(e, i, kind) {
  kind = kind || 'lane';
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

  const workBadges = kind === 'lidar'
    ? '<span class="br-pill pill-yellow"><i class="fas fa-cube"></i> LIDAR QA</span>'
    : (e.workingPasses||[]).map(p => p === 'QA'
        ? '<span class="br-pill pill-yellow"><i class="fas fa-gavel"></i> QA</span>'
        : '<span class="br-pill pill-blue"><i class="fas fa-road"></i> FP</span>').join('');

  return `
  <div class="br-row lane-user-row" style="animation-delay:${Math.min(i, 20) * 15}ms">
    <div class="lane-user-id">
      <div class="lane-avatar">${esc((e.email||'?')[0].toUpperCase())}</div>
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
function regNotWorkingRow(r, i, kind) {
  const cfg = CERT_KINDS[kind || 'lane'];
  const certBadge = r.level === 'QA'
    ? '<span class="br-pill pill-green"><i class="fas fa-certificate"></i> Cert: QA</span>'
    : r.level === 'FP'
      ? '<span class="br-pill pill-blue"><i class="fas fa-certificate"></i> Cert: FP</span>'
      : '<span class="br-pill pill-gray"><i class="fas fa-circle-xmark"></i> Not in List</span>';

  return `
  <div class="br-row lane-user-row" style="animation-delay:${Math.min(i, 20) * 15}ms">
    <div class="lane-user-id">
      <div class="lane-avatar idle">${esc((r.email||'?')[0].toUpperCase())}</div>
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
      <div class="lane-badge-line"><span class="br-pill pill-gray"><i class="fas fa-user-clock"></i> ${esc(cfg.idleLabel)}</span></div>
      <div class="lane-badge-line">${certBadge}</div>
    </div>
  </div>`;
}

/* ── room aggregation (Shift Supervisor view) ── */
function buildRoomCertRows(users, registered, kind) {
  const isLidar = kind === 'lidar';
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
    <div class="br-row room-detail-row" style="animation-delay:${Math.min(i, 20) * 15}ms">
      <div class="room-detail-main">
        <span class="br-label"><i class="fas fa-door-open"></i>${esc(m.room)}</span>
        <span class="br-pill pill-cyan"><i class="fas fa-certificate"></i>${reg} registered</span>
      </div>
      <div class="room-detail-stats">
        <span class="br-pill pill-blue"><i class="fas fa-users"></i>${working} working</span>
        ${isLidar
          ? `<span class="br-pill pill-yellow"><i class="fas fa-cube"></i>${m.qa} LIDAR QA</span>`
          : `<span class="br-pill pill-blue"><i class="fas fa-road"></i>${m.fp} FP</span>
        <span class="br-pill pill-yellow"><i class="fas fa-gavel"></i>${m.qa} QA</span>`}
        ${m.violations > 0
          ? `<span class="br-pill pill-red"><i class="fas fa-triangle-exclamation"></i>${m.violations} issue${m.violations>1?'s':''}</span>`
          : `<span class="br-pill pill-green"><i class="fas fa-circle-check"></i>all OK</span>`}
      </div>
    </div>`;
  }).join('');
}

/* ── ONE panel for both certifications ── */
async function openCertPanel(kind, locFilter) {
  const cfg = CERT_KINDS[kind];
  const sub = locFilter ? locFilter : cfg.overview;
  openCenterModal(cfg.title, sub,
    '<div class="qc-modal-spin"><div class="spin-ring"></div></div>');

  try {
    const d = await fetchCert(kind, locFilter);
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
        <i class="fas ${cfg.workIcon}"></i>
        <p>${esc(cfg.emptyMsg)}</p>
      </div>`;
      return;
    }

    let html = `
    <div class="br-summary-card lane-cert-summary">
      <div class="br-summary-row">
        <span class="brs-label"><i class="fas fa-certificate"></i>${esc(cfg.regLabel)}</span>
        <span class="brs-val">${regIn}</span>
      </div>
      ${cfg.levels ? `
      <div class="br-summary-row">
        <span class="brs-label"><span class="reg-dot reg-dot-fp"></span>Certified FP</span>
        <span class="brs-val brs-val-sm c-blue">${regFP}</span>
      </div>` : ''}
      <div class="br-summary-row">
        <span class="brs-label"><span class="reg-dot reg-dot-qa"></span>Certified QA</span>
        <span class="brs-val brs-val-sm c-green">${regQA}</span>
      </div>
      <div class="br-summary-row">
        <span class="brs-label"><i class="fas ${cfg.workIcon}"></i>${esc(cfg.workLabel)}</span>
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
        <span class="brs-label"><i class="fas fa-user-clock"></i>${esc(cfg.idleSummary)}</span>
        <span class="brs-val brs-val-sm" style="color:var(--t-3)">${regNotWorking.length}</span>
      </div>` : ''}
    </div>`;

    if (isShiftSup) {
      html += `<div class="br-section" style="margin-top:20px">${esc(cfg.roomTitle)}</div>`;
      html += buildRoomCertRows(users, registered, kind) ||
        `<p class="br-empty">${esc(cfg.noActivity)}</p>`;

      html += `<div class="br-section" style="margin-top:20px">Not Certified Labelers (${issues.length})</div>`;
      if (issues.length) {
        html += issues.map((u, i) => certUserRow(u, i, kind)).join('');
      } else {
        html += `<p class="br-empty">${esc(cfg.allOkMsg)}</p>`;
      }
    } else {
      html += `<div class="br-section" style="margin-top:20px">${esc(cfg.workingTitle)} (${users.length})</div>`;
      if (users.length) {
        html += users.map((u, i) => certUserRow(u, i, kind)).join('');
      } else {
        html += `<p class="br-empty">${esc(cfg.noWorkMsg)}</p>`;
      }
      if (regNotWorking.length) {
        html += `<div class="br-section" style="margin-top:20px">${esc(cfg.idleTitle)} (${regNotWorking.length})</div>`;
        html += regNotWorking.map((r, i) => regNotWorkingRow(r, i, kind)).join('');
      }
    }

    content.innerHTML = html;
  } catch(e) {
    document.getElementById('centerModalContent').innerHTML = `<div class="qc-empty"><i class="fas fa-triangle-exclamation"></i><p>${esc(e.message)}</p></div>`;
  }
}
function openLaneLineCertPanel(locFilter) { return openCertPanel('lane', locFilter); }
function openLidarQaCertPanel(locFilter)  { return openCertPanel('lidar', locFilter); }
