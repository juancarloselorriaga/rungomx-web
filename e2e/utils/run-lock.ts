import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import os from 'os';
import { dirname, resolve } from 'path';

type LockInfo = {
  pid: number;
  startedAt: string;
  runId?: string;
  baseUrl?: string;
  databaseHost?: string;
};

function isProcessAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means the process exists but we can't signal it.
    if (typeof error === 'object' && error && 'code' in error && error.code === 'EPERM') {
      return true;
    }
    return false;
  }
}

function getDatabaseHost() {
  if (!process.env.DATABASE_URL) return undefined;
  try {
    return new URL(process.env.DATABASE_URL).host;
  } catch {
    return undefined;
  }
}

function getLockPath(databaseHost: string | undefined) {
  const safeHost = (databaseHost || 'unknown').replace(/[^a-zA-Z0-9._-]/g, '_');
  const overrideRoot = process.env.E2E_LOCK_DIR?.trim();
  const lockRoot = overrideRoot ? resolve(overrideRoot) : resolve(os.tmpdir(), 'rungomx-web');
  return resolve(lockRoot, `e2e-run.${safeHost}.lock`);
}

export async function acquireE2eRunLock() {
  if (process.env.E2E_SKIP_RUN_LOCK === '1') return;

  const databaseHost = getDatabaseHost();
  const lockPath = getLockPath(databaseHost);

  await mkdir(dirname(lockPath), { recursive: true });

  const lockInfo: LockInfo = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    runId: process.env.E2E_RUN_ID,
    baseUrl: process.env.PLAYWRIGHT_BASE_URL,
    databaseHost,
  };

  try {
    await writeFile(lockPath, JSON.stringify(lockInfo, null, 2), { flag: 'wx' });
  } catch (error) {
    if (!(typeof error === 'object' && error && 'code' in error && error.code === 'EEXIST')) {
      throw error;
    }

    const existingRaw = await readFile(lockPath, 'utf8').catch(() => null);
    const existing = (() => {
      try {
        return existingRaw ? (JSON.parse(existingRaw) as Partial<LockInfo>) : null;
      } catch {
        return null;
      }
    })();

    const existingPid = existing?.pid;
    const hasActivePid = typeof existingPid === 'number' && existingPid > 0 && isProcessAlive(existingPid);
    if (!hasActivePid) {
      await unlink(lockPath).catch(() => undefined);
      return acquireE2eRunLock();
    }

    const runId = existing?.runId ? ` runId=${existing.runId}` : '';
    const baseUrl = existing?.baseUrl ? ` baseUrl=${existing.baseUrl}` : '';
    const dbHost = existing?.databaseHost ? ` dbHost=${existing.databaseHost}` : '';
    throw new Error(
      `Another E2E run appears to be active (pid=${existingPid}${runId}${baseUrl}${dbHost}). ` +
        'Wait for it to finish or run in an isolated config (different DATABASE_URL and PLAYWRIGHT_BASE_URL). ' +
        'To bypass the lock (not recommended), set E2E_SKIP_RUN_LOCK=1.',
    );
  }
}

export async function releaseE2eRunLock() {
  if (process.env.E2E_SKIP_RUN_LOCK === '1') return;
  const lockPath = getLockPath(getDatabaseHost());
  await unlink(lockPath).catch(() => undefined);
}
