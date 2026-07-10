# CozyCatKitchen Billing App — Claude Context

This file gives any Claude session enough context to contribute without asking
basic questions. Read it before touching any file in this repo.

---

## What this is

An internal billing + order-management web app for CozyCatKitchen (CCK), a cat
food business. Staff log in, build bills for customers, generate a shareable
bill image, and track orders through fulfillment. Customers get a read-only
tracking link.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JS ES modules, HTML, CSS — no build step |
| Backend | Google Apps Script (GAS), V8 runtime |
| Data store | Google Sheets (separate prod + staging sheets) |
| Hosting | Vercel (static files only — no server) |
| Auth | Username/password → JWT-style token; SHA-256+salt hashes in Users sheet |
| CI | Playwright E2E smoke tests on GitHub Actions |

---

## Environments

| Environment | Frontend URL | Backend |
|---|---|---|
| Production | `cck-bill.vercel.app` | Prod Apps Script deployment |
| Staging/Dev | `cck-bill-dev.vercel.app` | Staging Apps Script deployment |

- `SHEET_WEBHOOK_URL` in `core/config.js` forks on `IS_PROD` (`location.hostname === 'cck-bill.vercel.app'`).
- Vercel auto-deploys production from `main`, staging from `dev`.

---

## Branch workflow

```
feature work → dev → release PR → main (production)
```

1. **All feature commits go to `dev`** — never directly to `main`.
2. Test on `cck-bill-dev.vercel.app` (staging).
3. When a batch is verified, open a release PR: `dev` → `main`.
4. After merging to `main`, sync dev: `git fetch origin main && git merge origin/main --no-edit && git push origin dev`.

Claude-created feature branches (`claude/<name>`) are merged into `dev`, not `main`.
The PR base must always be `dev`.

---

## File structure

```
/
├── index.html              # Single-page app shell + all tab HTML
├── app.css                 # All styles
├── main.js                 # Tab routing, auth guard, init
├── track.html              # Public customer order-tracking page
├── core/
│   ├── api.js              # All backend calls (logToSheet, getOrders, etc.)
│   ├── auth.js             # Login, token storage, session management
│   ├── config.js           # PRODUCTS catalog, SHEET_WEBHOOK_URL, UPI config
│   ├── dom.js              # escapeHtml, setStatus, showErrorToast helpers
│   └── state.js            # Shared mutable state (ordersState, customersState)
├── features/
│   ├── newbill.js          # New-bill form, bill card generation, QR, sharing
│   ├── orders.js           # Orders tab: list, filters, detail, fulfillment, reshare
│   ├── customers.js        # Customer directory: searchable list, per-customer detail + order history
│   ├── dashboard.js        # Dashboard: revenue charts, top customers, trends
│   ├── ingredients.js      # Ingredient calculator (buying list + making ratios)
│   └── settings.js         # Settings tab
├── scripts/
│   └── clasp-deploy.js     # Node script: clasp push + deploy for any backend/env combo
├── deploy.config.json      # Single source of truth for all backend deployment IDs + clasp configs
├── .github/
│   └── workflows/
│       ├── deploy-staging.yml     # Auto-deploys backends to staging on CI success on dev
│       └── deploy-production.yml  # Auto-deploys backends to production on CI success on main
├── backend/
│   └── orders/             # Google Apps Script project (Orders + Customers + Auth)
│       ├── main.js         # doGet / doPost entry points
│       ├── schema.js       # ORDER_COLS, ORDER_HEADERS, buildColMap_, rowToOrder_, buildRow_
│       ├── orders.js       # getOrders, updateStatus, uploadPaymentProof, getOrderByBill, updateFulfillment
│       ├── customers.js    # getCustomers, upsertCustomer, migrateCustomersFromOrders
│       ├── auth.js         # login_, verifyToken_, setupUser, setupServerSecret
│       ├── setup.js        # One-time sheet setup helpers (run from Apps Script editor)
│       ├── .clasp.json     # Production Apps Script project ID
│       └── .clasp.staging.json  # Staging Apps Script project ID
├── docs/                   # Architecture docs (SCHEMA.md, BRANCHING.md, etc.)
├── tests/                  # Playwright E2E tests
└── package.json
```

