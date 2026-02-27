/**
 * Global setup for database tests
 * Runs after Jest environment initialization
 */

import { closeTestDbPool } from './helpers/db';

// Verify DATABASE_URL is set
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set in .env.test');
}

// Neon is remote and cleanup operations can be slow; avoid flaky hook timeouts.
jest.setTimeout(20_000);

// Ensure DB pool connections are closed after each test file to avoid stale clients.
afterAll(async () => {
  await closeTestDbPool();
});
