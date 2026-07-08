/* Settings tab — environment info and backend endpoint overview.
   Admin-only: visible only to users whose access list includes 'settings'. */
import { IS_PROD, ENV_LABEL, SHEET_WEBHOOK_URL, INGREDIENTS_WEBHOOK_URL } from '/core/config.js';
import { escapeHtml } from '/core/dom.js';

function truncate(url, n) {
  return url.length > n ? url.slice(0, n) + '…' : url;
}

export function loadSettings() {
  const el = document.getElementById('tab-settings');
  if (!el) return;

  const envClass = IS_PROD ? 'env-prod' : 'env-dev';

  el.innerHTML = `
    <div class="wrap">
      <div class="settings-card">
        <div class="settings-card-title">Environment</div>
        <div class="settings-row">
          <span class="settings-label">Status</span>
          <span class="env-badge ${escapeHtml(envClass)}">${escapeHtml(ENV_LABEL)}</span>
        </div>
        <div class="settings-row">
          <span class="settings-label">Host</span>
          <code class="settings-code">${escapeHtml(location.hostname)}</code>
        </div>
      </div>

      <div class="settings-card">
        <div class="settings-card-title">Backend</div>
        <div class="settings-row">
          <span class="settings-label">Orders API</span>
          <code class="settings-code">${escapeHtml(truncate(SHEET_WEBHOOK_URL, 55))}</code>
        </div>
        <div class="settings-row">
          <span class="settings-label">Ingredients API</span>
          <code class="settings-code">${escapeHtml(truncate(INGREDIENTS_WEBHOOK_URL, 55))}</code>
        </div>
      </div>
    </div>
  `;
}
