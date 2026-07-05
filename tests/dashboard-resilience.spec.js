const { test, expect } = require('@playwright/test');
const { makeToken } = require('./helpers');

// Covers the cold-start hardening: a slow/transient first load recovers on its
// own (retry), and a transient "Unauthorized" no longer logs out a valid session.

async function seedSession(page) {
  const token = makeToken('Aditya', 'admin');
  await page.addInitScript((tok) => {
    sessionStorage.setItem('cck_user', 'Aditya');
    sessionStorage.setItem('cck_token', tok);
  }, token);
}

const ONE_ORDER = [
  { billNo: '1', name: 'A', date: '01/07/2026', totalAmount: 100, paymentStatus: 'Paid', fulfillmentStatus: '' },
];

test('a cold-start failure recovers on retry, no manual refresh', async ({ page }) => {
  await seedSession(page);
  let attempt = 0;
  await page.route('**script.google.com**', (route) => {
    const url = route.request().url();
    if (url.includes('action=orders')) {
      attempt++;
      if (attempt === 1) return route.abort(); // first request fails (cold start)
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'success', orders: ONE_ORDER }) });
    }
    if (url.includes('action=matrix')) {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'success', matrix: {}, ingredients: [] }) });
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'success', customers: [] }) });
  });

  await page.goto('/dashboard');
  // Dashboard renders after the automatic retry — the user does nothing.
  await expect(page.locator('#dashContent')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#loginScreen')).not.toBeVisible();
});

test('a transient Unauthorized does NOT log a valid session out', async ({ page }) => {
  await seedSession(page);
  await page.route('**script.google.com**', (route) => {
    const url = route.request().url();
    if (url.includes('action=matrix')) {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'success', matrix: {}, ingredients: [] }) });
    }
    // Orders/customers come back Unauthorized while the local token is still valid.
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'error', message: 'Unauthorized' }) });
  });

  await page.goto('/dashboard');
  await expect(page.locator('#tab-dashboard')).toBeVisible();
  // The app must stay logged in (retry, don't bounce). Give retries time to run.
  await page.waitForTimeout(2500);
  await expect(page.locator('#loginScreen')).not.toBeVisible();
  const token = await page.evaluate(() => sessionStorage.getItem('cck_token'));
  expect(token, 'valid session preserved through the transient rejection').toBeTruthy();
});
