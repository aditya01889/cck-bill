# Adding a New Feature Tab

Five steps to wire in a new tab (e.g. "Reports").

---

## 1. Create `features/reports.js`

```js
/* Reports tab — brief description of what it does. */
import { SHEET_WEBHOOK_URL, fetchWithTimeout } from '/core/config.js';
import { escapeHtml } from '/core/dom.js';
import { _authToken, authUrl } from '/core/auth.js';

/* Module-scoped state (if any) */
let _loaded = false;

/* Called by the router each time the tab is activated. */
export async function loadReports() {
  const el = document.getElementById('tab-reports');
  if (!el) return;
  if (_loaded) return;   // skip re-render if data is already shown
  el.innerHTML = '<div class="wrap"><p>Loading…</p></div>';
  // … fetch, render, etc.
}

/* Called once from main.js to wire persistent event handlers. */
export function initReports() {
  // document.getElementById('some-btn')?.addEventListener(…)
}
```

**Rules:**
- Use `escapeHtml` for every user-supplied string written to `innerHTML`.
- Keep all state in module-scoped `let` variables — no `window.*` side-effects.
- Export only `load*` and `init*` functions; everything else is private.

---

## 2. Add the tab to `index.html`

**Tab button** (inside `<nav class="tab-bar">`):

```html
<button class="tab" data-tab="reports" id="tabReports">Reports</button>
```

**Tab panel** (before `</div><!-- /#appContent -->`):

```html
<div id="tab-reports" class="tab-panel"></div>
```

---

## 3. Register in `main.js`

```js
import { loadReports, initReports } from '/features/reports.js';

// inside the "Register tab handlers" section:
registerTabHandler('reports', loadReports);

// inside the "Init feature-specific event handlers" section:
initReports();
```

---

## 4. Gate access in `core/config.js`

Add `'reports'` to each user's `access` array who should see the tab:

```js
{ name: "Aditya", landing: "dashboard",
  access: ["dashboard","newbill","orders","ingredients","settings","reports"] },
```

Users whose `access` list does not include `'reports'` will not see the button (hidden by `showApp()` in `main.js`).

---

## 5. Add CSS (if needed)

Append to `app.css` inside the existing rule block:

```css
  /* ---- Reports tab ---- */
  .reports-empty { text-align:center; padding:48px 0; color:var(--muted); font-size:14px; }
```

Follow the existing variable palette: `--ink`, `--muted`, `--rust`, `--rust-deep`, `--line`, `--paper`, `--cream`.

---

## Checklist

- [ ] `features/reports.js` created with `loadReports` + `initReports` exports
- [ ] Tab button added to `index.html` nav
- [ ] Tab panel `<div id="tab-reports">` added to `index.html`
- [ ] `registerTabHandler` + `initReports()` added to `main.js`
- [ ] `'reports'` added to relevant users in `USERS` array in `core/config.js`
- [ ] CSS added if custom styles are needed
- [ ] Playwright smoke test added in `tests/` (at minimum a tab-navigation check)
