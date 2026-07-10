/* Customer Directory — searchable list + per-customer detail sheet. */
import { escapeHtml, openOverlay, closeOverlay } from '/core/dom.js';
import { prefetchCustomers } from '/core/api.js';
import { customersState, ordersState } from '/core/state.js';

/* ---- Helpers ---- */

function fmtRupees(n) {
  return '₹' + Number(n || 0).toLocaleString('en-IN');
}

function fmtDate(val) {
  if (!val) return '—';
  const s = String(val).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  return s;
}

function statusClass(s) {
  if (!s) return '';
  const l = s.toLowerCase();
  if (l === 'paid') return 'paid';
  if (l === 'pending') return 'pending';
  return '';
}

/* ---- List rendering ---- */

function renderList(customers) {
  const el = document.getElementById('customersList');
  if (!customers.length) {
    el.innerHTML = '<div class="orders-empty">No customers found.</div>';
    return;
  }
  el.innerHTML = customers.map(c => {
    const orders = Number(c.totalOrders) || 0;
    const lastDate = c.lastOrderDate ? fmtDate(c.lastOrderDate) : null;
    return `<div class="cust-card" data-name="${escapeHtml(String(c.name))}">
      <div class="cust-card-top">
        <div class="cust-card-info">
          <div class="cust-card-name">${escapeHtml(String(c.name))}</div>
          ${c.phone ? `<div class="cust-card-meta">${escapeHtml(String(c.phone))}</div>` : ''}
        </div>
        <div class="cust-card-right">
          <div class="cust-orders-count">${orders}</div>
          <div class="cust-orders-label">orders</div>
        </div>
      </div>
      ${lastDate ? `<div class="cust-card-meta" style="margin-top:6px;">Last order: ${lastDate}</div>` : ''}
    </div>`;
  }).join('');

  el.querySelectorAll('.cust-card').forEach(card => {
    card.addEventListener('click', () => openDetail(card.dataset.name));
  });
}

/* ---- Detail sheet ---- */

function openDetail(name) {
  const c = customersState.cache.find(
    x => String(x.name || '').toLowerCase() === String(name).toLowerCase()
  );
  if (!c) return;

  const orders = ordersState.cache
    .filter(o => String(o.name || '').toLowerCase() === String(name).toLowerCase());

  const totalSpent = orders.reduce((s, o) => s + (Number(o.totalAmount) || 0), 0);

  let html = `<div class="cust-detail-name">${escapeHtml(String(c.name))}</div>
    <div class="detail-row"><span class="detail-label">Phone</span><span class="detail-value">${c.phone ? escapeHtml(String(c.phone)) : '—'}</span></div>`;

  if (c.email) {
    html += `<div class="detail-row"><span class="detail-label">Email</span><span class="detail-value">${escapeHtml(String(c.email))}</span></div>`;
  }
  if (c.address) {
    html += `<div class="detail-row"><span class="detail-label">Address</span><span class="detail-value">${escapeHtml(String(c.address))}</span></div>`;
  }
  if (c.notes) {
    html += `<div class="detail-row"><span class="detail-label">Notes</span><span class="detail-value">${escapeHtml(String(c.notes))}</span></div>`;
  }

  html += `<div class="detail-divider"></div>
    <div class="cust-stats-row">
      <div class="cust-stat">
        <div class="cust-stat-val">${Number(c.totalOrders) || 0}</div>
        <div class="cust-stat-lbl">Total Orders</div>
      </div>
      <div class="cust-stat">
        <div class="cust-stat-val">${fmtRupees(totalSpent)}</div>
        <div class="cust-stat-lbl">Total Spent</div>
      </div>
    </div>`;

  if (c.lastOrderDate) {
    html += `<div class="detail-row" style="margin-top:4px;"><span class="detail-label">Last Order</span><span class="detail-value">${fmtDate(c.lastOrderDate)}</span></div>`;
  }

  if (orders.length) {
    html += `<div class="detail-divider"></div>
      <div class="section-label" style="margin-top:0;margin-bottom:10px;">Order History</div>`;
    html += orders.map(o => `
      <div class="cust-history-row">
        <div>
          <div class="cust-history-bill">#${escapeHtml(String(o.billNo))} &middot; ${escapeHtml(String(o.date))}</div>
          <span class="status-badge ${statusClass(o.paymentStatus)}" style="margin-top:4px;display:inline-block;">${escapeHtml(o.paymentStatus || 'Pending')}</span>
        </div>
        <div class="cust-history-amt">${fmtRupees(o.totalAmount)}</div>
      </div>`).join('');
  } else if (ordersState.loaded) {
    html += `<div class="detail-divider"></div>
      <div class="orders-empty" style="padding:16px 0;">No orders found in history.</div>`;
  }

  document.getElementById('customerDetailContent').innerHTML = html;
  openOverlay(document.getElementById('customerDetailOverlay'));
}

/* ---- Search / filter ---- */

function filterAndRender(query) {
  const q = String(query || '').toLowerCase().trim();
  const list = q
    ? customersState.cache.filter(c =>
        String(c.name || '').toLowerCase().includes(q) ||
        String(c.phone || '').toLowerCase().includes(q))
    : customersState.cache;
  renderList(list);
}

/* ---- Public API ---- */

export async function loadCustomers() {
  if (!customersState.loaded) {
    document.getElementById('customersList').innerHTML = '<div class="orders-loading">Loading customers…</div>';
    await prefetchCustomers();
  }
  const q = document.getElementById('customerSearch').value || '';
  filterAndRender(q);
}

export function initCustomers() {
  document.getElementById('customerSearch').addEventListener('input', e => {
    filterAndRender(e.target.value);
  });

  const overlay = document.getElementById('customerDetailOverlay');
  document.getElementById('closeCustomerDetailBtn').addEventListener('click', () => {
    closeOverlay(overlay);
  });
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeOverlay(overlay);
  });
}
