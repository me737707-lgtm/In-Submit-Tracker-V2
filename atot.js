/* ================================================
ATOT.JS  v4.2.0 — Active Time & ATOT% (day view + QC custom range)
================================================ */
/* ================================================
ACTIVE TIME & ATOT% — v3.9.0
================================================ */
async function fetchActivetimeLow(locFilter) {
  /* during the instant paint the fresh batch is already on its way → don't start a second request;
     the full render that follows asks again (and finds the answer in the cache) */
  if (S._stalePaint) return new Promise(() => {});
  const date = fmtDate(D.datePicker.value);
  const d = await api({ action: 'activetimeLow', date }, K.atlow(date));

  /* client-side location filter for supervisor cards.
     The server tags every row with locKey = the supervisor location it belongs to
     (alias-aware, e.g. 106 → NC Unit 104 / 105). */
  if (d.success && locFilter) {
    const locLow = locFilter.toLowerCase();
    const locOk = (x) => {
      if (x && x.locKey && String(x.locKey).toLowerCase() === locLow) return true;
      const e = ((x && x.location) || '').toLowerCase();
      return (e && (e === locLow || e.includes(locLow) || locLow.includes(e))) ||
        (locLow === 'saint fatima' && (e.startsWith('sf ') || e.includes('saint fatima')));
    };
    const filtered      = (d.employees || []).filter(locOk);
    const filteredBelow = (d.below80   || []).filter(locOk);
    const filteredAbove = (d.above80   || []).filter(locOk);
    let teamAVE = 0;
    if (filtered.length > 0) {
      teamAVE = Math.round((filtered.reduce((s, e) => s + e.atotPct, 0) / filtered.length) * 100) / 100;
    }
    return { success: true, count: filtered.length, employees: filtered, teamAVE,
             below80: filteredBelow, above80: filteredAbove };
  }
  return d;
}

/* ── helpers for ATOT panel ── */
function cleanTeamName(t) {
  return (t || '').replace(/\s*\([A-Za-z\s]+\)\s*$/, '').trim() || 'Unknown';
}

function atotPersonRow(e, i) {
  const c  = e.atotPct >= 80 ? 'var(--green)'    : 'var(--red)';
  const bg = e.atotPct >= 80 ? 'var(--green-bg)' : 'var(--red-bg)';
  const br = e.atotPct >= 80 ? 'var(--green-br)' : 'var(--red-br)';
  return `
  <div class="br-row atot-row" style="animation-delay:${i * 15}ms">
    <div class="atot-id-col">
      <div class="atot-avatar">${(e.employee || e.email || '?')[0].toUpperCase()}</div>
      <div class="atot-info">
        <div class="atot-name">${esc(e.employee || e.email)}</div>
        <div class="atot-sub">
          <span><i class="fas fa-id-card"></i> ${esc(e.nationalId || 'N/A')}</span>
          <span><i class="fas fa-users"></i> ${esc(cleanTeamName(e.tlQtc))}</span>
          <span><i class="fas fa-map-marker-alt"></i> ${esc(e.location || 'N/A')}</span>
        </div>
      </div>
    </div>
    <div class="atot-hours-grid">
      <div class="atot-hour-item">
        <span class="atot-hour-label">Actual</span>
        <span class="atot-hour-val">${esc(e.actualHours)}h</span>
      </div>
      <div class="atot-hour-item">
        <span class="atot-hour-label">OT</span>
        <span class="atot-hour-val">${esc(e.overtimeHours)}h</span>
      </div>
      <div class="atot-hour-item">
        <span class="atot-hour-label">Expected</span>
        <span class="atot-hour-val">${esc(e.expectedHours)}h</span>
      </div>
    </div>
    <div class="atot-pct-col">
      <span class="atot-pct-badge" style="background:${bg};color:${c};border-color:${br};">
        ${e.atotPct.toFixed(1)}%
      </span>
      <span class="atot-att-status">${esc(e.attendance || '')}</span>
    </div>
  </div>`;
}

/* ── panel: locFilter = location (supervisor) | null
          category  = 'below' | 'above' | null (all) ── */
