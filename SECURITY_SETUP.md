# Per-user login — deployment runbook

This change moves authentication from the browser (where passwords were visible
in the page source) to the Google Apps Script backend. Data endpoints that
expose customer PII now reject any request without a valid session token.

Because the Apps Script is deployed by hand, follow these steps **in order**.
Do the cutover when the app is not in active use — there's a brief window where
the old frontend and new backend are mismatched.

## What changed

- **Backend (`AppsScript.gs`)** — new `login` action, a signed-token check on
  `orders`, `customers`, `updateStatus`, `updateFulfillment`, bill-create, and
  `uploadProof`. The customer order-tracking link (`getOrderByBill`) stays
  public — it's scoped by its own per-order share token.
- **Frontend (`index.html`)** — the login form now calls the backend, stores the
  returned token in `sessionStorage`, and sends it with every request. Passwords
  are gone from the source.

## Step 1 — Update and deploy the Apps Script

1. Open the Apps Script project bound to your orders spreadsheet.
2. Replace the script contents with the new `AppsScript.gs` from this repo.
3. In the editor, run **`setupServerSecret`** once (Run ▸ setupServerSecret).
   Grant permissions if prompted. This generates the token-signing secret and
   stores it in Script Properties. Re-running it is safe — it won't overwrite an
   existing secret or log anyone out.
4. Create each user by running **`setupUser`** once per person. Use the
   Apps Script editor's function runner, or temporarily add a helper like:

   ```js
   function seedUsers() {
     setupUser('Aditya',   'CHOOSE-A-STRONG-PASSWORD', 'admin');
     setupUser('Priyanka', 'CHOOSE-A-STRONG-PASSWORD', 'staff');
   }
   ```

   Run it once, then delete it (so passwords aren't left in the script). This
   creates a `Users` sheet tab storing only salted SHA-256 password hashes —
   never the raw passwords.
5. **Deploy ▸ Manage deployments ▸ Edit ▸ New version ▸ Deploy.** Keep the same
   Web App URL so the frontend keeps working. Access must remain
   "Anyone" (the token check is what protects the data now, not deployment
   visibility).

## Step 2 — Ship the frontend

Merge this PR. Vercel redeploys `index.html`. The `name` values in the `USERS`
array in `index.html` must match the usernames you created with `setupUser`
(they drive the landing tab and which tabs show — not authentication).

## Step 3 — Verify

1. Open the app — you should see the login screen.
2. Sign in as each user; confirm the correct landing tab and tab visibility.
3. Refresh on each tab (including `/ingredients`) — you stay logged in.
4. **Confirm the hole is closed:** in a private window (not logged in), open
   `<YOUR_WEB_APP_URL>/exec?action=orders&limit=5`. It must return
   `{"status":"error","message":"Unauthorized"}` — **not** order data.
5. Confirm a customer tracking link (`/track?bill=...&token=...`) still works
   without logging in.

## Step 4 — Secure the Ingredient Calculator endpoint (`IngredientCalc.gs`)

The ingredients matrix is served by a **second** Apps Script (bound to the
Ingredient Calculator sheet, `INGREDIENTS_WEBHOOK_URL`). It verifies the same
session token, so it needs the **same `SERVER_SECRET`** as the main project.

1. **Copy the secret from the main project:** open the main Apps Script project ▸
   **Project Settings (gear)** ▸ scroll to **Script Properties** ▸ copy the value
   of `SERVER_SECRET`.
2. **Set it on the Ingredient Calculator project:** open that project ▸
   **Project Settings ▸ Script Properties ▸ Add script property** ▸ name it
   `SERVER_SECRET` and paste the **same** value. (Setting it via Project Settings
   avoids running a function with arguments.)
3. Replace that project's script with the new `IngredientCalc.gs` from this repo
   and **redeploy** (New version), keeping the same Web App URL.
4. **Order matters:** set the secret (steps 1–2) *before or together with* the
   redeploy. If the guard is live but the secret is missing/mismatched, the
   matrix requests come back `Unauthorized` — the app degrades gracefully (orders
   still list; per-ingredient amounts just don't show), it won't lock anyone out.
5. **Verify:** logged in, open the Ingredients tab and select a paid order — the
   Buying/Making ingredient breakdown should populate. Logged out, hitting
   `<INGREDIENTS_WEB_APP_URL>/exec?action=matrix` should return `Unauthorized`.

## Notes & limits

- **Token lifetime is 12h** (`TOKEN_TTL_MS`). After that, users log in again.
- **Revoking someone:** set their `active` cell in the `Users` sheet to `FALSE`.
  They can't get a new token; any existing token stops working within 12h.
- **Reset a password:** re-run `setupUser` with the same username.
- **Rotating `SERVER_SECRET`** logs everyone out (existing tokens stop verifying)
  and must be updated in **both** projects to the same new value.
- Session tokens ride in the query string on GET reads, so they can appear in
  browser history and Apps Script execution logs. That's an accepted trade for
  this internal tool; the short lifetime limits exposure. HTTPS (always on for
  `script.google.com`) keeps them off the wire.

- **Token lifetime is 12h** (`TOKEN_TTL_MS`). After that, users log in again.
- **Revoking someone:** set their `active` cell in the `Users` sheet to `FALSE`.
  They can't get a new token; any existing token stops working within 12h.
- **Reset a password:** re-run `setupUser` with the same username.
- **The ingredients matrix endpoint (`IngredientCalc.gs`)** is a *separate*
  deployment and is **not** covered here. It returns recipe data, not customer
  PII, so it's lower risk — but it should get the same token check in a
  follow-up for consistency.
- Session tokens ride in the query string on GET reads, so they can appear in
  browser history and Apps Script execution logs. That's an accepted trade for
  this internal tool; the short lifetime limits exposure. HTTPS (always on for
  `script.google.com`) keeps them off the wire.
