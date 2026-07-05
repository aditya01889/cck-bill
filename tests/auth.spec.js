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

test('the ingredient matrix request carries the auth token', async ({ page }) => {
  await mockBackend(page);
  const matrixReqs = [];
  page.on('request', (r) => { if (r.url().includes('action=matrix')) matrixReqs.push(r.url()); });

  await page.goto('/');
  await login(page, 'Aditya');
  await page.click('#tabIngredients');
  await expect(page.locator('#tab-ingredients')).toBeVisible();
  await expect.poll(() => matrixReqs.length).toBeGreaterThan(0);

  for (const u of matrixReqs) {
    expect(u, 'every matrix request includes an auth param').toContain('auth=');
  }
});

test('an expired session shows the login screen (and clears the token)', async ({ page }) => {
  // Seed a session whose token has already expired.
  const expired = makeToken('Aditya', 'admin', -1000); // exp in the past
  await page.addInitScript((tok) => {
    sessionStorage.setItem('cck_user', 'Aditya');
    sessionStorage.setItem('cck_token', tok);
  }, expired);

  await page.goto('/orders');
  // checkLogin() rejects the expired token up front — login screen, no data call.
  await expect(page.locator('#loginScreen')).toBeVisible();
  const token2 = await page.evaluate(() => sessionStorage.getItem('cck_token'));
  expect(token2, 'expired session token was cleared').toBeFalsy();
});
