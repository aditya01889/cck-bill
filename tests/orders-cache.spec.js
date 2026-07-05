const { test, expect } = require('@playwright/test');
const { mockBackend, login } = require('./helpers');

const ORDERS = [
  { billNo: '101', name: 'Alice', date: '01/07/2026', totalAmount: 500, paymentStatus: 'Paid',    fulfillmentStatus: '' },
  { billNo: '102', name: 'Bob',   date: '02/07/2026', totalAmount: 300, paymentStatus: 'Pending', fulfillmentStatus: '' },
];

test('all tabs share a single orders request (dedup + cache)', async ({ page }) => {
  let orderReqs = 0;
  page.on('request', (r) => { if (r.url().includes('action=orders')) orderReqs++; });

  await mockBackend(page, ORDERS);
  await page.goto('/');
  await login(page, 'Aditya');
  await expect(page.locator('#tab-dashboard')).toBeVisible();

  // Dashboard (landing) + the background prefetch both need orders — one request.
  await page.click('#tabOrders');
  await expect(page.locator('#ordersList .order-card')).toHaveCount(2);
  // Ingredients also reads orders — still served from cache, no new request.
  await page.click('#tabIngredients');
  await page.waitForTimeout(400);

  expect(orderReqs, 'orders fetched exactly once across all tabs').toBe(1);
});

test('search filters without corrupting the cache', async ({ page }) => {
  await mockBackend(page, ORDERS);
  await page.goto('/');
  await login(page, 'Aditya');
  await page.click('#tabOrders');
  await expect(page.locator('#ordersList .order-card')).toHaveCount(2);

  await page.fill('#orderSearch', 'alice');
  await expect(page.locator('#ordersList .order-card')).toHaveCount(1);

  // Clearing the search must restore the full list — the cache wasn't overwritten
  // with the filtered subset.
  await page.fill('#orderSearch', '');
  await expect(page.locator('#ordersList .order-card')).toHaveCount(2);
});
