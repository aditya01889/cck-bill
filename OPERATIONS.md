# Operations — backups & error log

Two operational features live in `backend/orders/Code.js` (main project).
Both take effect after you deploy the updated script and redeploy that Web App
(New version) — either by pasting into the editor, or via
`npm run clasp:push:orders` (see `docs/CLASP_SETUP.md`).

## Automated backups

Makes a timestamped copy of the **entire** spreadsheet (orders, Customers,
ErrorLog — everything) into a Drive folder called **CCK Backups**, and keeps the
most recent **30**. This protects your single source of truth against accidental
deletion or corruption.

**One-time setup:**
1. In the main Apps Script project, run **`setupBackupTrigger`** once
   (Run ▸ setupBackupTrigger). Grant the Drive permission when prompted.
2. That installs a **daily** trigger (~2am, script timezone) and takes one
   backup immediately.
3. Verify: open Google Drive → **CCK Backups** folder → you should see a
   `CCK backup YYYY-MM-DD_HH-mm` file.

**Notes**
- Run **`backupSpreadsheet`** by hand anytime for an on-demand snapshot.
- Change cadence/retention via `BACKUP_KEEP` (default 30) and the `everyDays(1)`
  / `atHour(2)` in `setupBackupTrigger`.
- Backups are full copies, so restoring is just opening the copy (or
  File ▸ Make a copy) — no special tooling.

## Client error log

Uncaught errors and unhandled promise rejections in the web app are reported to
`?action=clientError` and recorded in an **ErrorLog** sheet tab
(Timestamp, User, Message, Context, Path, UserAgent), capped at the most recent
500 rows. This gives silent client-side failures a durable trail — the kind of
bug that used to only show as a frozen spinner now leaves a row you can read.

- The sheet tab is created automatically on the first error; no setup needed.
- The endpoint is intentionally **public** (via GET) so errors that happen
  before/without login are still captured, and so an older backend that predates
  this endpoint simply ignores the request (no spurious writes).
- Reporting is capped at 20 per page load and fully swallows its own failures, so
  it can never loop or cause a new error.