async function openActivetimeLowPanel(locFilter, category) {
  if (S.atRange && !locFilter && isQcUser()) { openAtotRangePanel(category); return; }   /* custom range active */
  let sub = locFilter ? locFilter : 'ATOT% Overview';
  if (category === 'below') sub += ' · Below 80%';
  if (category === 'above') sub += ' · Above 80%';

  openCenterModal('Active Time & ATOT%', sub,
    '<div class="qc-modal-spin"><div class="spin-ring"></div></div>');

  try {
    const d = await fetchActivetimeLow(locFilter);
    if (!d.success) throw new Error(d.error || 'Failed');

    const emps  = d.employees || [];
    const below = d.below80   || [];
    const above = d.above80   || [];
    const ave   = d.teamAVE   || 0;

    let list = emps;
    if (category === 'below') list = below;
    if (category === 'above') list = above;

    if (emps.length === 0) {
      document.getElementById('centerModalContent').innerHTML =
        '<div class="qc-empty"><i class="fas fa-user-check"></i>' +
        '<p>No employees found for today.</p></div>';
      return;
    }
    if (list.length === 0) {
      document.getElementById('centerModalContent').innerHTML = `
      <div class="atot-summary-bar">
        <div class="atot-sum-item"><span class="atot-sum-label">Team AVE</span>
          <span class="atot-sum-val ${ave >= 80 ? 'c-green' : 'c-red'}">${ave.toFixed(1)}%</span></div>
        <div class="atot-sum-item"><span class="atot-sum-label">Total</span>
          <span class="atot-sum-val">${emps.length}</span></div>
        <div class="atot-sum-item below"><span class="atot-sum-label">Below 80%</span>
          <span class="atot-sum-val c-red">${below.length}</span></div>
        <div class="atot-sum-item above"><span class="atot-sum-label">Above 80%</span>
          <span class="atot-sum-val c-green">${above.length}</span></div>
      </div>
      <div class="qc-empty"><i class="fas fa-user-check"></i>
        <p>No employees in this category 🎉</p></div>`;
      return;
    }

    /* ── group by team ── */
    const groups = {};
    list.forEach(e => {
      const t = cleanTeamName(e.tlQtc);
      (groups[t] = groups[t] || []).push(e);
    });

    let rowsHtml = '';
    Object.keys(groups).sort().forEach(team => {
      const arr    = groups[team];
      const tAve   = arr.reduce((s, e) => s + e.atotPct, 0) / arr.length;
      const tBelow = arr.filter(e => e.atotPct < 80).length;
      rowsHtml += `
      <div class="br-section atot-team-head" style="margin-top:18px">
        <span><i class="fas fa-users"></i> ${esc(team)}</span>
        <span class="atot-team-pills">
          <span class="br-pill pill-blue">${arr.length} emp</span>
          <span class="br-pill pill-red">${tBelow} below</span>
          <span class="br-pill ${tAve >= 80 ? 'pill-green' : 'pill-red'}">AVE ${tAve.toFixed(1)}%</span>
        </span>
      </div>`;
      rowsHtml += arr.map((e, i) => atotPersonRow(e, i)).join('');
    });

    document.getElementById('centerModalContent').innerHTML = `
    <div class="atot-summary-bar">
      <div class="atot-sum-item">
        <span class="atot-sum-label">Team AVE</span>
        <span class="atot-sum-val ${ave >= 80 ? 'c-green' : 'c-red'}">${ave.toFixed(1)}%</span>
      </div>
      <div class="atot-sum-item">
        <span class="atot-sum-label">Total</span>
        <span class="atot-sum-val">${emps.length}</span>
      </div>
      <div class="atot-sum-item below">
        <span class="atot-sum-label">Below 80%</span>
        <span class="atot-sum-val c-red">${below.length}</span>
      </div>
      <div class="atot-sum-item above">
        <span class="atot-sum-label">Above 80%</span>
        <span class="atot-sum-val c-green">${above.length}</span>
      </div>
    </div>
    <div class="br-section" style="margin-top:20px">
      ${category === 'below' ? 'Below 80% Employees' :
        category === 'above' ? 'Above 80% Employees' : 'Employee Details'}
      <span class="atot-team-pills"><span class="br-pill pill-blue">${list.length}</span></span>
    </div>
    ${rowsHtml}`;

  } catch (err) {
    document.getElementById('centerModalContent').innerHTML =
      '<div class="qc-empty"><i class="fas fa-triangle-exclamation"></i>' +
      '<p>' + err.message + '</p></div>';
  }
}


