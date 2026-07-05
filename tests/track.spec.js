const { test, expect } = require('@playwright/test');

// The customer-facing tracking page. Loaded here as /track.html (in production
// Vercel's cleanUrls serves it at /track — the URL customers already have).

const ORDER = {
  billNo: 'CCK-1', date: '01/07/2026', name: 'Alice',
  itemsSummary: 'Meals: Nourish x2 (₹140)', totalItems: 2, deliveryCharges: 0,
  totalAmount: 140, paymentStatus: 'Paid', dispatchDate: '', fulfillmentStatus: 'Dispatched',
  trackingLink: 'https://track.example/xyz',
};

test('track page renders an order from a valid link', async ({ page }) => {
  await page.route('**script.google.com**', (route) => {
    if (route.request().url().includes('action=getOrderByBill')) {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'success', order: ORDER }) });
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'success' }) });
  });

  await page.goto('/track?bill=CCK-1&token=t');
  await expect(page.locator('#orderContent')).toBeVisible();
  await expect(page.locator('#tBillNo')).toHaveText('CCK-1');
  await expect(page.locator('#tName')).toHaveText('Alice');
});

test('a load failure shows a working Try-again button and is reported', async ({ page }) => {
  const reports = [];
  let attempt = 0;
  await page.route('**script.google.com**', (route) => {
    const url = route.request().url();
    if (url.includes('action=clientError')) {
      reports.push(url);
      return route.fulfill({ contentType: 'application/json', body: '{"status":"success"}' });
    }
    if (url.includes('action=getOrderByBill')) {
      attempt++;
      if (attempt === 1) return route.abort(); // first attempt fails
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'success', order: ORDER }) });
    }
    return route.fulfill({ contentType: 'application/json', body: '{"status":"success"}' });
  });

  await page.goto('/track?bill=CCK-1&token=t');
  await expect(page.locator('#stateError')).toBeVisible();
  await expect(page.locator('#retryBtn')).toBeVisible();
  await expect.poll(() => reports.length, 'the failure was reported to the error log').toBeGreaterThan(0);

  // Retry succeeds.
  await page.locator('#retryBtn').click();
  await expect(page.locator('#orderContent')).toBeVisible();
  await expect(page.locator('#tBillNo')).toHaveText('CCK-1');
});

// Fulfillment stepper — new statuses (Packed → Booked → Picked Up → Delivered)
// and backward-compat for legacy orders stored as "Dispatched".
function routeOrder(page, fulfillmentStatus) {
  return page.route('**script.google.com**', (route) => {
    if (route.request().url().includes('action=getOrderByBill')) {
      return route.fulfill({ contentType: 'application/json',
        body: JSON.stringify({ status: 'success', order: { ...ORDER, fulfillmentStatus } }) });
    }
    return route.fulfill({ contentType: 'application/json', body: '{"status":"success"}' });
  });
}

test('stepper highlights the Booked stage', async ({ page }) => {
  await routeOrder(page, 'Booked');
  await page.goto('/track?bill=CCK-1&token=t');
  await expect(page.locator('#stepPacked')).toHaveClass(/done/);
  await expect(page.locator('#stepBooked')).toHaveClass(/active/);
});

test('stepper highlights Picked Up (multi-word status resolves correctly)', async ({ page }) => {
  await routeOrder(page, 'Picked Up');
  await page.goto('/track?bill=CCK-1&token=t');
  await expect(page.locator('#stepPickedUp')).toHaveClass(/active/);
  await expect(page.locator('#stepBooked')).toHaveClass(/done/);
});

test('legacy "Dispatched" order maps to the Picked Up stage', async ({ page }) => {
  await routeOrder(page, 'Dispatched');
  await page.goto('/track?bill=CCK-1&token=t');
  await expect(page.locator('#stepPickedUp')).toHaveClass(/active/);
});
