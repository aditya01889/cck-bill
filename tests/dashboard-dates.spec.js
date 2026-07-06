const { test, expect } = require('@playwright/test');

// parseOrderMonth() drives the dashboard's "last 6 months" revenue trend.
// A month silently showed ₹0 when an order's date didn't parse — which happens
// if Google Sheets stored the Date column as a real date (returned as an ISO
// string) or if a date used a full month name. It must handle all of these.
// parseOrderMonth is a global function in app.js, available on any page load.

test('parseOrderMonth handles the app format, full month names, and ISO dates', async ({ page }) => {
  await page.goto('/');
  const results = await page.evaluate(() => ({
    appFormat: parseOrderMonth('5 Jul 2026, 2:30 pm'),   // what the app writes
    fullMonth: parseOrderMonth('5 July 2026'),           // hand-typed full name
    isoCell:   parseOrderMonth('2026-07-05T09:00:00.000Z'), // Sheets date cell
    isoDate:   parseOrderMonth('2026-07-05'),
    lowercase: parseOrderMonth('5 jul 2026'),
    january:   parseOrderMonth('1 Jan 2026, 9:00 am'),
    garbage:   parseOrderMonth('not a date'),
    empty:     parseOrderMonth(''),
  }));

  // July is month index 6.
  expect(results.appFormat).toEqual({ year: 2026, month: 6 });
  expect(results.fullMonth).toEqual({ year: 2026, month: 6 });
  expect(results.isoCell).toEqual({ year: 2026, month: 6 });
  expect(results.isoDate).toEqual({ year: 2026, month: 6 });
  expect(results.lowercase).toEqual({ year: 2026, month: 6 });
  expect(results.january).toEqual({ year: 2026, month: 0 });
  expect(results.garbage).toBeNull();
  expect(results.empty).toBeNull();
});
