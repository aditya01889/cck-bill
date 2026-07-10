/* Shared DOM utility helpers — toast, status bar, HTML escaping. */

export function showErrorToast(message, opts) {
  opts = opts || {};
  let el = document.getElementById('globalErrorToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'globalErrorToast';
    el.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);' +
      'max-width:90%;background:#b3261e;color:#fff;padding:12px 16px;border-radius:10px;' +
      'font-size:14px;box-shadow:0 4px 14px rgba(0,0,0,.25);z-index:9999;display:flex;' +
      'gap:12px;align-items:center;';
    const span = document.createElement('span');
    span.id = 'globalErrorToastMsg';
    const close = document.createElement('button');
    close.textContent = '✕';
    close.setAttribute('aria-label', 'Dismiss');
    close.style.cssText = 'background:none;border:none;color:#fff;font-size:15px;cursor:pointer;line-height:1;';
    close.onclick = () => el.remove();
    el.appendChild(span);
    el.appendChild(close);
    document.body.appendChild(el);
  }
  document.getElementById('globalErrorToastMsg').textContent = message;
  clearTimeout(el._hideTimer);
  if (!opts.persist) {
    el._hideTimer = setTimeout(() => { if (el && el.parentNode) el.remove(); }, 8000);
  }
}

export function setStatus(msg, type) {
  const el = document.getElementById('statusMsg');
  if (!el) return;
  el.textContent = msg;
  el.className = 'status-msg' + (type ? ' ' + type : '');
}

export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

/* ---- Overlay / modal history helpers ---- */
// Push a history entry when opening so the back button closes the overlay
// instead of navigating away from the page.

export function openOverlay(el) {
  el.classList.add('show');
  history.pushState({ modal: el.id }, '');
}

export function closeOverlay(el) {
  if (!el.classList.contains('show')) return;
  el.classList.remove('show');
  // If this overlay pushed the current history entry, go back so the
  // browser's history stack stays in sync.
  if (history.state && history.state.modal) history.back();
}
