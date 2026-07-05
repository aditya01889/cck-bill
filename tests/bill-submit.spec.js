const { test, expect } = require('@playwright/test');
const { makeToken } = require('./helpers');

// Seed a logged-in session so the app is open and logToSheet() has a token.
async function seedSession(page) {
  const token = makeToken('Aditya', 'admin');
  await page.addInitScript((tok) => {
    sessionStorage.setItem('cck_user', 'Aditya');
    sessionStorage.setItem('cck_token', tok);
  }, token);
}

const MINIMAL_BILL = {
  billNo: 'TEST-999', dateStr: '', name: 'X', phone: '', email: '', address: '', remarks: '',
  totalItems: 1, totalAmount: 100, deliveryCharges: 0, dispatchDateDisplay: '',
  items: [{ category: 'C', name: 'N', qty: 1, lineTotal: 100 }],
  generatedBy: 'Aditya', mapLink: '', deliveryType: '', shareToken: 't',
};

test('a rejected bill submission shows a persistent warning (not silently lost)', async ({ page }) => {
  await seedSession(page);
  // Backend rejects the write (as an expired token would).
  await page.route('**script.google.com**', (route) => {
    if (route.request().method() === 'POST') {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'error', message: 'Unauthorized' }) });
    }
    if (route.request().url().includes('action=matrix')) {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'success', matrix: {}, ingredients: [] }) });
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'success', orders: [] }) });
  });

  await page.goto('/');
  await expect(page.locator('#tab-dashboard')).toBeVisible();

  await page.evaluate((bill) => logToSheet(bill), MINIMAL_BILL);

  const toast = page.locator('#globalErrorToast');
  await expect(toast).toBeVisible();
  // A persistent warning naming the bill — the exact wording differs for an
  // expired vs. a transient rejection, but it must flag that it may not be saved.
  await expect(toast).toContainText('TEST-999');
  await expect(toast).toContainText('saved');
  // Persistent — still visible after the normal 8s auto-hide window.
  await page.waitForTimeout(1000);
  await expect(toast).toBeVisible();
});

test('a successful bill submission shows no error', async ({ page }) => {
  await seedSession(page);
  await page.route('**script.google.com**', (route) => {
    if (route.request().method() === 'POST') {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'success' }) });
    }
    if (route.request().url().includes('action=matrix')) {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'success', matrix: {}, ingredients: [] }) });
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'success', orders: [] }) });
  });

  await page.goto('/');
  await expect(page.locator('#tab-dashboard')).toBeVisible();

  await page.evaluate((bill) => logToSheet(bill), MINIMAL_BILL);
  await page.waitForTimeout(500);

  await expect(page.locator('#globalErrorToast')).toHaveCount(0);
});
