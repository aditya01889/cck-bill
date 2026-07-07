# Groundwork plan — before feature work

The goal of this plan is to get the codebase into a shape where **each new
feature is an isolated addition, not something that grows a monolith**, and
where **backend changes are safe, testable, and repeatable**. We do this
groundwork *before* building features from the roadmap (product/price
management, order filters, customer directory, etc.).

Nothing here is a rewrite. It is incremental and guarded by the existing 26-test
suite at every step.

## Guiding principles

- Every new feature = **a new module** following a known template — not lines
  wedged into a shared file.
- **Load only what's needed**: a feature's code loads when its tab is first
  opened (lazy `import()`), so initial load stays small as features grow.
- **One place** for backend calls; **one place** for the sheet's column schema.
- Backend changes are **versioned, tested, and deployed the same way every
  time**.
- Admin/config features live behind a **Settings area**, not new top-level tabs.
- **No bundler** (Vite/webpack) and **no datastore migration** — native ES
  modules keep the zero-build Vercel deploy; Google Sheets stays the DB until
  volume actually demands otherwise.

---

## Phase 0 — Decisions to make now (no code)

Two process choices unlock the rest:

1. **Adopt `clasp`** (Apps Script CLI) so `AppsScript.gs` / `IngredientCalc.gs`
   deploy from the repo — versioned and repeatable — instead of manual
   copy‑paste into the editor. Recommended: **yes.**
2. **Create a staging environment** — a throwaway Google Sheet + a second Web App
   deployment (second webhook URL) — so features that *write* data are exercised
   without touching live orders. Recommended: **yes.**

Everything below is execution.

---

## Phase 1 — Frontend modularization (the enabling step)

Split the 2,000‑line `app.js` into ES modules by concern. Proposed layout:

```
/main.js                  entry point: wire router + checkLogin
/core/
  config.js               (exists) URLs, catalog, users, fetchWithTimeout
  api.js                  ALL backend calls; returns clean objects (see Phase 2)
  auth.js                 session/token, login, forceRelogin
  state.js                the caches (_ordersCache, _customersCache, …)
  dom.js                  toast, escapeHtml, small shared UI helpers
  router.js               tabs + history
/features/
  newbill.js
  orders.js
  dashboard.js
  ingredients.js
```

- `index.html` loads `<script type="module" src="/main.js">`.
- **Lazy-load** each feature module on first open of its tab via dynamic
  `import()`.
- **Test compatibility:** ES modules make internal functions private, so the few
  tests that reach in via `page.evaluate` (e.g. `logToSheet`, `fetchWithTimeout`,
  `parseOrderMonth`) need a deliberate, minimal `window.__test` surface exposed
  in dev, or to be re-driven through the UI. This is the known, one-time cost of
  the carve.

**Deliverable:** identical behavior, all 26 tests green, `app.js` replaced by
modules. Likely 1–2 PRs, each test-green before merge.

---

## Phase 2 — Data-layer hardening (fold the first item into Phase 1)

- **Read/write sheet columns by header name, not by position.** Today the
  backend maps `r[0]…r[19]` by index, so inserting or reordering a column in the
  Sheet silently breaks everything — and several roadmap features need new
  columns (discount, tax, balance-due). Introduce one **column map** keyed by
  header; the `api` module and `AppsScript.gs` both use it.
- **Document the sheet schema** (columns, types, meaning) in one place
  (`docs/SCHEMA.md`).
- **Decide dashboard scope.** Every dashboard stat is currently computed over
  only the **last 200 orders** (`getOrders` returns the 200 most recent). That's
  fine now, but any "all-time" report will be wrong. Plan: move aggregation
  server-side (Apps Script) when reporting is built; flagged here so we don't
  build reporting on the 200-row assumption.

---

## Phase 3 — Backend process & safety

- **`clasp`**: move the `.gs` files into a clasp project; split
  `AppsScript.gs` into `auth.gs`, `orders.gs`, `customers.gs`, `errorlog.gs`,
  etc. (Apps Script files share scope, so this is low-risk). Deploy via clasp.
- **Backend tests**: extract the pure functions (token verify, input validation,
  the column map) so they run in Node/CI. Today the backend has *zero* automated
  tests.
- **`LockService`** around every write action (status/fulfillment update,
  append, upcoming edit/inventory writes) — Sheets has no transactions, so
  concurrent writes can clobber.
- **Wire up staging** (from Phase 0): a config switch so the app can point at the
  staging webhook during feature development.

---

## Phase 4 — Product-surface guardrails

- Establish a **Settings area** for admin/config features (product & price
  management, user management) so they don't each become a top-level tab.
- Write a short **feature-module template** (`docs/FEATURE_TEMPLATE.md`): the
  standard shape (init / load / render / handlers / test) every new feature
  follows, so growth stays uniform.

---

## Sequencing & dependencies

| Order | Work | Why this order |
|------|------|----------------|
| 1 | Phase 0 decisions (clasp, staging) | Cheap; unlocks Phase 3 |
| 2 | Phase 1 carve + column-by-name (Phase 2 first item) | Enabling step; do together since both touch the new `api` layer |
| 3 | Phase 3 (clasp, backend tests, LockService, staging) | Before the first data-*writing* feature |
| 4 | Phase 4 (Settings pattern, template) | Before the first admin/config feature |
| 5 | **Feature work begins** | On clean foundations |

Feature-specific prerequisites:
- **Product & price management, user management** → need Phase 4 (Settings).
- **Edit bill, discount, tax, partial-payment balance, inventory** → need
  Phase 2 (column-by-name) + Phase 3 (LockService, staging).
- **Reporting / all-time views / CSV export** → need the Phase 2 dashboard-scope
  decision (server-side aggregation).
- **Order filters, customer directory** → mostly just Phase 1 (read-only).

## Definition of done for groundwork

- `app.js` replaced by modules; features lazy-load; all tests green.
- Backend reads/writes columns **by name**; schema documented.
- Backend deploys via **clasp**, has **unit tests**, uses **LockService** on
  writes.
- A **staging** Sheet + deployment exists.
- **Settings** pattern + feature template established.

## Explicit non-goals

- No bundler / build step.
- No migration off Google Sheets (revisit only if order volume demands it).
- No big-bang rewrite — every phase is its own test-green PR.
