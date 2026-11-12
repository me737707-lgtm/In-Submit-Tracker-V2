/* ================================================
VIEWS-MAIN.JS  v4.8.0 — main dashboard (QC / admin) · filters · search
================================================ */
/* ================================================
MAIN DASHBOARD FETCH
================================================ */
async function fetchMain(showLoader, manual) {
  if (S.loading && !manual) return;
  const date = fmtDate(D.datePicker.value);
  const key  = K.dash(date);
  try {
    S.loading = true;
    if (showLoader) {
      const st = swrLoad(key);
      if (st && st.data && Object.keys(st.data).length) {       /* instant paint, refresh right after */
        S._stalePaint = true;
        try { applyMain(st, true, true); } finally { S._stalePaint = false; }
        setStatus('updating');
      } else renderLoader(D.mainContent);
    }
    
    /* FAST NON-BLOCKING LOAD: fetch main dashboard data immediately first */
    const json = await api({ action: 'main', date }, key, 0);
    swrSave(key, json);
    applyMain(json, showLoader, manual);

    /* Background fetch for QC supplemental cards if needed (non-blocking) */
    if (isQcUser()) {
      primeBatch([
        { key: K.atlow(date), params: { action: 'activetimeLow', date } },
        { key: K.lane(date),  params: { action: 'laneLineCert', date } }
      ].concat(healthItems())).then(() => {
        if (typeof refreshQcAtotCard === 'function') refreshQcAtotCard();
      }).catch(() => {});
    }
  } catch(e) {
    setStatus('error');
    renderError(D.mainContent, e);
  } finally { S.loading = false; }
}

function applyMain(json, showLoader, manual) {
  const date = fmtDate(D.datePicker.value);
  const data = json.data || {};
  if (!Object.keys(data).length) {
    renderEmpty(D.mainContent, 'No data for ' + date + '. Check the date or wait for sync.');
    setStatus('error'); return false;
  }
  S.raw      = data;
  S.filtered = filterForUser(data);
  setStatus('live');
  const hash = makeHash(S.filtered);
  if (hash !== S.lastHash || showLoader || manual) {
    S.lastHash = hash;
    rebuildFilters();
    renderDashboard();
    if (!showLoader && !manual) showToast();
  }
  S.firstLoad = false;
  return true;
}

function manualRefresh() {
  cDel();                       /* wipe every client cache (date changed / manual refresh) */
  S._sig = {};
  const kind = userKind();
  if (kind === 'ss') fetchShiftSupervisor(true);
  else if (kind === 'sup') fetchSupervisorDashboard(true);
  else fetchMain(true, true);
}

function filterForUser(data) {
  const u = S.user;
  if (!u) return data;
  const userRoleLower = (u.role || '').toLowerCase();
  if (userRoleLower === 'supervisor' || userRoleLower === 'supervisors' || u.role === CONFIG.ROLES.SUPERVISOR) return data;
  if (userRoleLower === 'qc' || u.role === CONFIG.ROLES.QC || u.permission === 'only') {
    const out = {};
    for (const [shift, locs] of Object.entries(data))
      for (const [loc, teams] of Object.entries(locs))
        for (const [tn, td] of Object.entries(teams)) {
          const base = tn.replace(/\s*\([A-Z]{1,3}\)\s*$/, '').trim();
          if (base === u.username || tn === u.username) {
            out[shift]          = out[shift] || {};
            out[shift][loc]     = out[shift][loc] || {};
            out[shift][loc][tn] = td;
          }
        }
    return out;
  }
  return data;
}


/* ================================================
FILTERS & SEARCH
================================================ */
function rebuildFilters() {
  const shifts = new Set(), locs = new Set();
  const data = S.filtered;
  Object.keys(data).forEach(s => { shifts.add(s); Object.keys(data[s]).forEach(l => locs.add(l)); });
  Object.keys(CONFIG.LOCATION_GROUPS).forEach(g => locs.add(g));
  const curS = D.shiftFilter.value, curL = D.locFilter.value;

  D.shiftFilter.innerHTML = '<option value="all">All Shifts</option>';
  Array.from(shifts).sort().forEach(s => {
    const o = document.createElement('option');
    o.value = s; o.textContent = CONFIG.SHIFT_LABELS[s] || 'Shift ' + s;
    if (s === curS) o.selected = true;
    D.shiftFilter.appendChild(o);
  });

  D.locFilter.innerHTML = '<option value="all">All Locations</option>';
  Object.keys(CONFIG.LOCATION_GROUPS).sort().forEach(g => {
    const o = document.createElement('option');
    o.value = g; o.textContent = '📍 ' + g; o.style.fontWeight = '700';
    if (g === curL) o.selected = true;
    D.locFilter.appendChild(o);
  });
  const grouped = new Set(Object.values(CONFIG.LOCATION_GROUPS).flat());
  Array.from(locs).filter(l => !grouped.has(l) && !CONFIG.LOCATION_GROUPS[l]).sort().forEach(l => {
    const o = document.createElement('option');
    o.value = l; o.textContent = l;
    if (l === curL) o.selected = true;
    D.locFilter.appendChild(o);
  });
}

