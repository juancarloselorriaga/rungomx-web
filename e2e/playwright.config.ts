// Load test environment variables FIRST before any other imports
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../.env.test') });

import { defineConfig, devices } from '@playwright/test';
import { hydratePortEnv } from './utils/port-env';

/**
 * Playwright Configuration for RunGoMX E2E Tests
 *
 * Tests Phase 0–2 (Foundations → Event Platform) features
 */
hydratePortEnv();
const DEFAULT_E2E_PORT = 43137;
const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ||
  `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT || process.env.PORT || DEFAULT_E2E_PORT}`;
const origin = (() => {
  try {
    return new URL(baseURL).origin;
  } catch {
    return baseURL;
  }
})();
const port = (() => {
  try {
    const url = new URL(origin);
    if (url.port) {
      const parsed = Number.parseInt(url.port, 10);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  } catch {
    // ignore
  }
  return DEFAULT_E2E_PORT;
})();

function getRunId() {
  const raw = process.env.E2E_RUN_ID?.trim();
  if (!raw) return null;
  return raw.replace(/[^a-zA-Z0-9._-]/g, '_');
}

const runId = getRunId();
const repoRoot = resolve(__dirname, '..');
const outputDir = runId ? resolve(repoRoot, 'test-results', runId) : resolve(repoRoot, 'test-results');
const reportDir = runId ? resolve(repoRoot, 'playwright-report', runId) : resolve(repoRoot, 'playwright-report');
const jsonResultsFile = resolve(outputDir, 'results.json');

export default defineConfig({
  testDir: './tests',
  // Folder for test artifacts such as screenshots, videos, traces, etc.
  outputDir,

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
    ['html', { outputFolder: reportDir, open: 'never' }],
    ['json', { outputFile: jsonResultsFile }],
    ['list'],
  ],

  // Shared settings for all projects
  use: {
    // Base URL for tests (defaults to 127.0.0.1:43137 unless overridden)
    baseURL: origin,

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

  // Run a dedicated Next.js dev server before tests
  webServer: {
    // Avoid file watchers (EMFILE) and bind to localhost for E2E stability.
    command: `NODE_ENV=test pnpm exec next dev -H 127.0.0.1 -p ${port}`,
    url: origin,
    // Always start a fresh server for E2E to guarantee env + DB isolation.
    // Reusing an existing server can point tests at the wrong DATABASE_URL.
    reuseExistingServer: false,
    stdout: 'ignore',
    stderr: 'pipe',
    timeout: 120 * 1000, // 2 minutes to start
    env: {
      // Ensure auth + redirects use the same origin as the test server.
      NEXT_PUBLIC_SITE_URL: origin,
      PORT: String(port),
      // Avoid conflicts with a developer Next.js instance that may be running in the repo.
      // Next.js uses a lock file under `${distDir}/dev/lock`.
      RUNGOMX_NEXT_DIST_DIR: process.env.RUNGOMX_NEXT_DIST_DIR || '.next-e2e',
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
