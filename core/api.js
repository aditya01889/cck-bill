/* All backend calls + shared data-parsing utilities.
   This is the single seam between the app and Google Apps Script. */
import { SHEET_WEBHOOK_URL, fetchWithTimeout } from '/core/config.js';
import { _authToken, currentUser, tokenValid, authUrl, forceRelogin } from '/core/auth.js';
import { showErrorToast } from '/core/dom.js';
import { ordersState, customersState, invalidateOrders } from '/core/state.js';

export { invalidateOrders } from '/core/state.js';

const _sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* ---- Orders ---- */

export function getOrders() {
  if (ordersState.loaded) return Promise.resolve(ordersState.cache);
  if (!SHEET_WEBHOOK_URL) return Promise.resolve([]);
  if (ordersState.promise) return ordersState.promise;
  ordersState.promise = (async () => {
    try {
      ordersState.cache = await fetchOrdersWithRetry();
      ordersState.loaded = true;
      return ordersState.cache;
    } finally {
      ordersState.promise = null;
    }
  })();
  return ordersState.promise;
}

async function fetchOrdersWithRetry() {
  const backoffs = [1500, 4000];
  let lastErr;
  for (let attempt = 0; attempt <= backoffs.length; attempt++) {
    try {
      const res = await fetchWithTimeout(authUrl(`${SHEET_WEBHOOK_URL}?action=orders&limit=200`), {}, 30000);
      const data = await res.json();
      if (data.message === 'Unauthorized') {
        if (!tokenValid(_authToken)) { forceRelogin(); throw new Error('Unauthorized'); }
        lastErr = new Error('Unauthorized (transient)');
      } else if (data.status === 'success') {
        return data.orders || [];
      } else {
        lastErr = new Error(data.message || 'Failed to load orders');
      }
    } catch (e) {
      if (e.message === 'Unauthorized') throw e;
      lastErr = e;
    }
    if (attempt < backoffs.length) await _sleep(backoffs[attempt]);
  }
  throw lastErr || new Error('Failed to load orders');
}

export function prefetchOrders(onDashboardActive) {
  return getOrders().then(orders => {
    if (onDashboardActive && onDashboardActive()) return orders;
    return orders;
  }).catch(() => {});
}

export async function prefetchCustomers() {
  if (customersState.loaded || !SHEET_WEBHOOK_URL) return;
  try {
    const res = await fetchWithTimeout(authUrl(`${SHEET_WEBHOOK_URL}?action=customers`));
    const data = await res.json();
    if (data.status === 'success') {
      customersState.cache = data.customers || [];
      customersState.loaded = true;
    }
  } catch (e) { /* silent */ }
}

/* ---- Bill logging ---- */

export function updateOrderInSheet(data) {
  if (!SHEET_WEBHOOK_URL) return;
  const payload = {
    action: 'updateOrder',
    billNo: data.billNo,
    name: data.name,
    phone: data.phone,
    email: data.email,
    address: data.address,
    itemsSummary: data.items.map(i => `${i.category}: ${i.name} x${i.qty} (₹${i.lineTotal})`).join('; '),
    totalItems: data.totalItems,
    totalAmount: data.totalAmount,
    deliveryCharges: data.deliveryCharges || 0,
    discount: data.discount || 0,
    dispatchDate: data.dispatchDateDisplay || '',
    remarks: data.remarks || '',
    mapLink: data.mapLink || '',
    deliveryType: data.deliveryType || '',
    auth: _authToken
  };
  fetchWithTimeout(SHEET_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  }).then(res => res.json()).then(result => {
    if (result && result.status === 'success') return;
    if (result && result.message === 'Unauthorized') {
      if (!tokenValid(_authToken)) {
        forceRelogin();
        showErrorToast(`Order ${data.billNo} was NOT updated — session expired. Please sign in again.`, { persist: true });
      } else {
        showErrorToast(`Order ${data.billNo} may not have been updated (server busy). Please check the orders sheet.`, { persist: true });
      }
      return;
    }
    showErrorToast(`Order ${data.billNo} may not have been updated (${(result && result.message) || 'unknown error'}).`, { persist: true });
  }).catch(() => {
    showErrorToast(`Order ${data.billNo} was NOT updated (network error). Please check the orders sheet.`, { persist: true });
  });
}

