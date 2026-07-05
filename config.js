/* ============================================================
   Shared configuration + network helper
   ------------------------------------------------------------
   Loaded as a plain <script> BEFORE app.js (the main app) and before
   the inline script on track.html, so both pages read the same values.
   Change the webhook URL here once — not in two files.

   (Top-level declarations in a classic script are visible to the
   scripts that load after it, so app.js / track.html can use these.)
   ============================================================ */

/* EDIT ZONE 1 — GOOGLE APPS SCRIPT WEB APP URL
   Paste the URL you get after deploying the Apps Script here.
   Leave as empty string '' to disable Google Sheets logging. */
const SHEET_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbxAiGRuOVaN61HJe8szgTGQlA1iun-mjO-3MmhTYW1Jwnyzfc9ZKAmCR9f281-BrZV2/exec";
const INGREDIENTS_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbwQu7pHeXayRv87M7-zUinXNTiw8YQaXXAMQ_E8tY-oLuhGs5tUwqC7dPBBxogCJLKObA/exec"; // TODO: paste IngredientCalc.gs web app URL here

/* EDIT ZONE 1B — UPI ID FOR PAYMENT QR
   This is the VPA customers will pay into. The QR generated on each
   bill includes the bill's exact total amount pre-filled. */
const UPI_ID = "cozycatkitchen@ptaxis";
const UPI_PAYEE_NAME = "CozyCatKitchen";

/* Network helper shared by the app and the tracking page — a hard
   timeout so a slow Apps Script cold-start can't hang a tab forever. */
const DEFAULT_FETCH_TIMEOUT_MS = 15000;

async function fetchWithTimeout(resource, options = {}, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS){
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(resource, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
