// Load test environment variables FIRST before any other imports
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../.env.test') });

import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Configuration for RunGoMX E2E Tests
 *
 * Tests Phase 0 (Foundations) and Phase 1 (Event Management) features
 */
const testBaseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3001';
const testOrigin = (() => {
  try {
    return new URL(testBaseURL).origin;
  } catch {
    return 'http://localhost:3001';
  }
})();
const testPort = (() => {
  try {
    const url = new URL(testOrigin);
    if (url.port) {
      const parsed = Number.parseInt(url.port, 10);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return url.protocol === 'https:' ? 443 : 80;
  } catch {
    return 3001;
  }
})();

export default defineConfig({
  testDir: './tests',

  // Global setup/teardown for database cleanup
  globalSetup: require.resolve('./global-setup'),
  globalTeardown: require.resolve('./global-teardown'),

  // Test timeout (increased for database operations)
  timeout: 60 * 1000, // 60 seconds per test

  // Global setup/teardown timeout
  globalTimeout: 15 * 60 * 1000, // 15 minutes for entire suite

  // Expect timeout for assertions
  expect: {
    timeout: 10 * 1000, // 10 seconds
  },

  // Fail fast on CI, run all locally
  fullyParallel: false, // Run tests sequentially to avoid conflicts

  // Retry failed tests
  retries: process.env.CI ? 2 : 0,

  // Number of workers (1 = sequential execution)
  workers: 1,

  // Reporter configuration
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['list'],
  ],

  // Shared settings for all projects
  use: {
    // Base URL for tests (use port 3001 to avoid conflicts with dev server)
    baseURL: testOrigin,

    // Collect trace on failure
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',

    // Video on failure
    video: 'retain-on-failure',

    // Browser context options
    viewport: { width: 1280, height: 720 },

    // Ignore HTTPS errors (for local development)
    ignoreHTTPSErrors: true,

    // Wait for navigation to complete
    navigationTimeout: 30 * 1000,

    // Wait for actions
    actionTimeout: 15 * 1000,
  },

  // Projects for different browsers/contexts
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    // Uncomment to test on other browsers
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },

    // Mobile viewports
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
  ],

  // Run local dev server before tests on port 3001 to avoid conflicts
  webServer: {
    command: `NODE_ENV=test PORT=${testPort} pnpm dev`,
    url: testOrigin,
    // Always start a fresh server for E2E to guarantee env + DB isolation.
    // Reusing an existing server can point tests at the wrong DATABASE_URL.
    reuseExistingServer: false,
    stdout: 'ignore',
    stderr: 'pipe',
    timeout: 120 * 1000, // 2 minutes to start
    env: {
      // Ensure auth + redirects use the same origin as the test server.
      NEXT_PUBLIC_SITE_URL: testOrigin,
      // Force dev server to use test database
      ...(process.env.DATABASE_URL && { DATABASE_URL: process.env.DATABASE_URL }),
      // Mapbox tokens for location search
      ...(process.env.MAPBOX_ACCESS_TOKEN && { MAPBOX_ACCESS_TOKEN: process.env.MAPBOX_ACCESS_TOKEN }),
      ...(process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN && {
        NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN: process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN,
      }),
    },
  },
});
