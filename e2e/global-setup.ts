/**
 * Playwright Global Setup
 * Runs once before all E2E tests
 * Cleans test database to ensure fresh state
 */

import { setupTestDb } from './utils/db';
import { acquireE2eRunLock, releaseE2eRunLock } from './utils/run-lock';
import { emitDiagnostic } from './utils/diagnostics';

export default async function globalSetup() {
  await acquireE2eRunLock();
  emitDiagnostic('global_setup.start', { runId: process.env.E2E_RUN_ID ?? null });
  console.log('🧹 Cleaning test database before E2E tests...');

  try {
    await setupTestDb();
  } catch (error) {
    emitDiagnostic(
      'global_setup.failed',
      {
        runId: process.env.E2E_RUN_ID ?? null,
        error,
      },
      'error',
    );
    await releaseE2eRunLock();
    throw error;
  }

  emitDiagnostic('global_setup.complete', { runId: process.env.E2E_RUN_ID ?? null });
  console.log('✅ Test database ready - all tables cleaned');
}