---

## Key backend patterns

### Column maps — never use column positions
`buildColMap_(sheet, colDef, optColDef)` in `schema.js` reads the live header
row by name and returns `{ fieldKey: 0-based-index }`. Required columns
(in `ORDER_COLS`) throw if missing. Optional columns (in `ORDER_OPTIONAL_COLS`)
return `null` instead of throwing — always guard with `cm.discount != null`.

```js
var cm = buildColMap_(sheet, ORDER_COLS, ORDER_OPTIONAL_COLS);
var discount = cm.discount != null ? (Number(r[cm.discount]) || 0) : 0;
```

### Adding a new required column
1. Add to `ORDER_COLS` in `schema.js`
2. Add to `ORDER_HEADERS` in `schema.js`
3. Update `buildRow_()` call in `main.js` `doPost`
4. Update `rowToOrder_()` in `schema.js`

### Adding a new optional column
1. Add to `ORDER_OPTIONAL_COLS` in `schema.js`
2. Add to the end of `ORDER_HEADERS` in `schema.js`
3. Write value in `buildRow_()` call in `main.js`
4. Read in `rowToOrder_()` with null-guard
5. Add a one-time `setup<ColumnName>()` helper in `setup.js`
6. Run the helper once on each sheet (staging + prod) from the Apps Script editor

### Concurrency
`LockService.getScriptLock()` is used **at the outermost level only** in
`doPost` (covers both the Orders appendRow and the Customers upsert). Never
acquire a nested lock — GAS locks are not reentrant.

### GAS deployment gotcha
`clasp push` only updates code in the script editor. The live web app URL
still runs the old deployment until you manually redeploy:
**Apps Script editor → Deploy → Manage deployments → Edit → New version → Deploy.**

---

## Key frontend patterns

### Shared state
`core/state.js` exports `ordersState` and `customersState` — plain mutable
objects with `{ cache, loaded, promise }`. Always use `invalidateOrders()` after
creating a new order so the next `getOrders()` re-fetches.

### Filter chips (Orders tab)
Module-scoped `_filterPayment` and `_filterFulfillment` in `orders.js`. Chip
clicks call `renderOrders(applyFilters(ordersState.cache, ...))` directly —
no re-fetch needed.

### Bill generation flow
1. User fills form → `generateBtn` click handler in `features/newbill.js`
2. Validates inputs (name required, phone 10 digits, email format)
3. Computes `discountAmount = Math.round(productsTotal * discountPercent / 100)`
4. `grandTotal = productsTotal + deliveryCharges - discountAmount`
5. Renders bill card HTML, shows overlay
6. Fires `logToSheet(...)` (fire-and-forget, shows error toast on failure)
7. Calls `invalidateOrders()` to bust cache

### Inline field validation
Blur listeners for name/phone/email show `.field-error` divs and add `.invalid`
class to the input. Cleared on `input` event and on "New Order" reset.

---

## Data flow: new bill → sheet

```
Frontend (newbill.js)
  → logToSheet(data) [core/api.js]
    → POST to SHEET_WEBHOOK_URL with JSON payload
      → doPost [backend/orders/main.js]
        → buildRow_(valuesByHeader) [schema.js]
        → sheet.appendRow(row)
        → upsertCustomer(...) [customers.js]
```

---

## Products catalog

Defined in `core/config.js` as the `CATALOG` array of category objects.
Each category has an `items` array. Combo categories have `comboCategory: true`
— items with `price` (single price) expand directly; items with
`price24`/`price60` expand into two SKUs (Pack of 24, Pack of 60).
`PRODUCTS` is the flat array derived from `CATALOG` (export both).

**To add a product**: edit `CATALOG` in `core/config.js`. No backend change needed.

Product weights (for courier pickup request) are in `PRODUCT_WEIGHTS` in `core/config.js`.

---

## Orders sheet columns