/* ================================================
ACTIVE TIME & ATOT% — CUSTOM RANGE (QC)   v4.0.0
Pick a from/to range, then switch single days on/off (e.g. skip days off),
and get the team average for exactly those days.
Team AVE   = average of every ATOT% record of the team in the chosen days
             (for one day it equals the normal Team AVE)
Below/Above = by each employee's average over the chosen days
================================================ */
const WD3  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MON3 = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const ATR_MAX_DAYS = (typeof CONFIG !== 'undefined' && CONFIG.ATOT_MAX_RANGE_DAYS) || 62;

function ymdToUtc(ymd){ const p = ymd.split('-').map(Number); return new Date(Date.UTC(p[0], p[1]-1, p[2])); }
function utcToYmd(dt){ return dt.getUTCFullYear()+'-'+String(dt.getUTCMonth()+1).padStart(2,'0')+'-'+String(dt.getUTCDate()).padStart(2,'0'); }
function addDaysYmd(ymd, n){ const dt = ymdToUtc(ymd); dt.setUTCDate(dt.getUTCDate()+n); return utcToYmd(dt); }
function dmyKey(dmy){ const p = dmy.split('-'); return p[2]+p[1]+p[0]; }
function daysInRange(fromYmd, toYmd){
  if (!fromYmd || !toYmd) return [];
  if (fromYmd > toYmd) { const t = fromYmd; fromYmd = toYmd; toYmd = t; }
  const out = [];
  let cur = fromYmd;
  while (cur <= toYmd && out.length <= ATR_MAX_DAYS) { out.push(fmtDate(cur)); cur = addDaysYmd(cur, 1); }
  return out;
}
function dmyParts(dmy){
  const p = dmy.split('-').map(Number);
  const dt = new Date(Date.UTC(p[2], p[1]-1, p[0]));
  return { d: String(p[0]).padStart(2,'0'), mon: MON3[p[1]-1], wd: WD3[dt.getUTCDay()] };
}
function dmyShort(dmy){ const x = dmyParts(dmy); return x.d+' '+x.mon; }

