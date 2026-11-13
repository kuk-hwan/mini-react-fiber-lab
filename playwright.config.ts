import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  // All browser scenarios share the same local database/cache server.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:5186',
    trace: 'retain-on-failure',
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
  },
  webServer: [
    {
      command: process.env.CI ? 'npm run preview -- --port 5186' : 'npm run dev -- --port 5186',
      url: 'http://127.0.0.1:5186',
      env: { API_TARGET: 'http://127.0.0.1:8788' },
      reuseExistingServer: false,
    },
    {
      command: `python -m backend.server --port 8788 --data .data/e2e-${process.pid}`,
      url: 'http://127.0.0.1:8788/api/health',
      reuseExistingServer: false,
    },
  ],
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
});
