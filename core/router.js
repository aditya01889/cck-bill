/* Tab router — maps URL paths to tabs, manages browser history. */
import { currentUser } from '/core/auth.js';

export const ROUTE_TO_TAB = {
  dashboard: 'dashboard',
  ebill: 'newbill',
  orders: 'orders',
  customers: 'customers',
  reports: 'reports',
  ingredients: 'ingredients',
  settings: 'settings'
};
export const TAB_TO_ROUTE = {
  dashboard: 'dashboard',
  newbill: 'ebill',
  orders: 'orders',
  customers: 'customers',
  reports: 'reports',
  ingredients: 'ingredients',
  settings: 'settings'
};

// Tab handlers registered by features (or main.js) via registerTabHandler().
const _tabHandlers = {};

export function registerTabHandler(tab, fn) {
  _tabHandlers[tab] = fn;
}

export function routeToTab(pathname) {
  const seg = pathname.replace(/^\//, '').replace(/\/$/, '');
  return ROUTE_TO_TAB[seg] || null;
}

export function showTab(tab) {
  document.querySelectorAll('.tab-bar .tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  const btn = document.querySelector(`.tab-bar .tab[data-tab="${tab}"]`);
  if (btn) btn.classList.add('active');
  const panel = document.getElementById('tab-' + tab);
  if (panel) panel.classList.add('active');
  if (_tabHandlers[tab]) _tabHandlers[tab]();
}

export function navigateTo(tab, replace) {
  const route = TAB_TO_ROUTE[tab] || tab;
  if (replace) history.replaceState({ tab }, '', '/' + route);
  else history.pushState({ tab }, '', '/' + route);
  showTab(tab);
}

window.addEventListener('popstate', e => {
  if (!currentUser) return;
  const tab = (e.state && e.state.tab) || routeToTab(location.pathname);
  if (tab) showTab(tab);
});
