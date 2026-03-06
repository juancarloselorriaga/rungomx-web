/**
 * Playwright Global Teardown
 * Runs once after all E2E tests
 * Performs final cleanup of test database
 */

import { getTestDb, cleanDatabase } from './utils/db';
import { releaseE2eRunLock } from './utils/run-lock';
import { emitDiagnostic } from './utils/diagnostics';

export default async function globalTeardown() {
  emitDiagnostic('global_teardown.start', { runId: process.env.E2E_RUN_ID ?? null });
  try {
    if (process.env.E2E_SKIP_DB_CLEANUP === '1') {
      console.log('⚠️ Skipping E2E database cleanup (E2E_SKIP_DB_CLEANUP=1)');
      emitDiagnostic('global_teardown.skip_cleanup', { runId: process.env.E2E_RUN_ID ?? null }, 'warn');
      return;
    }

    console.log('🧹 Final cleanup after E2E tests...');

    const db = getTestDb();
    await cleanDatabase(db);

    console.log('✅ Cleanup complete - test database cleaned');
    emitDiagnostic('global_teardown.complete', { runId: process.env.E2E_RUN_ID ?? null });
  } catch (error) {
    emitDiagnostic(
      'global_teardown.failed',
      {
        runId: process.env.E2E_RUN_ID ?? null,
        error,
      },
      'error',
    );
    throw error;
  } finally {
    await releaseE2eRunLock();
  }
}