export function logToSheet(data) {
  if (!SHEET_WEBHOOK_URL) return;
  const payload = {
    billNo: data.billNo,
    dateStr: data.dateStr,
    name: data.name,
    phone: data.phone,
    email: data.email,
    address: data.address,
    remarks: data.remarks,
    totalItems: data.totalItems,
    totalAmount: data.totalAmount,
    deliveryCharges: data.deliveryCharges || 0,
    discount: data.discount || 0,
    dispatchDate: data.dispatchDateDisplay || '',
    paymentStatus: 'Pending',
    itemsSummary: data.items.map(i => `${i.category}: ${i.name} x${i.qty} (₹${i.lineTotal})`).join('; '),
    generatedBy: data.generatedBy || '',
    mapLink: data.mapLink || '',
    deliveryType: data.deliveryType || '',
    shareToken: data.shareToken || '',
    auth: _authToken
  };
  fetchWithTimeout(SHEET_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  }).then(res => res.json()).then(result => {
    if (result && result.status === 'success') return;
    if (result && result.message === 'Unauthorized') {
      if (!tokenValid(_authToken)) {
        forceRelogin();
        showErrorToast(
          `Bill ${data.billNo} was NOT saved — your session expired. Please sign in again and regenerate this bill.`,
          { persist: true });
      } else {
        showErrorToast(
          `Bill ${data.billNo} may not have been saved (server was busy). Please check the orders sheet before dispatching.`,
          { persist: true });
      }
      return;
    }
    showErrorToast(
      `Bill ${data.billNo} may not have been saved (${(result && result.message) || 'unknown error'}). Please check the orders sheet before dispatching.`,
      { persist: true });
  }).catch(() => {
    showErrorToast(
      `Bill ${data.billNo} was NOT saved to the order log (network error). The bill is still on screen — check your connection and regenerate it.`,
      { persist: true });
  });
}

export function uploadPaymentProof(billNo, file) {
  const reader = new FileReader();
  reader.onload = () => {
    const base64 = reader.result.split(',')[1];
    fetchWithTimeout(SHEET_WEBHOOK_URL, {
      method: 'POST',
      mode: 'no-cors',
      body: JSON.stringify({
        action: 'uploadProof',
        billNo: billNo,
        imageBase64: base64,
        mimeType: file.type || 'image/jpeg',
        auth: _authToken
      })
    }).catch(() => {});
  };
  reader.readAsDataURL(file);
}

/* ---- Date / item parsing utilities (used by dashboard + ingredients) ---- */

const _MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export function parseOrderMonth(dateStr) {
  const s = String(dateStr || '').trim();
  if (!s) return null;
  const m = s.match(/(\d{1,2})\s+([A-Za-z]{3})[A-Za-z]*\s+(\d{4})/);
  if (m) {
    const abbr = m[2].charAt(0).toUpperCase() + m[2].slice(1, 3).toLowerCase();
    const mi = _MON.indexOf(abbr);
    if (mi !== -1) return { year: parseInt(m[3], 10), month: mi };
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return { year: d.getFullYear(), month: d.getMonth() };
  return null;
}

export function parseItemsFull(summary) {
  if (!summary) return [];
  return String(summary).split('; ').map(part => {
    const m = part.match(/^([^:]+):\s*(.+?)\s+x(\d+)\s+\(₹([\d,]+(?:\.\d+)?)\)/);
    if (!m) return null;
    return { category: m[1].trim(), name: m[2].trim(), qty: parseInt(m[3], 10), lineTotal: parseFloat(m[4].replace(/,/g, '')) };
  }).filter(Boolean);
}

export function parseItemsSummary(summary) {
  if (!summary) return [];
  return String(summary).split('; ').map(part => {
    const m = part.match(/^[^:]+:\s*(.+?)\s+x(\d+)\s+\(₹/);
    if (!m) return null;
    return { name: m[1].trim(), qty: parseInt(m[2], 10) };
  }).filter(Boolean);
}
