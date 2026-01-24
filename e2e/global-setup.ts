/**
 * Playwright Global Setup
 * Runs once before all E2E tests
 * Cleans test database to ensure fresh state
 */

import { setupTestDb } from './utils/db';
import { acquireE2eRunLock } from './utils/run-lock';

export default async function globalSetup() {
  await acquireE2eRunLock();
  console.log('🧹 Cleaning test database before E2E tests...');

  await setupTestDb();

  console.log('✅ Test database ready - all tables cleaned');
}