function handleSearch() {
  S.search = D.searchInput.value.toLowerCase().trim();
  renderDashboard();
}

function matches(email, pc) {
  if (!S.search) return true;
  return email.toLowerCase().includes(S.search) || String(pc).toLowerCase().includes(S.search);
}

/* ================================================
RENDER DASHBOARD
================================================ */
function renderDashboard() {
  const selShift = D.shiftFilter.value;
  const selLoc   = D.locFilter.value;
  const data     = S.filtered;
  const userRoleLower = (S.user?.role || '').toLowerCase();
  const isSup    = userRoleLower === 'supervisor' || userRoleLower === 'supervisors' || S.user?.role === CONFIG.ROLES.SUPERVISOR;
  const isQC     = userRoleLower === 'qc' || S.user?.role === CONFIG.ROLES.QC;

  D.mainContent.innerHTML = '';

  if (!Object.keys(data).length) {
    renderEmpty(D.mainContent, isQC ? 'No data found for your team today.' : 'No data available.'); return;
  }

  if (isQC) {
    const dual = document.createElement('div');
    dual.className = 'dual-section-grid';

    const qcSection = document.createElement('div');
    qcSection.className = 'loc-section at-low-section';
    qcSection.innerHTML = `
    <div class="loc-header">
      <div class="loc-icon-wrap">
        <i class="fas fa-clock-rotate-left"></i>
      </div>
      <div class="loc-title-wrap">
        <h2 class="loc-name">Active Time &amp; ATOT%</h2>
        <span class="loc-sub" id="atLowCountQC">Loading...</span>
      </div>
      <div class="loc-actions">
        <button class="tl-bd-btn atr-btn" onclick="openAtotRangePicker()" title="Average for specific days">
          <i class="fas fa-calendar-days"></i> Custom range
        </button>
        <button class="tl-bd-btn" onclick="openActivetimeLowPanel()">
          <i class="fas fa-eye"></i> Breakdown
        </button>
      </div>
    </div>
    <div id="atRangeBar" class="atr-bar" style="display:none"></div>
    <div class="atot-cards-row">
      <div class="atot-card atot-card-red clickable" onclick="openActivetimeLowPanel(null,'below')" title="Show employees below 80%">
        <div class="atot-card-icon"><i class="fas fa-arrow-down"></i></div>
        <div class="atot-card-body">
          <div class="atot-card-label">Below 80%</div>
          <div class="atot-card-val" id="atLowBelowQC">—</div>
        </div>
      </div>
      <div class="atot-card atot-card-green clickable" onclick="openActivetimeLowPanel(null,'above')" title="Show employees above 80%">
        <div class="atot-card-icon"><i class="fas fa-arrow-up"></i></div>
        <div class="atot-card-body">
          <div class="atot-card-label">Above 80%</div>
          <div class="atot-card-val" id="atLowAboveQC">—</div>
        </div>
      </div>
    </div>
    <div class="atot-ave-display">
      <span class="atot-ave-label">Team AVE</span>
      <span class="atot-ave-val" id="atLowAVEQC">—</span>
    </div>
    `;
    dual.appendChild(qcSection);

    const laneSection = document.createElement('div');
    laneSection.className = 'loc-section lane-cert-section';
    laneSection.innerHTML = `
    <div class="loc-header">
      <div class="loc-icon-wrap">
        <i class="fas fa-certificate"></i>
      </div>
      <div class="loc-title-wrap">
        <h2 class="loc-name">Lane Line Certification</h2>
        <span class="loc-sub" id="laneCertCountQC">Loading...</span>
      </div>
      <div class="loc-actions">
        <button class="tl-bd-btn" onclick="openLaneLineCertPanel()">
          <i class="fas fa-eye"></i> Breakdown
        </button>
      </div>
    </div>
    `;
    dual.appendChild(laneSection);
    D.mainContent.appendChild(dual);

    refreshQcAtotCard();          /* today's numbers, or the selected custom range */

    fetchLaneLineCert().then(d => {
      const el = document.getElementById('laneCertCountQC');
      if (!el) return;
      if (d.success) {
        if (d.issuesCount > 0) {
          el.innerHTML = '<span style="color:var(--red);font-weight:700;">' + d.issuesCount +
            '</span> issues · ' + d.registeredInScope + ' reg.';
        } else {
          el.innerHTML = '<span style="color:var(--green);font-weight:700;">All certified ✓</span> · ' +
            d.registeredInScope + ' reg.';
        }
      } else {
        el.textContent = 'Unavailable';
      }
    });
  }

  let animIdx = 0;
  for (const [shift, locs] of Object.entries(data)) {
    if (selShift !== 'all' && shift !== selShift) continue;
    const wrapper = document.createElement('div');
    wrapper.className = 'shift-block';
    wrapper.innerHTML = `<div class="shift-badge"><i class="fas fa-clock"></i>${CONFIG.SHIFT_LABELS[shift] || shift} Shift</div>`;
    const rendered = new Set();
    Object.keys(CONFIG.LOCATION_GROUPS).forEach(grp => {
      if (selLoc !== 'all' && selLoc !== grp) return;
      const members = (CONFIG.LOCATION_GROUPS[grp] || []).filter(r => locs[r]);
      if (!members.length) return;
      wrapper.appendChild(buildGroupSection(grp, shift, locs, members, animIdx++, isSup, isQC));
      members.forEach(m => rendered.add(m));
    });
    for (const [loc, teams] of Object.entries(locs)) {
      if (selLoc !== 'all' && selLoc !== loc) continue;
      if (rendered.has(loc)) continue;
      wrapper.appendChild(buildLocSection(loc, teams, shift, animIdx++, isSup, isQC));
    }
    D.mainContent.appendChild(wrapper);
  }
}

