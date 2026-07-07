# CozyCatKitchen E-Bill Generator

A simple, free e-billing tool for CozyCatKitchen — built as a single static HTML page. Create customer order bills, see live totals, generate a shareable bill image, view order history, and update payment statuses — all logged automatically to a Google Sheet.

## What's in this repo

- `index.html` — the complete e-bill app (UI, logic, and CozyCatKitchen branding, all in one file)
- `backend/orders/AppsScript.gs` — Google Apps Script code that logs each generated bill as a row in a connected Google Sheet, and serves order history and status updates back to the app
- `backend/ingredients/IngredientCalc.gs` — Apps Script code for the Ingredient Calculator sheet
- `SETUP_INSTRUCTIONS.md` — step-by-step guide for setting up the Google Sheet logging
- `docs/CLASP_SETUP.md` — deploying the backend from the repo via `clasp` instead of copy-pasting into the browser editor

## Features

- **Login gate** — username/password login; each bill is attributed to whoever generated it (visible on the bill and logged to the Sheet)
- Customer details form (name, phone, email, address) with basic validation
- Products grouped by category (Meals, Broths, Treats) with live quantity counters
- Tap the quantity number to type an exact count directly via the numeric keypad
- Live running totals (items + amount)
- Delivery charges and dispatch date range fields
- Remarks/notes field
- **New Order button** — resets all fields instantly to start the next bill without refreshing the page
- One-tap bill generation as a branded image with UPI payment QR pre-filled to the exact total
- **Share** via WhatsApp, Instagram, Email, etc., **Copy to clipboard**, or **Download as PNG**
- Every generated bill is logged to a Google Sheet automatically (with Sheet logging error shown visibly if it fails)
- **Orders tab** — view the 50 most recent orders, search by name or bill number, and update payment status directly from the app

## Usage

Just open `index.html` in a browser — no build step, no dependencies to install. This is a static site, so it deploys as-is on Vercel, Netlify, GitHub Pages, or any static host.

## Managing employees / login credentials

Open `index.html`, find the `USERS` array in the `<!-- EDIT ZONE 3 -->` section:

```js
const USERS = [
  { name: "Aditya", password: "your-password" },
  // Add more employees here
];
```

Add or remove entries to control who can access the tool. Each person's name appears on every bill they generate and in the Google Sheet log.

## Updating products or prices

Open `index.html`, find the `CATALOG` array near the top of the `<script>` section, and edit names/prices directly.

## Google Sheets setup

See `SETUP_INSTRUCTIONS.md` for connecting bill logging to your own Google Sheet, including the column structure, payment status dropdown setup, and how to redeploy the Apps Script after changes.