/* ── picker ── */
function openAtotRangePicker() {
  const sel  = D.datePicker.value || cairoToday();
  const prev = S.atRange;
  const from = prev ? prev.fromYmd : addDaysYmd(sel, -6);
  const to   = prev ? prev.toYmd   : sel;
  S._atrSel = new Set(prev ? prev.days : daysInRange(from, to));
  openCenterModal('Custom range', 'Active Time & ATOT% · choose the days', `
  <div class="atr-wrap">
    <div class="atr-row">
      <label class="atr-field"><span>From</span>
        <input type="date" id="atrFrom" class="ctrl-date" value="${from}" onchange="atrRebuild()"></label>
      <label class="atr-field"><span>To</span>
        <input type="date" id="atrTo" class="ctrl-date" value="${to}" onchange="atrRebuild()"></label>
    </div>
    <div class="atr-presets">
      <button type="button" class="atr-preset" onclick="atrPreset(7)">Last 7 days</button>
      <button type="button" class="atr-preset" onclick="atrPreset(14)">Last 14 days</button>
      <button type="button" class="atr-preset" onclick="atrPreset(30)">Last 30 days</button>
      <button type="button" class="atr-preset" onclick="atrPreset('month')">This month</button>
    </div>
    <div class="atr-days-head">
      <span id="atrCount"></span>
      <span class="atr-days-tools">
        <button type="button" class="atr-link" onclick="atrAll(true)">Select all</button>
        <button type="button" class="atr-link" onclick="atrAll(false)">Clear</button>
      </span>
    </div>
    <div id="atrDays" class="atr-days"></div>
    <p id="atrHint" class="atr-hint"></p>
    <div class="atr-actions">
      ${prev ? '<button type="button" class="atr-reset" onclick="resetAtotRange()"><i class="fas fa-rotate-left"></i> Back to today</button>' : '<span></span>'}
      <button type="button" id="atrApply" class="atr-apply" onclick="applyAtotRange()"><i class="fas fa-check"></i> Apply</button>
    </div>
  </div>`);
  atrRenderDays();
}
function atrInputs() {
  return { from: document.getElementById('atrFrom').value, to: document.getElementById('atrTo').value };
}
function atrRebuild() {
  const r = atrInputs();
  S._atrSel = new Set(daysInRange(r.from, r.to));
  atrRenderDays();
}
function atrPreset(n) {
  const to = D.datePicker.value || cairoToday();
  const from = n === 'month' ? to.slice(0, 8) + '01' : addDaysYmd(to, -(n - 1));
  document.getElementById('atrFrom').value = from;
  document.getElementById('atrTo').value   = to;
  atrRebuild();
}
function atrAll(on) {
  const r = atrInputs();
  S._atrSel = on ? new Set(daysInRange(r.from, r.to)) : new Set();
  atrRenderDays();
}
function atrToggle(dmy) {
  if (S._atrSel.has(dmy)) S._atrSel.delete(dmy); else S._atrSel.add(dmy);
  atrRenderDays();
}
function atrRenderDays() {
  const r = atrInputs();
  let list = daysInRange(r.from, r.to);
  const tooMany = list.length > ATR_MAX_DAYS;
  if (tooMany) list = list.slice(0, ATR_MAX_DAYS);
  const box = document.getElementById('atrDays');
  if (!box) return;
  box.innerHTML = list.map(dmy => {
    const x = dmyParts(dmy);
    return `<button type="button" class="atr-chip ${S._atrSel.has(dmy) ? 'on' : ''}" onclick="atrToggle('${dmy}')">
      <b>${x.d}</b><span>${x.mon}</span><small>${x.wd}</small></button>`;
  }).join('') || '<p class="br-empty">Pick a from / to date.</p>';
  const n = list.filter(d => S._atrSel.has(d)).length;
  document.getElementById('atrCount').textContent = n + ' of ' + list.length + ' day' + (list.length === 1 ? '' : 's') + ' selected';
  document.getElementById('atrHint').textContent = tooMany ? 'Maximum ' + ATR_MAX_DAYS + ' days per range — showing the first ' + ATR_MAX_DAYS + '.' : '';
  document.getElementById('atrApply').disabled = n === 0;
}
async function applyAtotRange() {
  const r = atrInputs();
  const days = daysInRange(r.from, r.to).slice(0, ATR_MAX_DAYS).filter(d => S._atrSel.has(d));
  if (!days.length) return;
  const btn = document.getElementById('atrApply'), hint = document.getElementById('atrHint');
  const old = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Calculating…';
  try {
    const d = await api({ action: 'activetimeRange', days: days.join(',') }, K.range(days));
    if (!d.success) throw new Error(d.error || 'Failed');
    S.atRange = { days, fromYmd: r.from <= r.to ? r.from : r.to, toYmd: r.from <= r.to ? r.to : r.from, data: d };
    closeCenterModal();
    refreshQcAtotCard();
  } catch (e) {
    if (hint) hint.textContent = e.isAuth ? '' : (e.message || 'Failed');
    btn.disabled = false; btn.innerHTML = old;
  }
}
function resetAtotRange() {
  S.atRange = null;
  closeCenterModal();
  refreshQcAtotCard();
}

