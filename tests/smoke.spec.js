const { test, expect } = require('@playwright/test');

test('login screen loads', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#loginScreen')).toBeVisible();
  await expect(page.locator('#appContent')).not.toBeVisible();
});

test('Aditya login → dashboard', async ({ page }) => {
  await page.goto('/');
  await page.fill('#loginUser', 'Aditya');
  await page.fill('#loginPass', 'Admin0604');
  await page.click('#loginBtn');
  await expect(page.locator('#tab-dashboard')).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard/);
  // Ingredients tab visible for Aditya
  await expect(page.locator('#tabIngredients')).toBeVisible();
});

test('Priyanka login → ebill', async ({ page }) => {
  await page.goto('/');
  await page.fill('#loginUser', 'Priyanka');
  await page.fill('#loginPass', 'Admin3001');
  await page.click('#loginBtn');
  await expect(page.locator('#tab-newbill')).toBeVisible();
  await expect(page).toHaveURL(/\/ebill/);
  // Ingredients tab hidden for Priyanka
  await expect(page.locator('#tabIngredients')).not.toBeVisible();
});

test('wrong password shows error', async ({ page }) => {
  await page.goto('/');
  await page.fill('#loginUser', 'Aditya');
  await page.fill('#loginPass', 'wrongpass');
  await page.click('#loginBtn');
  await expect(page.locator('#loginError')).toBeVisible();
  await expect(page.locator('#loginScreen')).toBeVisible();
});

test('tab navigation updates URL', async ({ page }) => {
  await page.goto('/');
  await page.fill('#loginUser', 'Aditya');
  await page.fill('#loginPass', 'Admin0604');
  await page.click('#loginBtn');
  await page.click('#tabOrders');
  await expect(page).toHaveURL(/\/orders/);
  await page.click('#tabNewBill');
  await expect(page).toHaveURL(/\/ebill/);
});