| Key | Header | Notes |
|---|---|---|
| billNo | Bill No | CCK-format ID |
| date | Date | Display string |
| name | Customer Name | |
| phone | Phone | |
| email | Email | |
| address | Address | |
| itemsSummary | Items Summary | `Category: Name xQty (₹amt); ...` |
| totalItems | Total Items | |
| deliveryCharges | Delivery Charges | ₹ |
| totalAmount | Total Amount | ₹ including delivery, minus discount |
| paymentStatus | Payment Status | Pending/Paid/Refunded/Failed/Cancelled |
| dispatchDate | Dispatch Date | Display string or range |
| remarks | Remarks | |
| generatedBy | Generated By | Username |
| paymentProof | Payment Proof | Drive URL |
| fulfillmentStatus | Fulfillment Status | Packed/Booked/Picked Up/Delivered |
| trackingLink | Tracking Link | |
| mapLink | Map Link | |
| deliveryType | Delivery Type | Local/National |
| shareToken | Share Token | UUID for tracking link |
| discount | Discount | ₹ amount — **optional column**, add via `setupDiscountColumn()` |

---

## npm scripts

```
# Backend deploy (push + redeploy — use these, not raw clasp commands)
npm run deploy:all:prod                # push + redeploy all backends to production
npm run deploy:all:staging             # push + redeploy all backends to staging
npm run deploy:orders:prod             # push + redeploy orders backend to production
npm run deploy:orders:staging          # push + redeploy orders backend to staging
npm run deploy:ingredients:prod        # push + redeploy ingredients backend to production

# Raw clasp (push code only — does NOT update the live deployment)
npm run clasp:push:orders              # push orders backend to production Apps Script
npm run clasp:push:orders:staging      # push orders backend to staging Apps Script

# Tests
npm run test:backend                   # run unit tests (Node --test)
npx playwright test                    # run E2E smoke tests
```

GitHub Actions auto-runs `deploy:all:staging` after CI passes on `dev` and
`deploy:all:prod` after CI passes on `main`. Manual deploys are only needed
locally or when the workflow didn't run.

---

## Completed features (released to `main` unless noted)

- **Auth**: per-user login, SHA-256+salt, JWT-style tokens
- **New bill**: product catalog, quantities, delivery charges, discount (%), QR payment code, bill image generation, sharing
- **Bill card inline discount**: shows "Discount (X%) −₹YYY" row when discount > 0; stored as ₹ amount in Orders sheet `Discount` optional column
- **Inline form validation**: name required, phone 10 digits, email format — on blur, not on submit
- **Dispatch date defaults**: From defaults to today; To cannot be before From
- **Orders tab**: list, search, payment status update, fulfillment update (with courier pickup request generator), payment proof upload, order detail view, reshare bill
- **Filter chips**: payment status + fulfillment status filter the orders list client-side
- **Dispatch Queue**: shows orders with dispatch date within −3/+7 days from today (excl. Delivered)
- **Dashboard**: revenue trend, payment breakdown, fulfillment breakdown, top customers, popular items, by-category, delivery type
- **Customer tracking page** (`/track`): public page scoped by share token
- **Starter Kit (Assorted Pack of 12)** at ₹1670 — first item in Cozy Meals Combos
- **Staging backend**: separate sheet + Apps Script deployment, `IS_PROD` URL fork
- **Automated backend deploys** via GitHub Actions: CI success on `dev` → staging deploy; CI success on `main` → production deploy. Configured in `deploy.config.json`, driven by `scripts/clasp-deploy.js`
- **Customer directory** *(on `dev`, pending release)*: Customers tab with searchable list (name/phone); tap a card to open detail sheet showing customer info, total orders + total spent, and full order history filtered from `ordersState.cache`

---

## Feature backlog (priority order)

1. **Sales report / CSV export** — date-range picker, summary stats, downloadable CSV of filtered orders.

2. **Edit an existing bill** — load an existing order into the form, modify, re-save (update row in sheet, not append).

3. **Product & price management UI** — add/edit/remove products from the UI; currently requires editing `core/config.js` directly.

4. **Payment reminders** — WhatsApp deep-link to send a payment reminder message to customers with Pending status.

---

## Security rules (never break these)

- `SERVER_SECRET` is stored in Apps Script Script Properties only — **never committed**
- `.clasprc.json` is gitignored — **never committed**
- Passwords are never stored raw — SHA-256+salt hashes only
- `clasp login` must be run by the user on their own machine
- All write endpoints verify the auth token before processing
