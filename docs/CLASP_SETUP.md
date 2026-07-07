# clasp setup — deploying the backend from the repo

`clasp` is Google's official Apps Script CLI. It replaces the manual
"copy-paste the file into the browser editor, click Deploy" dance we've been
doing for every backend change with a couple of terminal commands, and makes
the repo the actual source of truth for the backend too (not just something
you copy from).

There are **two separate Apps Script projects** (they're bound to two
different Google Sheets), so this repo has two clasp project directories:

```
backend/
  orders/        — Code.js (bound to the main Orders sheet)
  ingredients/   — Code.js (bound to the Ingredient Calculator sheet)
```

## One-time setup (needs your Google account — do this on your own machine)

`clasp login` opens a real browser OAuth flow — it can't be done from an
automated session, and you shouldn't hand your Google credentials to one
anyway. These steps are for you, once:

1. **Enable the Apps Script API.** Go to
   [script.google.com](https://script.google.com) → the gear icon
   ("Settings") in the left sidebar → toggle **Google Apps Script API** on.
   Without this, `clasp` fails with a permissions error.
2. **Install and log in.**
   ```
   npm install
   npm run clasp:login
   ```
   This opens a browser — log in with the **same Google account that owns
   both Apps Script projects** (the one you've been deploying from). It
   stores credentials in `~/.clasprc.json` on your machine only — that file
   is gitignored and must never be committed.
3. **Get each project's Script ID.** Open each Apps Script project in the
   browser editor → the gear icon ("Project Settings") → copy the **Script
   ID** field. Do this for both the Orders project and the Ingredients
   project.
4. **Create the two `.clasp.json` files** (these are *not* secret — just an
   identifier, safe to commit — but I don't have your Script IDs, so you
   create these two, then tell me and I'll take it from there):

   `backend/orders/.clasp.json`:
   ```json
   {
     "scriptId": "PASTE_THE_ORDERS_PROJECT_SCRIPT_ID_HERE",
     "rootDir": "."
   }
   ```

   `backend/ingredients/.clasp.json`:
   ```json
   {
     "scriptId": "PASTE_THE_INGREDIENTS_PROJECT_SCRIPT_ID_HERE",
     "rootDir": "."
   }
   ```

5. **Pull down the real manifest and check for drift:**
   ```
   npm run clasp:pull:orders
   npm run clasp:pull:ingredients
   ```
   This does two useful things at once:
   - Downloads the **real, currently-deployed** `appsscript.json` manifest
     (timezone, Web App access settings, etc.) into each directory — safer
     than anyone guessing it, since it comes straight from what's actually
     live.
   - Overwrites the local `.gs` file with whatever's actually deployed. Since
     every backend change so far has been "paste this exact file and
     deploy," this **should** come back identical to what's already
     committed. If `git diff` shows anything after pulling, that's real
     drift between the repo and the live deployment — worth reviewing before
     committing anything.

## Day to day, once set up

- **Push a code change:**
  ```
  npm run clasp:push:orders        # or clasp:push:ingredients
  ```
  This uploads your local `.gs`/`appsscript.json` changes — equivalent of
  pasting into the editor and saving, minus the copy-paste and the risk of
  pasting a stale or wrong version.
- **Publish it as a live Web App update** — `clasp push` alone does **not**
  update the running Web App; Apps Script separates "save code" from "cut a
  new deployment version," same as it always has. Two ways to do that part:
  - The familiar way: open the project → **Deploy → Manage deployments →
    Edit → New version → Deploy**.
  - Or from the CLI: `cd backend/orders && clasp deployments` (lists
    deployment IDs) then `clasp deploy -i <deploymentId> -d "description"` to
    update that exact deployment without touching the browser at all.
  Start with the familiar manual-deploy click if you'd rather; the CLI
  deploy is there once you're comfortable.
- **Open a project in the browser editor** (e.g. to check something):
  `npm run clasp:open:orders` / `clasp:open:ingredients`.

## A note on `npm audit`

`@google/clasp` is pinned to `^3.3.0` (not the older `2.x` line), which fixes
a real high-severity path-traversal advisory in clasp's own clone/pull code.
`npm audit` will still show a handful of **moderate** advisories in
`uuid`/`gaxios`/`googleapis` — these are transitive dependencies deep in
Google's own SDK, not something clasp itself does or that we call directly.
`npm audit fix --force` "fixes" this by *downgrading* clasp back to `2.5.0`,
which reintroduces the worse, first-party high-severity issue to remove a
minor transitive one — a bad trade. Staying on `3.3.0` and accepting the
moderate transitive advisories is the better call; revisit if Google ships an
updated `googleapis` dependency.

## What to do once your two `.clasp.json` files exist

Tell me the two Script IDs (they're not sensitive) or just push a branch with
the `.clasp.json` files added — either way, I'll run the `clasp:pull` step,
review the diff for any drift, and fold this into the normal `dev` → `main`
flow like everything else.
