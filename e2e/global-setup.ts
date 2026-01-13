/**
 * Playwright Global Setup
 * Runs once before all E2E tests
 * Cleans test database to ensure fresh state
 */

import { setupTestDb, cleanDatabase } from './utils/db';

export default async function globalSetup() {
  console.log('🧹 Cleaning test database before E2E tests...');

  const db = await setupTestDb();
  await cleanDatabase(db);

  console.log('✅ Test database ready - all tables cleaned');
}
