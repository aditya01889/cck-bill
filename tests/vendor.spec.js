const { test, expect } = require('@playwright/test');

// Guards the locally-vendored third-party libraries (html2canvas, qrcodejs).
// The bill flow uses them for PNG export and the payment QR; if a vendored
// path broke, the script tag would fail silently and only surface when a user
// generated a bill. This asserts both globals are present after the app loads.
test('vendored libraries load and expose their globals', async ({ page }) => {
  await page.goto('/');
  const libs = await page.evaluate(() => ({
    html2canvas: typeof window.html2canvas,
    QRCode: typeof window.QRCode,
  }));
  expect(libs.html2canvas, 'html2canvas is loaded').toBe('function');
  expect(libs.QRCode, 'QRCode is loaded').toBe('function');
});
