import { defineConfig, devices } from '@playwright/test';

/**
 * Phase 2 smoke tests (dev DB).
 *
 * - Runs against an already-running dev server (no webServer config here).
 * - Uses local storageState files in `e2e/.auth/` to avoid credential prompts.
 *
 * Run:
 *   pnpm playwright test --config e2e/playwright.phase2-smoke.config.ts
 */
export default defineConfig({
  testDir: './phase2-smoke',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [
    ['html', { outputFolder: 'playwright-report/phase2-smoke', open: 'never' }],
    ['json', { outputFile: 'test-results/phase2-smoke/results.json' }],
    ['list'],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3001',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
    acceptDownloads: true,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        launchOptions: {
          args: ['--host-resolver-rules=MAP localhost 127.0.0.1'],
        },
      },
    },
  ],
});
