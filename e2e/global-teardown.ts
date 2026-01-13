/**
 * Playwright Global Teardown
 * Runs once after all E2E tests
 * Performs final cleanup of test database
 */

import { getTestDb, cleanDatabase } from './utils/db';

export default async function globalTeardown() {
  console.log('🧹 Final cleanup after E2E tests...');

  const db = getTestDb();
  await cleanDatabase(db);

  console.log('✅ Cleanup complete - test database cleaned');
}
