/* ================================================
PANELS.JS  v4.7.0 — breakdown panels & modals
================================================ */
/* ================================================
BREAKDOWN PANEL
================================================ */
function openPanel(title, sub, htmlContent) {
  openCenterModal(title, sub, htmlContent);
}
function closePanel() {
  closeCenterModal();
}

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

function openPendingPanel(roomBreakdown, totalPending, pendingByTeam, pendingUsers) {
  const roomRows = Object.entries(roomBreakdown).map(([room, r]) => {
    if ((r.pending || 0) <= 0) return '';
    return `
    <div class="br-row room-detail-row">
      <div class="room-detail-main">
        <span class="br-label"><i class="fas fa-door-open"></i>${esc(room)}</span>
        <span class="br-pill pill-red">${r.pending || 0} pending</span>
      </div>
      <div class="room-detail-stats">
        <span class="br-pill pill-green"><i class="fas fa-user-check"></i>${r.active || 0} active</span>
        <span class="br-pill pill-blue"><i class="fas fa-check"></i>${r.submitted || 0} done</span>
      </div>
    </div>`;
  }).join('');

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

  let userRows = '';
  if (pendingUsers && pendingUsers.length > 0) {
    userRows = pendingUsers.map((u, i) => `
    <div class="br-row" style="animation-delay:${Math.min(i, 20) * 15}ms">
      <div class="br-user-main">
        <div class="br-user-avatar pend">${esc((u.email || '?')[0].toUpperCase())}</div>
        <div class="br-user-info">
          <div class="br-user-email">${esc(u.email)}</div>
          <div class="br-user-sub">
            <span><i class="fas fa-desktop"></i> ${esc(u.pc || 'N/A')}</span>
            <span class="br-user-sep">·</span>
            <span><i class="fas fa-user-tie"></i> ${esc(u.team || 'Unknown')}</span>
          </div>
        </div>
      </div>
      <span class="br-pill pill-red"><i class="fas fa-hourglass-half"></i> Pending</span>
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
          <div class="qc-avatar">${esc(qc[0].toUpperCase())}</div>
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
    content.innerHTML = `<div class="qc-empty"><i class="fas fa-triangle-exclamation"></i><p>${esc(e.message)}</p></div>`;
  }
}

function closeQcModal() {
  const modal = document.getElementById('qcModal');
  const mask = document.getElementById('qcModalMask');
  if (modal) modal.classList.remove('open');
  if (mask) mask.classList.remove('open');
  document.body.style.overflow = '';
}

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
        <span class="br-pill pill-blue"><i class="fas fa-cube"></i>LIDAR FP: ${r.LIDAR?.FP || 0}</span>
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
    ${Object.keys(t.other||{}).length?`
    <div class="br-section" style="margin-top:16px">Other Tasks</div>
    ${Object.entries(t.other).map(([k,v])=>`<div class="br-row"><span class="br-label">${esc(k)}</span><span class="br-pill pill-yellow">${v}</span></div>`).join('')}
    `:''}`;
    const content = document.getElementById('centerModalContent');
    if (content) content.innerHTML = html;
  } catch(e) {
    const content = document.getElementById('centerModalContent');
    if (content) content.innerHTML = `<div class="err-simple">${esc(e.message)}</div>`;
  }
}

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
    ${Object.entries(d.other).map(([k,v])=>`<div class="br-row"><span class="br-label">${esc(k)}</span><span class="br-pill pill-yellow">${v}</span></div>`).join('')}
    `:''}
    <div class="br-section" style="margin-top:20px">Team Breakdown</div>
    ${teamRows||'<p class="br-empty">No team data.</p>'}`;
    const content = document.getElementById('centerModalContent');
    if (content) content.innerHTML = html;
  } catch(e) {
    const content = document.getElementById('centerModalContent');
    if (content) content.innerHTML = `<div class="err-simple">${esc(e.message)}</div>`;
  }
}

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
    ${Object.entries(d.other).map(([k,v])=>`<div class="br-row"><span class="br-label">${esc(k)}</span><span class="br-pill pill-yellow">${v}</span></div>`).join('')}
    `:''}`;
    const content = document.getElementById('centerModalContent');
    if (content) content.innerHTML = html;
  } catch(e) {
    const content = document.getElementById('centerModalContent');
    if (content) content.innerHTML = `<div class="err-simple">${esc(e.message)}</div>`;
  }
}
