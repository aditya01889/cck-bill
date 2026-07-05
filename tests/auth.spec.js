const { test, expect } = require('@playwright/test');
const { mockBackend, login, makeToken } = require('./helpers');

test('successful login stores a session token and opens the app', async ({ page }) => {
  await mockBackend(page);
  await page.goto('/');
  await login(page, 'Aditya');
  await expect(page.locator('#tab-dashboard')).toBeVisible();

  const token = await page.evaluate(() => sessionStorage.getItem('cck_token'));
  expect(token, 'a token is persisted for the session').toBeTruthy();
});

test('guarded data requests carry the auth token', async ({ page }) => {
  await mockBackend(page);
  const orderReqs = [];
  page.on('request', (r) => { if (r.url().includes('action=orders')) orderReqs.push(r.url()); });

  await page.goto('/');
  await login(page, 'Aditya');
  await expect(page.locator('#tab-dashboard')).toBeVisible();

  expect(orderReqs.length, 'orders were fetched').toBeGreaterThan(0);
  for (const u of orderReqs) {
    expect(u, 'every orders request includes an auth param').toContain('auth=');
  }
});

test('an Unauthorized response sends the user back to login', async ({ page }) => {
  // Seed a logged-in session, but make the backend reject as if the token expired.
  const token = makeToken('Aditya', 'admin');
  await page.addInitScript((tok) => {
    sessionStorage.setItem('cck_user', 'Aditya');
    sessionStorage.setItem('cck_token', tok);
  }, token);
  await page.route('**script.google.com**', (route) => {
    const url = route.request().url();
    if (url.includes('action=matrix')) {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'success', matrix: {}, ingredients: [] }) });
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'error', message: 'Unauthorized' }) });
  });

  await page.goto('/orders');
  // forceRelogin() should clear the session and show the login screen again.
  await expect(page.locator('#loginScreen')).toBeVisible();
  const token2 = await page.evaluate(() => sessionStorage.getItem('cck_token'));
  expect(token2, 'session token was cleared').toBeFalsy();
});