function buildGroupSection(grpName, shift, allLocs, members, idx, isSup, isQC) {
  let totSub = 0, totPend = 0;
  const roomData = {};
  members.forEach(r => { roomData[r] = allLocs[r];
    Object.values(allLocs[r]).forEach(t => { totSub += t.submitted.length; totPend += t.notSubmitted.length; }); });
  const total = totSub + totPend, pct = total ? Math.round((totSub / total) * 100) : 0;

  const sec = document.createElement('div');
  sec.className = 'loc-section'; sec.style.animationDelay = (idx * CONFIG.ANIMATION_STAGGER_DELAY) + 'ms';
  sec.innerHTML = `
  <div class="loc-header">
    <div class="loc-icon-wrap"><i class="fas fa-building"></i></div>
    <div class="loc-title-wrap">
      <h2 class="loc-name">${esc(grpName)}</h2>
      <span class="loc-sub">${members.length} rooms</span>
    </div>
  </div>
  ${heroStats(totSub, totPend, total, pct)}`;

  const roomsWrap = document.createElement('div');
  roomsWrap.className = 'rooms-wrap';
  members.forEach((r, i) => {
    const sub = document.createElement('div');
    sub.className = 'room-block';
    sub.innerHTML = `<div class="room-header ${isSup ? 'clickable' : ''}" ${isSup ? `onclick="openRoomPanel('${esc(r)}')"` : ''}>
      <i class="fas fa-door-open"></i><span>${esc(r)}</span>
      ${isSup ? '<i class="fas fa-chart-bar room-bd-ic"></i>' : ''}
    </div>`;
    sub.appendChild(buildTeamsGrid(roomData[r], shift, r, i, isSup, isQC));
    roomsWrap.appendChild(sub);
  });
  sec.appendChild(roomsWrap);
  return sec;
}

