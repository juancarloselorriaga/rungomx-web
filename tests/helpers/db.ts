import * as schema from '@/db/schema';
import { neon } from '@neondatabase/serverless';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';

/**
 * Get database instance for testing
 * Uses DATABASE_URL from environment (should point to test branch)
 */
export function getTestDb() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }

  const client = neon(connectionString);
  return drizzle(client, { schema });
}

/**
 * Clean all tables in the database
 * Useful for ensuring clean state between tests
 */
export async function cleanDatabase(db: ReturnType<typeof getTestDb>) {
  const tables = ['user_roles', 'sessions', 'accounts', 'profiles', 'roles', 'users'];

  for (const table of tables) {
    await db.execute(sql.raw(`TRUNCATE TABLE ${table} CASCADE`));
  }
}

/**
 * Reset database to initial state
 * Runs migrations and cleans all data
 */
export async function resetDatabase(db: ReturnType<typeof getTestDb>) {
  await cleanDatabase(db);
}

/**
 * Setup function to run before all tests
 */
export async function setupTestDb() {
  const db = getTestDb();
  await resetDatabase(db);
  return db;
}

/**
 * Teardown function to run after all tests
 */
export async function teardownTestDb(db: ReturnType<typeof getTestDb>) {
  await cleanDatabase(db);
}
