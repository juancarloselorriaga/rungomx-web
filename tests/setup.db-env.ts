import { resolve } from 'path';
import { setupTestDatabaseEnv } from '../testing/setup-db-env';

/**
 * Early environment setup for DB tests.
 * Runs via Jest `setupFiles` before test modules are evaluated.
 */

setupTestDatabaseEnv(resolve(__dirname, '../.env.test'));
