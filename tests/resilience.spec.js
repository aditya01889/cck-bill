const { test, expect } = require('@playwright/test');

// Covers the two resilience utilities added alongside the ingredients fix:
//   1. a global error handler that surfaces otherwise-silent failures
//   2. fetchWithTimeout() so a hung backend request can't freeze a tab

test('global handler shows a toast on an unhandled rejection', async ({ page }) => {
  await page.goto('/');
  // Simulate a silent failure like the TDZ bug (an unhandled promise rejection).
  await page.evaluate(() => { Promise.reject(new Error('simulated silent failure')); });

  const toast = page.locator('#globalErrorToast');
  await expect(toast).toBeVisible();
  await expect(toast).toContainText('Something went wrong');

  // It is dismissible.
  await page.locator('#globalErrorToast button').click();
  await expect(toast).toHaveCount(0);
});

test('fetchWithTimeout aborts a request that never responds', async ({ page }) => {
  // Leave the request hanging (never fulfilled) so only our timeout can end it.
  await page.route('**/hang.example/**', async () => { /* intentionally never responds */ });
  await page.goto('/');

  const result = await page.evaluate(async () => {
    try {
      await fetchWithTimeout('https://hang.example/never', {}, 300);
      return 'resolved';
    } catch (e) {
      return e && e.name; // AbortError on timeout
    }
  });

  expect(result).toBe('AbortError');
});