/* ── QC card (numbers + range bar) ── */
function paintQcAtot(d, countText) {
  const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
  set('atLowCountQC', countText);
  set('atLowBelowQC', (d.below80 || []).length);
  set('atLowAboveQC', (d.above80 || []).length);
  const ave = document.getElementById('atLowAVEQC');
  if (ave) {
    ave.textContent = (d.teamAVE || 0).toFixed(1) + '%';
    ave.className = 'atot-ave-val ' + ((d.teamAVE || 0) >= 80 ? 'c-green' : 'c-red');
  }
}
function refreshQcAtotCard() {
  const bar = document.getElementById('atRangeBar');
  const r = S.atRange;
  if (r) {
    const d = r.data;
    if (bar) {
      bar.style.display = 'flex';
      bar.innerHTML = `<i class="fas fa-calendar-days"></i>
        <span><b>${r.days.length}</b> day${r.days.length === 1 ? '' : 's'} · ${dmyShort(r.days[0])} → ${dmyShort(r.days[r.days.length - 1])}
        · ${d.daysWithData} with data</span>
        <button type="button" class="atr-edit" onclick="openAtotRangePicker()" title="Change days"><i class="fas fa-pen"></i></button>
        <button type="button" class="atr-x" onclick="resetAtotRange()" title="Back to today"><i class="fas fa-xmark"></i></button>`;
    }
    paintQcAtot(d, d.count + ' employees · ' + d.records + ' records');
    return;
  }
  if (bar) { bar.style.display = 'none'; bar.innerHTML = ''; }
  fetchActivetimeLow().then(d => { if (d.success && !S.atRange) paintQcAtot(d, d.count + ' employees'); }).catch(()=>{});
}

