import { db as appDb } from '@/db';
import * as schema from '@/db/schema';

/**
 * Get database instance for testing
 * Uses DATABASE_URL from environment (should point to test branch)
 */
export function getTestDb() {
  return appDb;
}

/**
 * Clean all tables in the database
 * Useful for ensuring clean state between tests
 */
export async function cleanDatabase(db: ReturnType<typeof getTestDb>) {
  // Delete in FK-safe order to avoid deadlocks on the remote Neon instance.
  await db.delete(schema.auditLogs);
  await db.delete(schema.verifications);
  await db.delete(schema.sessions);
  await db.delete(schema.accounts);
  await db.delete(schema.userRoles);
  await db.delete(schema.profiles);
  await db.delete(schema.contactSubmissions);
  await db.delete(schema.users);
  await db.delete(schema.roles);
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
