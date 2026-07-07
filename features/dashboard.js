/* Dashboard feature — revenue stats, trends, customer breakdowns. */
import { escapeHtml } from '/core/dom.js';
import { getOrders, parseOrderMonth, parseItemsFull } from '/core/api.js';
import { ordersState } from '/core/state.js';

export async function loadDashboard() {
  if (ordersState.loaded) {
    renderDashboard(ordersState.cache);
    return;
  }
  document.getElementById('dashLoading').style.display = 'block';
  document.getElementById('dashContent').style.display = 'none';
  try {
    renderDashboard(await getOrders());
  } catch (e) {
    if (e.message === 'Unauthorized') return;
    document.getElementById('dashLoading').textContent = 'Could not load dashboard. Check your connection.';
  }
}

const _MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export function renderDashboard(orders) {
  const total = orders.length;
  const paid = orders.filter(o => String(o.paymentStatus || '').toLowerCase() === 'paid');
  const revenue = paid.reduce((s, o) => s + (Number(o.totalAmount) || 0), 0);
  const unpaid = orders.filter(o => {
    const s = String(o.paymentStatus || '').toLowerCase();
    return s !== 'paid' && s !== 'refunded' && s !== 'cancelled';
  }).length;

  document.getElementById('dashTotalOrders').textContent = total;
  document.getElementById('dashRevenue').textContent = '₹' + revenue.toLocaleString('en-IN');
  document.getElementById('dashPending').textContent = unpaid;

  const payGroups = {};
  orders.forEach(o => { const s = o.paymentStatus || '—'; payGroups[s] = (payGroups[s] || 0) + 1; });
  document.getElementById('dashPayBreakdown').innerHTML = Object.entries(payGroups)
    .sort((a, b) => b[1] - a[1])
    .map(([s, c]) => `<div class="dash-brow"><span>${escapeHtml(s)}</span><span class="cnt">${c}</span></div>`)
    .join('');

  const fulGroups = {};
  orders.forEach(o => { const s = o.fulfillmentStatus && String(o.fulfillmentStatus).trim() ? String(o.fulfillmentStatus) : 'Not set'; fulGroups[s] = (fulGroups[s] || 0) + 1; });
  document.getElementById('dashFulBreakdown').innerHTML = Object.entries(fulGroups)
    .sort((a, b) => b[1] - a[1])
    .map(([s, c]) => `<div class="dash-brow"><span>${escapeHtml(s)}</span><span class="cnt">${c}</span></div>`)
    .join('');

  document.getElementById('dashRecent').innerHTML = orders.slice(0, 5).map(o => `
    <div class="dash-recent">
      <div class="dash-recent-left">
        <div class="dash-recent-name">${escapeHtml(o.name)}</div>
        <div class="dash-recent-meta">${escapeHtml(String(o.billNo))} &middot; <span class="status-badge ${_statusClass(o.paymentStatus)}" style="font-size:10px;padding:2px 7px;">${escapeHtml(o.paymentStatus || '—')}</span></div>
      </div>
      <div class="dash-recent-amt">₹${Number(o.totalAmount || 0).toLocaleString('en-IN')}</div>
    </div>`).join('') || '<div style="color:var(--muted);font-size:13px;font-weight:600;">No orders yet.</div>';

  const avgOrder = paid.length ? Math.round(revenue / paid.length) : 0;
  document.getElementById('dashAvgOrder').textContent = '₹' + avgOrder.toLocaleString('en-IN');

  const custMap = {};
  orders.forEach(o => {
    const n = String(o.name || '').trim(); if (!n) return;
    if (!custMap[n]) custMap[n] = { name: n, spend: 0, count: 0 };
    custMap[n].count++;
    if (String(o.paymentStatus || '').toLowerCase() === 'paid') custMap[n].spend += Number(o.totalAmount || 0);
  });
  const allCusts = Object.values(custMap);
  const uniqueCount = allCusts.length;
  const repeatCount = allCusts.filter(c => c.count > 1).length;
  document.getElementById('dashUniqueCustomers').textContent = uniqueCount;
  document.getElementById('dashRepeatRate').textContent = uniqueCount ? Math.round(repeatCount / uniqueCount * 100) + '%' : '—';

  const now = new Date();
  const trendKeys = [];
  const trendData = {};
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.getFullYear() + '-' + d.getMonth();
    const label = _MON[d.getMonth()] + " '" + String(d.getFullYear()).slice(2);
    trendKeys.push(key);
    trendData[key] = { label, revenue: 0, count: 0 };
  }
  orders.forEach(o => {
    const dm = parseOrderMonth(o.date); if (!dm) return;
    const key = dm.year + '-' + dm.month;
    if (!trendData[key]) return;
    trendData[key].count++;
    if (String(o.paymentStatus || '').toLowerCase() === 'paid') trendData[key].revenue += Number(o.totalAmount || 0);
  });
  const maxRev = Math.max(...trendKeys.map(k => trendData[k].revenue), 1);
  document.getElementById('dashTrend').innerHTML = trendKeys.map(k => {
    const t = trendData[k];
    const pct = Math.round(t.revenue / maxRev * 100);
    return `<div class="dash-trend-row">
      <span class="dash-trend-label">${t.label}</span>
      <div class="dash-trend-bar-wrap"><div class="dash-trend-bar" style="width:${pct}%"></div></div>
      <span class="dash-trend-val">₹${t.revenue.toLocaleString('en-IN')}</span>
    </div>`;
  }).join('');

  const topCusts = allCusts.sort((a, b) => b.spend - a.spend).slice(0, 8);
  const noData = '<div class="dash-brow"><span style="color:var(--muted);font-size:13px;">No data yet</span></div>';
  document.getElementById('dashTopCustomers').innerHTML = topCusts.length
    ? topCusts.map(c => `<div class="dash-brow">
        <div><div>${escapeHtml(c.name)}</div><div class="dash-brow-sub">${c.count} order${c.count > 1 ? 's' : ''}</div></div>
        <span class="cnt">₹${c.spend.toLocaleString('en-IN')}</span>
      </div>`).join('')
    : noData;

  const itemMap = {}, catMap = {};
  orders.forEach(o => {
    parseItemsFull(o.itemsSummary).forEach(({ category, name, qty, lineTotal }) => {
      if (!itemMap[name]) itemMap[name] = { name, qty: 0, revenue: 0 };
      itemMap[name].qty += qty; itemMap[name].revenue += lineTotal;
      if (!catMap[category]) catMap[category] = { category, revenue: 0, qty: 0 };
      catMap[category].revenue += lineTotal; catMap[category].qty += qty;
    });
  });
  const topItems = Object.values(itemMap).sort((a, b) => b.qty - a.qty).slice(0, 8);
  document.getElementById('dashTopItems').innerHTML = topItems.length
    ? topItems.map(it => `<div class="dash-brow">
        <div><div>${escapeHtml(it.name)}</div><div class="dash-brow-sub">${it.qty} units ordered</div></div>
        <span class="cnt">₹${it.revenue.toLocaleString('en-IN')}</span>
      </div>`).join('')
    : noData;

  const totalCatRev = Object.values(catMap).reduce((s, c) => s + c.revenue, 0) || 1;
  document.getElementById('dashCategories').innerHTML = Object.values(catMap).sort((a, b) => b.revenue - a.revenue).length
    ? Object.values(catMap).sort((a, b) => b.revenue - a.revenue).map(c =>
        `<div class="dash-brow"><span>${escapeHtml(c.category)}</span>
         <span class="cnt">${Math.round(c.revenue / totalCatRev * 100)}% &middot; ₹${c.revenue.toLocaleString('en-IN')}</span></div>`
      ).join('')
    : noData;

  const delivMap = {};
  orders.forEach(o => { const t = String(o.deliveryType || '').trim() || 'Unknown'; delivMap[t] = (delivMap[t] || 0) + 1; });
  document.getElementById('dashDelivery').innerHTML = Object.entries(delivMap).sort((a, b) => b[1] - a[1])
    .map(([t, c]) => `<div class="dash-brow"><span>${escapeHtml(t)}</span><span class="cnt">${c}</span></div>`).join('')
    || noData;

  document.getElementById('dashLoading').style.display = 'none';
  document.getElementById('dashContent').style.display = 'block';
}

function _statusClass(s) {
  if (!s) return '';
  const l = s.toLowerCase();
  if (l === 'paid') return 'paid';
  if (l === 'pending') return 'pending';
  return '';
}
