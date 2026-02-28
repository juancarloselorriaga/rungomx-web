/**
 * E2E Test Database Utilities
 * Follows Jest testing pattern for consistency
 * Loads .env.test for test database connection
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load test environment variables FIRST before any other imports
config({ path: resolve(__dirname, '../../.env.test') });

// Ensure the Playwright runner process uses the same DB transport as app/test code.
// Without this, runner-side fixtures may use the serverless client and hit read-after-write races.
(process.env as { NODE_ENV: string }).NODE_ENV = 'test';

import { db as appDb } from '@/db';
import { sql } from 'drizzle-orm';

// Verify DATABASE_URL is set
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set in .env.test');
}

/**
 * Get database instance for E2E testing
 * Uses DATABASE_URL from .env.test (should point to test branch)
 */
export function getTestDb() {
  return appDb;
}

const CLEAN_DB_MAX_RETRIES = 5;
const CLEAN_DB_BASE_BACKOFF_MS = 250;

function extractPostgresErrorCode(error: unknown) {
  let current: unknown = error;

  // Drizzle wraps driver errors, so inspect nested causes.
  for (let depth = 0; depth < 5; depth += 1) {
    if (typeof current !== 'object' || current === null) break;
    const currentRecord = current as { code?: unknown; cause?: unknown };
    if (typeof currentRecord.code === 'string' && currentRecord.code.length > 0) {
      return currentRecord.code;
    }
    current = currentRecord.cause;
  }

  return undefined;
}

function isRetryableCleanupError(error: unknown) {
  const code = extractPostgresErrorCode(error);
  if (code === '40P01' || code === '40001' || code === '55P03') {
    return true;
  }

  return error instanceof Error && /deadlock detected/i.test(error.message);
}

async function wait(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function cleanDatabaseOnce(db: ReturnType<typeof getTestDb>) {
  // Truncate all public tables in one statement to avoid FK-order drift as schema evolves.
  // Keep Drizzle migrations metadata so test schema version tracking remains intact.
  await db.execute(sql`
    DO $$
    DECLARE
      truncate_sql text;
    BEGIN
      SELECT
        'TRUNCATE TABLE ' ||
        string_agg(format('%I.%I', schemaname, tablename), ', ') ||
        ' RESTART IDENTITY CASCADE'
      INTO truncate_sql
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename <> '__drizzle_migrations';

      IF truncate_sql IS NOT NULL THEN
        EXECUTE truncate_sql;
      END IF;
    END $$;
  `);
}

/**
 * Clean all tables in the database
 * Truncates all public tables in a single CASCADE statement
 *
 * IMPORTANT: This deletes ALL data from the test database!
 */
export async function cleanDatabase(db: ReturnType<typeof getTestDb>) {
  for (let attempt = 1; attempt <= CLEAN_DB_MAX_RETRIES; attempt += 1) {
    try {
      await cleanDatabaseOnce(db);
      return;
    } catch (error) {
      if (!isRetryableCleanupError(error) || attempt === CLEAN_DB_MAX_RETRIES) {
        throw error;
      }

      const delayMs =
        CLEAN_DB_BASE_BACKOFF_MS * attempt + Math.floor(Math.random() * CLEAN_DB_BASE_BACKOFF_MS);
      const code = extractPostgresErrorCode(error) ?? 'unknown';
      console.warn(
        `cleanDatabase retry ${attempt}/${CLEAN_DB_MAX_RETRIES} after transient DB error (${code}); waiting ${delayMs}ms`,
      );
      await wait(delayMs);
    }
  }
}

/**
 * Reset database to initial state
 * Cleans all data from test database
 */
export async function resetDatabase(db: ReturnType<typeof getTestDb>) {
  await cleanDatabase(db);
}

/**
 * Setup function to run before all E2E tests
 * Cleans database and returns db instance
 */
export async function setupTestDb() {
  const db = getTestDb();
  await resetDatabase(db);
  return db;
}

/**
 * Teardown function to run after all E2E tests
 * Performs final cleanup
 */
export async function teardownTestDb(db: ReturnType<typeof getTestDb>) {
  await cleanDatabase(db);
}
