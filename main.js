/* Entry point — wires the app: auth, router, error handling, checkLogin. */
import { SHEET_WEBHOOK_URL, USERS, fetchWithTimeout } from '/core/config.js';
import { showErrorToast } from '/core/dom.js';
import { _authToken, currentUser, setSession, clearSession, tokenValid, setReloginCallback, doLogin } from '/core/auth.js';
import { getOrders, prefetchOrders, prefetchCustomers, logToSheet, parseOrderMonth, invalidateOrders, initCatalog } from '/core/api.js';
import { ordersState } from '/core/state.js';
import { routeToTab, navigateTo, registerTabHandler } from '/core/router.js';
import { initNewBill, renderProducts, updateTotals, resetQuantities } from '/features/newbill.js';
import { loadDashboard, renderDashboard } from '/features/dashboard.js';
import { loadOrders, initOrders } from '/features/orders.js';
import { loadIngredientTab, loadIngMatrix, initIngredients } from '/features/ingredients.js';
import { loadSettings } from '/features/settings.js';
import { loadCustomers, initCustomers } from '/features/customers.js';
import { loadReports, initReports } from '/features/reports.js';

/* ---- Global error visibility ---- */

let _errorReportCount = 0;
function reportClientError(err, context) {
  console.error('[CCK] Unhandled error' + (context ? ' (' + context + ')' : '') + ':', err);
  if (err && err.name === 'AbortError') return;
  try { showErrorToast('Something went wrong. Please try again — details are in the console.'); } catch (_) {}
  try {
    if (SHEET_WEBHOOK_URL && _errorReportCount < 20) {
      _errorReportCount++;
      const params = new URLSearchParams({
        action: 'clientError',
        message: ((err && (err.message || err)) || '').toString().slice(0, 300),
        context: (context || '').slice(0, 120),
        url: location.pathname,
        ua: (navigator.userAgent || '').slice(0, 200),
        user: currentUser || '',
        auth: _authToken || ''
      });
      fetchWithTimeout(`${SHEET_WEBHOOK_URL}?${params.toString()}`).catch(() => {});
    }
  } catch (_) {}
}

window.addEventListener('error', e => reportClientError(e.error || e.message, 'window.onerror'));
window.addEventListener('unhandledrejection', e => reportClientError(e.reason, 'unhandledrejection'));

/* ---- Login / App screens ---- */

function showLogin() {
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('appContent').style.display = 'none';
  document.getElementById('headerUser').style.display = 'none';
}

function showApp(isRestore) {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appContent').style.display = 'block';
  document.getElementById('headerUser').style.display = 'flex';
  document.getElementById('userChip').textContent = currentUser;
  const userObj = USERS.find(u => u.name === currentUser);
  document.querySelectorAll('.tab-bar .tab').forEach(btn => {
    btn.style.display = (userObj && userObj.access.includes(btn.dataset.tab)) ? '' : 'none';
  });
  const landing = userObj ? userObj.landing : 'dashboard';
  if (isRestore) {
    const tab = routeToTab(location.pathname);
    navigateTo((tab && userObj && userObj.access.includes(tab)) ? tab : landing, true);
  } else {
    navigateTo(landing, true);
  }
  prefetchOrders(() => document.getElementById('tab-dashboard').classList.contains('active'))
    .then(orders => {
      if (orders && document.getElementById('tab-dashboard').classList.contains('active')) {
        renderDashboard(orders);
      }
    }).catch(() => {});
  prefetchCustomers();
  if (userObj && userObj.access.includes('ingredients')) loadIngMatrix();
}

// Tell auth.js how to trigger the login screen (avoids circular import).
setReloginCallback(showLogin);

/* ---- Register tab handlers ---- */
registerTabHandler('dashboard', loadDashboard);
registerTabHandler('orders', () => loadOrders());
registerTabHandler('customers', loadCustomers);
registerTabHandler('reports', loadReports);
registerTabHandler('ingredients', loadIngredientTab);
registerTabHandler('settings', loadSettings);

/* ---- Event wiring ---- */

document.getElementById('loginBtn').addEventListener('click', async () => {
  const result = await doLogin();
  if (result.ok) {
    await initCatalog();
    resetQuantities();
    renderProducts();
    updateTotals();
    showApp(false);
  }
});
document.getElementById('loginPass').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('loginBtn').click();
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  clearSession();
  resetQuantities();
  renderProducts();
  updateTotals();
  showLogin();
});

// Copy header logo into login card (avoids duplicating the base64 src).
document.getElementById('loginLogo').src = document.querySelector('.logo-img').src;

// Tab bar navigation
document.querySelectorAll('.tab-bar .tab').forEach(btn => {
  btn.addEventListener('click', () => navigateTo(btn.dataset.tab));
});

// Init feature-specific event handlers
initNewBill();
initOrders();
initCustomers();
initReports();
initIngredients();

/* ---- Session restore on page load ---- */
(async function checkLogin() {
  const savedUser = sessionStorage.getItem('cck_user');
  const savedToken = sessionStorage.getItem('cck_token');
  if (savedUser && savedToken && tokenValid(savedToken) && USERS.find(u => u.name === savedUser)) {
    setSession(savedUser, savedToken);
    await initCatalog();
    resetQuantities();
    renderProducts();
    updateTotals();
    showApp(true);
  } else {
    clearSession();
    showLogin();
  }
})();

/* ---- Test surface (localhost only) ----
   Exposes internal functions on window so Playwright tests can call them
   via page.evaluate() without needing any test-only hooks in prod. */
if (location.hostname === 'localhost') {
  window.parseOrderMonth = parseOrderMonth;
  window.fetchWithTimeout = fetchWithTimeout;
  window.logToSheet = logToSheet;
}
