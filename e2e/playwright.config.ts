import { resolve } from 'path';
import { setupTestDatabaseEnv } from '../testing/setup-db-env';

// Load test environment variables FIRST before any other imports.
setupTestDatabaseEnv(resolve(__dirname, '../.env.test'), { override: false });
// Playwright and pnpm can set FORCE_COLOR in child processes. Drop NO_COLOR here to avoid
// Node's conflicting-color-env warning across the E2E runner and the web server it spawns.
delete process.env.NO_COLOR;
// Ensure every Playwright worker imports app code under test mode transport.
// This must happen at config bootstrap time, before spec/module evaluation.
(process.env as { NODE_ENV: string }).NODE_ENV = 'test';

import { defineConfig, devices } from '@playwright/test';
import { DEFAULT_E2E_PORT, resolvePlaywrightRuntimeTarget } from './utils/port-env';

/**
 * Playwright Configuration for RunGoMX E2E Tests
 *
 * Tests Phase 0–2 (Foundations → Event Platform) features
 */
const runtimeTarget = resolvePlaywrightRuntimeTarget({
  defaultPort: DEFAULT_E2E_PORT,
  applyToProcessEnv: true,
});
const origin = runtimeTarget.origin;
const port = runtimeTarget.port;
const includeExtendedE2E = process.env.PW_INCLUDE_EXTENDED_E2E?.trim() === 'true';

function getRunId() {
  const raw = process.env.E2E_RUN_ID?.trim();
  if (!raw) return null;
  return raw.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function createWebServerEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

const runId = getRunId();
const repoRoot = resolve(__dirname, '..');
const outputDir = runId ? resolve(repoRoot, 'test-results', runId) : resolve(repoRoot, 'test-results');
const reportDir = runId ? resolve(repoRoot, 'playwright-report', runId) : resolve(repoRoot, 'playwright-report');
const jsonResultsFile = resolve(outputDir, 'results.json');
const nextServerMode = process.env.E2E_NEXT_SERVER_MODE?.trim() === 'dev' ? 'dev' : 'start';
const webServerEnv = createWebServerEnv();
webServerEnv.NEXT_PUBLIC_SITE_URL = origin;
webServerEnv.PORT = String(port);
webServerEnv.RUNGOMX_NEXT_DIST_DIR = process.env.RUNGOMX_NEXT_DIST_DIR || '.next-e2e';
webServerEnv.NODE_ENV = nextServerMode === 'dev' ? 'development' : 'production';
// Production-style E2E runs exercise repeated auth flows quickly. Disable the
// auth limiter explicitly for the spawned app server instead of relying on
// NODE_ENV, which Next.js normalizes to "production" under `next start`.
webServerEnv.E2E_DISABLE_AUTH_RATE_LIMIT = 'true';
// Demo-pay E2E coverage runs the app through a production build, so the
// explicit production override must be enabled for the spawned test server.
webServerEnv.EVENTS_DEMO_PAYMENTS_ALLOW_PRODUCTION = 'true';

if (process.env.DATABASE_URL) {
  webServerEnv.DATABASE_URL = process.env.DATABASE_URL;
}

if (process.env.DATABASE_TEST_URL) {
  webServerEnv.DATABASE_TEST_URL = process.env.DATABASE_TEST_URL;
}

if (process.env.DATABASE_TEST_HOSTNAME) {
  webServerEnv.DATABASE_TEST_HOSTNAME = process.env.DATABASE_TEST_HOSTNAME;
}

if (process.env.DATABASE_TEST_HOSTADDR) {
  webServerEnv.DATABASE_TEST_HOSTADDR = process.env.DATABASE_TEST_HOSTADDR;
}

if (process.env.MAPBOX_ACCESS_TOKEN) {
  webServerEnv.MAPBOX_ACCESS_TOKEN = process.env.MAPBOX_ACCESS_TOKEN;
}

if (process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN) {
  webServerEnv.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
}

export default defineConfig({
  testDir: './tests',
  // Keep the main E2E gate focused on smoke-level coverage. Broader regression
  // suites opt in via PW_INCLUDE_EXTENDED_E2E=true.
  grepInvert: includeExtendedE2E ? undefined : /@extended/,
  // Folder for test artifacts such as screenshots, videos, traces, etc.
  outputDir,

  // Global setup/teardown for database cleanup
  globalSetup: require.resolve('./global-setup'),
  globalTeardown: require.resolve('./global-teardown'),

  // Test timeout (increased for database operations)
  timeout: 60 * 1000, // 60 seconds per test

  // Global setup/teardown timeout
  globalTimeout: 30 * 60 * 1000, // 30 minutes for production-build E2E runs

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

  // Run a dedicated Next.js server before tests.
  // Production mode is the default to avoid dev-time route compilation races during long suites.
  webServer: {
    command:
      nextServerMode === 'dev'
        ? `pnpm exec next dev -H 127.0.0.1 -p ${port}`
        : `pnpm exec next build --webpack && pnpm exec next start -H 127.0.0.1 -p ${port}`,
    cwd: repoRoot,
    url: origin,
    // Always start a fresh server for E2E to guarantee env + DB isolation.
    // Reusing an existing server can point tests at the wrong DATABASE_URL.
    reuseExistingServer: false,
    stdout: 'ignore',
    stderr: 'pipe',
    timeout: nextServerMode === 'dev' ? 120 * 1000 : 10 * 60 * 1000,
    env: webServerEnv,
  },
});
