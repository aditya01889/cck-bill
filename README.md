# CozyCatKitchen E-Bill Generator

A simple, free e-billing tool for CozyCatKitchen — built as a single static HTML page. Lets you create customer order bills, see live totals, and generate a shareable bill image, with order data logged automatically to a Google Sheet.

## What's in this repo

- `index.html` — the complete e-bill app (UI, logic, and CozyCatKitchen branding, all in one file)
- `AppsScript.gs` — Google Apps Script code that logs each generated bill as a row in a connected Google Sheet
- `SETUP_INSTRUCTIONS.md` — step-by-step guide for setting up the Google Sheet logging

## Features

- Customer details form (name, phone, email, address)
- Products grouped by category (Meals, Broths, Treats) with live quantity counters
- Tap the quantity number to type an exact count directly via the numeric keypad
- Live running totals (items + amount)
- Remarks/notes field
- One-tap bill generation as a branded image, shareable via WhatsApp, Instagram, Email, etc. (or downloadable as PNG)
- Every generated bill is logged to a Google Sheet automatically

## Usage

Just open `index.html` in a browser — no build step, no dependencies to install. This is a static site, so it deploys as-is on Vercel, Netlify, GitHub Pages, or any static host.

## Updating products or prices

Open `index.html`, find the `CATALOG` array near the top of the `<script>` section, and edit names/prices directly.

## Google Sheets setup

See `SETUP_INSTRUCTIONS.md` for connecting bill logging to your own Google Sheet.