/* ── range breakdown panel ── */
function atotRangeRow(e, i) {
  const c  = e.atotPct >= 80 ? 'var(--green)'    : 'var(--red)';
  const bg = e.atotPct >= 80 ? 'var(--green-bg)' : 'var(--red-bg)';
  const br = e.atotPct >= 80 ? 'var(--green-br)' : 'var(--red-br)';
  const daily = Object.keys(e.daily || {}).sort((a, b) => dmyKey(a).localeCompare(dmyKey(b))).map(k => {
    const v = e.daily[k];
    return `<span class="atr-dv ${v >= 80 ? 'ok' : 'low'}" title="${esc(k)}">${esc(dmyShort(k))} <b>${v.toFixed(0)}%</b></span>`;
  }).join('');
  return `
  <div class="br-row atot-row atr-emp" style="animation-delay:${Math.min(i, 20) * 15}ms">
    <div class="atot-id-col">
      <div class="atot-avatar">${esc((e.employee || e.email || '?')[0].toUpperCase())}</div>
      <div class="atot-info">
        <div class="atot-name">${esc(e.employee || e.email)}</div>
        <div class="atot-sub">
          <span><i class="fas fa-id-card"></i> ${esc(e.nationalId || 'N/A')}</span>
          <span><i class="fas fa-users"></i> ${esc(cleanTeamName(e.tlQtc))}</span>
          <span><i class="fas fa-calendar-check"></i> ${e.daysCount} day${e.daysCount === 1 ? '' : 's'}</span>
        </div>
      </div>
    </div>
    <div class="atot-hours-grid">
      <div class="atot-hour-item"><span class="atot-hour-label">Avg actual</span><span class="atot-hour-val">${esc(e.actualHours)}h</span></div>
      <div class="atot-hour-item"><span class="atot-hour-label">Min</span><span class="atot-hour-val">${e.minPct.toFixed(0)}%</span></div>
      <div class="atot-hour-item"><span class="atot-hour-label">Max</span><span class="atot-hour-val">${e.maxPct.toFixed(0)}%</span></div>
    </div>
    <div class="atot-pct-col">
      <span class="atot-pct-badge" style="background:${bg};color:${c};border-color:${br};">${e.atotPct.toFixed(1)}%</span>
      <span class="atot-att-status">avg</span>
    </div>
    <div class="atr-daily">${daily}</div>
  </div>`;
}
function openAtotRangePanel(category) {
  const r = S.atRange;
  if (!r) { openActivetimeLowPanel(null, category); return; }
  const d = r.data;
  let sub = r.days.length + ' day' + (r.days.length === 1 ? '' : 's') + ' · ' + dmyShort(r.days[0]) + ' → ' + dmyShort(r.days[r.days.length - 1]);
  if (category === 'below') sub += ' · Below 80%';
  if (category === 'above') sub += ' · Above 80%';

  const emps = d.employees || [], below = d.below80 || [], above = d.above80 || [];
  const ave = d.teamAVE || 0;
  const summary = `
  <div class="atot-summary-bar">
    <div class="atot-sum-item"><span class="atot-sum-label">Team AVE</span>
      <span class="atot-sum-val ${ave >= 80 ? 'c-green' : 'c-red'}">${ave.toFixed(1)}%</span></div>
    <div class="atot-sum-item"><span class="atot-sum-label">Employees</span><span class="atot-sum-val">${emps.length}</span></div>
    <div class="atot-sum-item below"><span class="atot-sum-label">Below 80%</span><span class="atot-sum-val c-red">${below.length}</span></div>
    <div class="atot-sum-item above"><span class="atot-sum-label">Above 80%</span><span class="atot-sum-val c-green">${above.length}</span></div>
    <div class="atot-sum-item"><span class="atot-sum-label">Days</span><span class="atot-sum-val">${d.daysWithData}/${r.days.length}</span></div>
  </div>`;

  if (!emps.length) {
    openCenterModal('Active Time & ATOT% · Range', sub,
      '<div class="qc-empty"><i class="fas fa-user-check"></i><p>No ATOT data for the selected days.</p></div>');
    return;
  }

  const perDay = `
  <div class="br-section" style="margin-top:20px">Team AVE per day</div>
  <div class="atr-daylist">` + (d.perDay || []).map(x => {
    const p = dmyParts(x.date);
    if (x.noData) return `<div class="atr-day-row nodata"><span class="atr-day-name"><b>${p.d}</b> ${p.mon} <small>${p.wd}</small></span>
      <span class="atr-day-bar"></span><span class="atr-day-val">no data</span><span class="atr-day-n"></span></div>`;
    return `<div class="atr-day-row"><span class="atr-day-name"><b>${p.d}</b> ${p.mon} <small>${p.wd}</small></span>
      <span class="atr-day-bar"><i class="${x.ave >= 80 ? 'ok' : 'low'}" style="width:${Math.max(2, Math.min(100, x.ave))}%"></i></span>
      <span class="atr-day-val ${x.ave >= 80 ? 'c-green' : 'c-red'}">${x.ave.toFixed(1)}%</span>
      <span class="atr-day-n">${x.count} emp</span></div>`;
  }).join('') + `</div>`;

  let list = emps;
  if (category === 'below') list = below;
  if (category === 'above') list = above;
  let rowsHtml = '';
  if (!list.length) {
    rowsHtml = '<div class="qc-empty"><i class="fas fa-user-check"></i><p>No employees in this category 🎉</p></div>';
  } else {
    const groups = {};
    list.forEach(e => { const t = cleanTeamName(e.tlQtc); (groups[t] = groups[t] || []).push(e); });
    Object.keys(groups).sort().forEach(team => {
      const arr = groups[team];
      const tAve = arr.reduce((s, e) => s + e.atotPct, 0) / arr.length;
      const tBelow = arr.filter(e => e.atotPct < 80).length;
      rowsHtml += `
      <div class="br-section atot-team-head" style="margin-top:18px">
        <span><i class="fas fa-users"></i> ${esc(team)}</span>
        <span class="atot-team-pills">
          <span class="br-pill pill-blue">${arr.length} emp</span>
          <span class="br-pill pill-red">${tBelow} below</span>
          <span class="br-pill ${tAve >= 80 ? 'pill-green' : 'pill-red'}">AVE ${tAve.toFixed(1)}%</span>
        </span>
      </div>` + arr.map((e, i) => atotRangeRow(e, i)).join('');
    });
  }
  openCenterModal('Active Time & ATOT% · Range', sub, summary + perDay + `
    <div class="br-section" style="margin-top:20px">
      ${category === 'below' ? 'Below 80% Employees' : category === 'above' ? 'Above 80% Employees' : 'Employee Details'}
      <span class="atot-team-pills"><span class="br-pill pill-blue">${list.length}</span></span>
    </div>` + rowsHtml);
}
