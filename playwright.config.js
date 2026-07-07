const { defineConfig } = require('@playwright/test');
const fs = require('fs');

// In the claude.ai remote execution environment the browser is pre-installed at
// a fixed path; on CI (GitHub Actions) Playwright installs it itself.
const REMOTE_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const launchOptions = fs.existsSync(REMOTE_CHROME) ? { executablePath: REMOTE_CHROME } : {};

module.exports = defineConfig({
  testDir: './tests',
  timeout: 20000,
  webServer: {
    // No -s: serve reads serve.json, which mirrors vercel.json (cleanUrls +
    // the same rewrites). That way /ingredients -> index.html (route refresh
    // tests) AND /track -> track.html (customer page) both resolve correctly —
    // a blanket SPA fallback would wrongly serve index.html for /track too.
    command: 'npx serve . -p 3000 --no-clipboard',
    port: 3000,
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: 'http://localhost:3000',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium', launchOptions } },
  ],
});
