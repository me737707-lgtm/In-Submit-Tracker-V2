/* ================================================
EXPORT.JS  v4.0.0 — Pending users of the 3 shifts → Excel
Pending = active in attendance but no submit today.
Each user = one cell:   email / PC / | / Team (shift)
Allowed only for users the server flags with canExportPending (checked on the server too).
================================================ */
const PENDING_SHIFTS = [
  { key: 'M',  label: 'M (Morning)'    },
  { key: 'N',  label: 'N (Night)'      },
  { key: 'ON', label: 'ON (Overnight)' }
];
const EXCELJS_URLS = [
  'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js',
  'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js'
];

function pendingToast(msg, icon) {
  if (!D.toast) return;
  const old = D.toast.innerHTML;
  D.toast.innerHTML = '<i class="fas ' + (icon || 'fa-circle-info') + '"></i> ' + esc(msg);
  D.toast.classList.add('show');
  setTimeout(() => { D.toast.classList.remove('show'); D.toast.innerHTML = old; }, 3200);
}
function loadScriptOnce(url) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url; s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { s.remove(); reject(new Error('load failed: ' + url)); };
    document.head.appendChild(s);
  });
}
async function ensureExcelJS() {
  if (typeof ExcelJS !== 'undefined') return true;
  for (const url of EXCELJS_URLS) {
    try { await loadScriptOnce(url); if (typeof ExcelJS !== 'undefined') return true; }
    catch (e) { console.warn(e.message); }
  }
  return false;
}
/* one user → one 4-line block */
function pendingBlock(u, shiftKey) {
  const team = (u.team || '').trim() || 'No Team';
  const teamTxt = /\([A-Za-z]{1,9}\)\s*$/.test(team) ? team : team + ' (' + shiftKey + ')';
  return [u.email, u.pc || 'N/A', '|', teamTxt].join('\n');
}
function buildPendingWorkbook(EJ, d, dateLabel) {
  const wb = new EJ.Workbook();
  wb.creator = 'Submit Tracker';
  const ws = wb.addWorksheet('Pending', { views: [{ showGridLines: false }] });
  ws.columns = [{ width: 46 }];
  const thin = { style: 'thin', color: { argb: 'FFBFC5CD' } };
  const fills = { M: 'FFFDE68A', N: 'FFBFDBFE', ON: 'FFD1D5DB' };

  const title = ws.addRow(['Pending Users — ' + dateLabel + '   (Total: ' + (d.total || 0) + ')']);
  title.height = 26;
  title.getCell(1).font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
  title.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
  title.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

  if (d.noData) {
    const w = ws.addRow(['⚠ No submissions synced yet for this date — everyone active is listed as pending.']);
    w.getCell(1).font = { italic: true, color: { argb: 'FFB45309' } };
    w.getCell(1).alignment = { wrapText: true, vertical: 'middle' };
    w.height = 32;
  }
  PENDING_SHIFTS.forEach(sh => {
    const list = (d.shifts && d.shifts[sh.key]) || [];
    ws.addRow(['']);
    const h = ws.addRow([sh.label + '  —  ' + list.length]);
    h.height = 22;
    h.getCell(1).font = { bold: true, size: 12 };
    h.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fills[sh.key] } };
    h.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    h.getCell(1).border = { top: thin, bottom: thin, left: thin, right: thin };
    if (!list.length) {
      const n = ws.addRow(['— none —']);
      n.getCell(1).font = { italic: true, color: { argb: 'FF6B7280' } };
      return;
    }
    list.forEach(u => {
      const r = ws.addRow([pendingBlock(u, sh.key)]);
      r.height = 64;
      const c = r.getCell(1);
      c.alignment = { wrapText: true, vertical: 'top', horizontal: 'left' };
      c.border = { top: thin, bottom: thin, left: thin, right: thin };
    });
  });
  return wb;
}
function pendingCsv(d, dateLabel) {
  const q = v => '"' + String(v).replace(/"/g, '""') + '"';
  const rows = [q('Pending Users — ' + dateLabel + ' (Total: ' + (d.total || 0) + ')')];
  PENDING_SHIFTS.forEach(sh => {
    const list = (d.shifts && d.shifts[sh.key]) || [];
    rows.push(q(''));
    rows.push(q(sh.label + ' — ' + list.length));
    list.forEach(u => rows.push(q(pendingBlock(u, sh.key))));
  });
  return '\ufeff' + rows.join('\r\n');
}
function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
async function exportPendingExcel() {
  if (!S.user || !S.user.canExportPending) return;
  const btn = D.pendingExportBtn;
  if (btn && btn.disabled) return;
  const dateStr = fmtDate(D.datePicker.value);                // dd-MM-yyyy
  const oldHtml = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Preparing…</span>'; }
  try {
    const d = await api({ action: 'pendingExport', date: dateStr }, null);
    if (!d || !d.success) throw new Error((d && d.error) || 'Export failed');
    const fileBase = 'Pending_' + dateStr;
    if (await ensureExcelJS()) {
      const wb  = buildPendingWorkbook(ExcelJS, d, dateStr);
      const buf = await wb.xlsx.writeBuffer();
      downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileBase + '.xlsx');
      pendingToast('Pending exported (' + d.total + ')', 'fa-file-excel');
    } else {
      downloadBlob(new Blob([pendingCsv(d, dateStr)], { type: 'text/csv;charset=utf-8' }), fileBase + '.csv');
      pendingToast('Excel library blocked — downloaded CSV instead', 'fa-triangle-exclamation');
    }
  } catch (e) {
    if (!e.isAuth) {
      console.error('Pending export error:', e);
      pendingToast(e.name === 'AbortError' ? 'Request timed out. Try again.' : (e.message || 'Export failed'), 'fa-triangle-exclamation');
    }
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = oldHtml; }
  }
}