function buildLocSection(loc, teams, shift, idx, isSup, isQC) {
  let s = 0, n = 0;
  Object.values(teams).forEach(t => { s += t.submitted.length; n += t.notSubmitted.length; });
  const total = s + n, pct = total ? Math.round((s / total) * 100) : 0;

  const sec = document.createElement('div');
  sec.className = 'loc-section'; sec.style.animationDelay = (idx * CONFIG.ANIMATION_STAGGER_DELAY) + 'ms';
  sec.innerHTML = `
  <div class="loc-header ${isSup ? 'clickable' : ''}" ${isSup ? `onclick="openSupervisorPanel('${esc(loc)}')"` : ''}>
    <div class="loc-icon-wrap"><i class="fas fa-map-marker-alt"></i></div>
    <div class="loc-title-wrap">
      <h2 class="loc-name">${esc(loc)}</h2>
    </div>
    ${isSup ? '<span class="loc-bd-hint"><i class="fas fa-chart-bar"></i> Breakdown</span>' : ''}
  </div>
  ${heroStats(s, n, total, pct)}`;

  sec.appendChild(buildTeamsGrid(teams, shift, loc, 0, isSup, isQC));
  return sec;
}

function heroStats(sub, pend, total, pct) {
  const r = 35, circ = (2 * Math.PI * r).toFixed(1), off = (circ - (pct / 100) * circ).toFixed(1);
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

function buildTeamsGrid(teams, shift, loc, roomIdx, isSup, isQC) {
  const grid = document.createElement('div');
  grid.className = 'teams-grid';
  let cardIdx = 0;

  for (const [tl, td] of Object.entries(teams)) {
    const id  = ('tc-' + shift + '-' + loc + '-' + tl).replace(/\s+/g, '-');
    const fSub  = td.submitted.filter(u => matches(u.email, u.pc));
    const fPend = td.notSubmitted.filter(u => matches(u.email, u.pc));
    if (S.search && !fSub.length && !fPend.length) continue;

    const isOpen = S.openTeams.has(id) ? 'open' : '';
    const delay  = (roomIdx + 1) * 40 + (++cardIdx) * 40;

    const bdBtn = isQC
      ? `<button class="tl-bd-btn" onclick="event.stopPropagation();openQcPanel('${esc(tl)}')" title="Task breakdown"><i class="fas fa-chart-bar"></i> Tasks</button>`
      : isSup
        ? `<button class="tl-bd-btn" onclick="event.stopPropagation();openSupervisorPanel('${esc(loc)}')" title="Location breakdown"><i class="fas fa-chart-bar"></i> Breakdown</button>`
        : '';

    const card = document.createElement('div');
    card.className = `team-card ${isOpen}`; card.id = id; card.style.animationDelay = delay + 'ms';
    card.innerHTML = `
    <div class="team-head" onclick="toggleTeam('${id}')">
      <div class="tl-info">
        <div class="tl-name"><i class="fas fa-user-tie"></i>${esc(tl)}</div>
        <div class="tl-badges">
          <span class="tbadge tbadge-green"><i class="fas fa-check"></i>${fSub.length} done</span>
          <span class="tbadge tbadge-red"><i class="fas fa-clock"></i>${fPend.length} pending</span>
        </div>
      </div>
      ${bdBtn}
      <div class="chevron ${isOpen}"><i class="fas fa-chevron-down"></i></div>
    </div>
    <div class="team-body">
      <div class="split-cols">
        <div class="col-wrap">
          <div class="col-head pending-head"><i class="fas fa-clock"></i>Pending<span class="col-cnt">${fPend.length}</span></div>
          ${fPend.length ? fPend.map((u, i) => userCard(u, 'pend', i)).join('') : '<div class="col-empty">All clear ✓</div>'}
        </div>
        <div class="col-wrap">
          <div class="col-head done-head"><i class="fas fa-check-double"></i>Submitted<span class="col-cnt">${fSub.length}</span></div>
          ${fSub.length ? fSub.map((u, i) => userCard(u, 'done', i)).join('') : '<div class="col-empty">None yet</div>'}
        </div>
      </div>
    </div>`;
    grid.appendChild(card);
  }
  return grid;
}

function toggleTeam(id) {
  const c = document.getElementById(id); if (!c) return;
  c.classList.toggle('open');
  c.querySelector('.chevron')?.classList.toggle('open');
  if (c.classList.contains('open')) S.openTeams.add(id); else S.openTeams.delete(id);
}

function userCard(u, type, idx) {
  return `<div class="user-card uc-${type}" style="animation-delay:${Math.min(idx, 20) * 15}ms">
    <div class="uc-email">${esc(u.email)}</div>
    <div class="uc-pc"><i class="fas fa-desktop"></i>${esc(u.pc)}</div>
  </div>`;
}
