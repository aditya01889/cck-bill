const { test, expect } = require('@playwright/test');
const { makeToken } = require('./helpers');

// Regression test for the "Ingredients stuck on Loading orders…" bug on refresh.
//
// Root cause: the _ing* state variables were declared with `let` *after* the
// checkLogin() IIFE. On a refresh directly onto /ingredients, checkLogin runs
// during initial script execution → showApp → loadIngredientTab → loadIngMatrix,
// which touched _ingMatrix before its declaration was reached → a temporal
// dead-zone ReferenceError (an unhandled rejection, so no visible error), and
// the tab stayed stuck on "Loading orders…". A normal tab *click* never hit it
// because by then the whole script had finished running.
//
// This test seeds the logged-in session and loads /ingredients directly (the
// refresh scenario) and asserts the orders render with no uncaught errors.

function mockBackends(page) {
  return page.route('**script.google.com**', async (route) => {
    const url = route.request().url();
    if (url.includes('action=orders')) {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'success',
          orders: [
            { billNo: 101, name: 'Alice', totalItems: 1, totalAmount: 500,
              paymentStatus: 'Paid', dispatchDate: '2026-07-10', fulfillmentStatus: '', itemsSummary: 'Cake x1' },
            { billNo: 102, name: 'Bob', totalItems: 2, totalAmount: 300,
              paymentStatus: 'Paid', dispatchDate: '2026-07-11', fulfillmentStatus: '', itemsSummary: 'Cookies x2' },
          ],
        }),
      });
    }
    if (url.includes('action=matrix')) {
      return route.fulfill({ contentType: 'application/json',
        body: JSON.stringify({ status: 'success', matrix: {}, ingredients: [] }) });
    }
    return route.fulfill({ contentType: 'application/json',
      body: JSON.stringify({ status: 'success', customers: [] }) });
  });
}

test('ingredients tab renders orders after refresh', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await mockBackends(page);
  // Seed the logged-in session (username + valid token) and surface unhandled
  // rejections (the TDZ error manifested as one, not a page error) before any
  // app script runs.
  const token = makeToken('Aditya', 'admin');
  await page.addInitScript((tok) => {
    sessionStorage.setItem('cck_user', 'Aditya');
    sessionStorage.setItem('cck_token', tok);
    window.addEventListener('unhandledrejection', (e) => {
      window.__rejections = window.__rejections || [];
      window.__rejections.push(String(e.reason && (e.reason.message || e.reason)));
    });
  }, token);

  // Load directly on /ingredients while logged in — the exact refresh case.
  await page.goto('/ingredients');

  await expect(page.locator('#tab-ingredients')).toBeVisible();
  const list = page.locator('#ingOrdersList');
  await expect(list.locator('.ing-order-card')).toHaveCount(2, { timeout: 8000 });
  await expect(list).not.toContainText('Loading orders');

  const rejections = await page.evaluate(() => window.__rejections || []);
  expect(rejections, 'no unhandled promise rejections').toEqual([]);
  expect(errors, 'no uncaught page errors').toEqual([]);
});
