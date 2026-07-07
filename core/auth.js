/* Auth state, session helpers, login/logout logic. */
import { SHEET_WEBHOOK_URL, fetchWithTimeout } from '/core/config.js';
import { showErrorToast } from '/core/dom.js';

export let _authToken = null;
export let currentUser = null;
export let currentRole = null;

// Callback registered by main.js so forceRelogin can show the login screen
// without auth.js importing main.js (which would be circular).
let _reloginCallback = null;
export function setReloginCallback(fn) { _reloginCallback = fn; }

function b64urlToJson(s) {
  s = String(s).replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return JSON.parse(atob(s));
}

export function tokenPayload(token) {
  try { return token ? b64urlToJson(String(token).split('.')[0]) : null; }
  catch (e) { return null; }
}

export function tokenValid(token) {
  const p = tokenPayload(token);
  return !!(p && p.exp && Date.now() < p.exp);
}

export function authUrl(url) {
  return url + (url.indexOf('?') > -1 ? '&' : '?') + 'auth=' + encodeURIComponent(_authToken || '');
}

export function setSession(user, token) {
  currentUser = user;
  _authToken = token;
  const p = tokenPayload(token);
  currentRole = p ? p.r : null;
  sessionStorage.setItem('cck_user', user);
  sessionStorage.setItem('cck_token', token);
}

export function clearSession() {
  currentUser = null;
  _authToken = null;
  currentRole = null;
  sessionStorage.removeItem('cck_user');
  sessionStorage.removeItem('cck_token');
}

export function forceRelogin() {
  clearSession();
  showErrorToast('Your session expired. Please sign in again.');
  if (_reloginCallback) _reloginCallback();
}

export async function doLogin() {
  const uname = document.getElementById('loginUser').value.trim();
  const upass = document.getElementById('loginPass').value;
  const errEl = document.getElementById('loginError');
  if (!uname || !upass) {
    errEl.textContent = 'Enter your username and password.';
    return { ok: false };
  }
  const btn = document.getElementById('loginBtn');
  const origLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Signing in…';
  try {
    const res = await fetchWithTimeout(SHEET_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'login', user: uname, pass: upass })
    });
    const data = await res.json();
    if (data.status === 'success' && data.token) {
      setSession(data.user, data.token);
      errEl.textContent = '';
      document.getElementById('loginPass').value = '';
      return { ok: true };
    } else {
      errEl.textContent = data.message || 'Incorrect username or password.';
      document.getElementById('loginPass').value = '';
      document.getElementById('loginPass').focus();
      return { ok: false };
    }
  } catch (e) {
    errEl.textContent = 'Could not reach the server. Check your connection and try again.';
    return { ok: false };
  } finally {
    btn.disabled = false;
    btn.textContent = origLabel;
  }
}
