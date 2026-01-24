/**
 * Playwright Global Teardown
 * Runs once after all E2E tests
 * Performs final cleanup of test database
 */

import { getTestDb, cleanDatabase } from './utils/db';
import { releaseE2eRunLock } from './utils/run-lock';

export default async function globalTeardown() {
  try {
    if (process.env.E2E_SKIP_DB_CLEANUP === '1') {
      console.log('⚠️ Skipping E2E database cleanup (E2E_SKIP_DB_CLEANUP=1)');
      return;
    }

    console.log('🧹 Final cleanup after E2E tests...');

    const db = getTestDb();
    await cleanDatabase(db);

    console.log('✅ Cleanup complete - test database cleaned');
  } finally {
    await releaseE2eRunLock();
  }
}
