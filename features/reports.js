/* Sales Report — date-range filter, summary stats, CSV export. */
import { escapeHtml } from '/core/dom.js';
import { getOrders } from '/core/api.js';
import { ordersState } from '/core/state.js';

/* ---- Date helpers ---- */

const _MON = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};

function parseOrderDate(dateStr) {
  const s = String(dateStr || '').trim();
  const m = s.match(/(\d{1,2})\s+([A-Za-z]{3})[A-Za-z]*\s+(\d{4})/);
  if (m) {
    const abbr = m[2].charAt(0).toUpperCase() + m[2].slice(1,3).toLowerCase();
    if (abbr in _MON) return new Date(parseInt(m[3],10), _MON[abbr], parseInt(m[1],10));
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function toInputDate(date) {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2,'0');
  const d  = String(date.getDate()).padStart(2,'0');
  return `${y}-${mo}-${d}`;
}

function fromInputDate(str) {
  if (!str) return null;
  const [y,m,d] = str.split('-').map(Number);
  return new Date(y, m-1, d);
}

/* ---- Preset ranges ---- */

function getPresetRange(preset) {
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (preset === 'month') {
    return { from: new Date(today.getFullYear(), today.getMonth(), 1), to: today };
  }
  if (preset === 'lastmonth') {
    return {
      from: new Date(today.getFullYear(), today.getMonth()-1, 1),
      to:   new Date(today.getFullYear(), today.getMonth(), 0)
    };
  }
  if (preset === '3months') {
    return { from: new Date(today.getFullYear(), today.getMonth()-2, 1), to: today };
  }
  if (preset === 'all') {
    return { from: null, to: null };
  }
  return null;
}

/* ---- Filter + stats ---- */

function filterOrders(orders, from, to) {
  if (!from && !to) return orders;
  return orders.filter(o => {
    const d = parseOrderDate(o.date);
    if (!d) return false;
    if (from && d < from) return false;
    if (to) {
      const toEnd = new Date(to.getFullYear(), to.getMonth(), to.getDate()+1);
      if (d >= toEnd) return false;
    }
    return true;
  });
}

function computeStats(orders) {
  const count = orders.length;
  const total = orders.reduce((s,o) => s + (Number(o.totalAmount) || 0), 0);
  const paid  = orders
    .filter(o => String(o.paymentStatus || '').toLowerCase() === 'paid')
    .reduce((s,o) => s + (Number(o.totalAmount) || 0), 0);
  return { count, total, paid, avg: count ? Math.round(total / count) : 0 };
}

/* ---- Module state ---- */

let _orders        = [];
let _filtered      = [];
let _activePreset  = 'month';

/* ---- Render ---- */

function fmtRupees(n) {
  return '₹' + Number(n || 0).toLocaleString('en-IN');
}

function statusClass(s) {
  const l = String(s || '').toLowerCase();
  if (l === 'paid') return 'paid';
  if (l === 'pending') return 'pending';
  return '';
}

function render(from, to) {
  _filtered = filterOrders(_orders, from, to);
  const stats = computeStats(_filtered);

  document.getElementById('reportCount').textContent = stats.count;
  document.getElementById('reportTotal').textContent = fmtRupees(stats.total);
  document.getElementById('reportPaid').textContent  = fmtRupees(stats.paid);
  document.getElementById('reportAvg').textContent   = fmtRupees(stats.avg);

  const listEl = document.getElementById('reportOrdersList');
  if (!_filtered.length) {
    listEl.innerHTML = '<div class="orders-empty">No orders in this range.</div>';
    return;
  }
  listEl.innerHTML = _filtered.map(o => `
    <div class="report-row">
      <div class="report-row-left">
        <div class="report-row-name">${escapeHtml(String(o.name || '—'))}</div>
        <div class="report-row-meta">#${escapeHtml(String(o.billNo))} &middot; ${escapeHtml(String(o.date))}</div>
      </div>
      <div class="report-row-right">
        <div class="report-row-amt">${fmtRupees(o.totalAmount)}</div>
        <span class="status-badge ${statusClass(o.paymentStatus)}">${escapeHtml(o.paymentStatus || 'Pending')}</span>
      </div>
    </div>`).join('');
}

function applyPreset(preset) {
  _activePreset = preset;
  document.querySelectorAll('.report-chip').forEach(c => {
    c.classList.toggle('active', c.dataset.preset === preset);
  });
  const range = getPresetRange(preset);
  if (range) {
    document.getElementById('reportFrom').value = range.from ? toInputDate(range.from) : '';
    document.getElementById('reportTo').value   = range.to   ? toInputDate(range.to)   : '';
    render(range.from, range.to);
  }
}

/* ---- CSV export ---- */

function exportCSV() {
  const headers = [
    'Bill No','Date','Customer Name','Phone',
    'Total Amount','Payment Status','Fulfillment Status',
    'Delivery Type','Items Summary'
  ];
  const escape = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const rows = _filtered.map(o => [
    o.billNo, o.date, o.name, o.phone,
    o.totalAmount, o.paymentStatus, o.fulfillmentStatus || '',
    o.deliveryType || '', o.itemsSummary || ''
  ].map(escape).join(','));

  const csv  = [headers.map(escape).join(','), ...rows].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;

  const fromVal = document.getElementById('reportFrom').value;
  const toVal   = document.getElementById('reportTo').value;
  const suffix  = fromVal && toVal ? `_${fromVal}_to_${toVal}` : '_all';
  a.download = `cck_orders${suffix}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ---- Public API ---- */

export async function loadReports() {
  if (!ordersState.loaded) {
    document.getElementById('reportOrdersList').innerHTML =
      '<div class="orders-loading">Loading orders…</div>';
  }
  _orders = await getOrders();
  applyPreset(_activePreset);
}

export function initReports() {
  document.querySelectorAll('.report-chip').forEach(chip => {
    chip.addEventListener('click', () => applyPreset(chip.dataset.preset));
  });

  ['reportFrom', 'reportTo'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
      _activePreset = '';
      document.querySelectorAll('.report-chip').forEach(c => c.classList.remove('active'));
      render(fromInputDate(document.getElementById('reportFrom').value),
             fromInputDate(document.getElementById('reportTo').value));
    });
  });

  document.getElementById('reportExportBtn').addEventListener('click', exportCSV);
}
