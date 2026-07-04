const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 20000,
  webServer: {
    // -s serves index.html for unknown routes, emulating Vercel's SPA rewrites
    // (e.g. /ingredients -> /) so refresh-onto-a-route tests work.
    command: 'npx serve . -s -p 3000 --no-clipboard',
    port: 3000,
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: 'http://localhost:3000',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
