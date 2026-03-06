import { mkdir, readFile, stat, unlink, writeFile } from 'fs/promises';
import os from 'os';
import { dirname, resolve } from 'path';
import { createDatabaseIdentity } from '@/testing/db-target';
import { emitDiagnostic } from './diagnostics';

type LockInfo = {
  pid: number;
  startedAt: string;
  hostname: string;
  lockIdentity: string;
  databaseIdentity: string;
  runId?: string;
  baseUrl?: string;
};

type ExistingLockState = {
  info: Partial<LockInfo> | null;
  ageMs: number;
  raw: string | null;
};

const DEFAULT_STALE_LOCK_MS = 30 * 60 * 1000;

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

function getStaleLockThresholdMs() {
  const raw = process.env.E2E_STALE_LOCK_MS?.trim();
  if (!raw) return DEFAULT_STALE_LOCK_MS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid E2E_STALE_LOCK_MS value: "${raw}". Expected a positive integer.`);
  }
  return parsed;
}

function getDatabaseIdentity() {
  const runtimeUrl = process.env.DATABASE_URL ?? process.env.DATABASE_TEST_URL;
  if (!runtimeUrl) return 'db:unknown';

  try {
    return createDatabaseIdentity(runtimeUrl, 'DATABASE_URL');
  } catch (error) {
    emitDiagnostic(
      'run_lock.database_identity.parse_failed',
      {
        message: error instanceof Error ? error.message : String(error),
      },
      'warn',
    );
    return 'db:invalid';
  }
}

function getLockIdentity() {
  return `${os.hostname()}::${getDatabaseIdentity()}`;
}

function getLockPath(lockIdentity: string) {
  const safeIdentity = lockIdentity.replace(/[^a-zA-Z0-9._-]/g, '_');
  const overrideRoot = process.env.E2E_LOCK_DIR?.trim();
  const lockRoot = overrideRoot ? resolve(overrideRoot) : resolve(os.tmpdir(), 'rungomx-web');
  return resolve(lockRoot, `e2e-run.${safeIdentity}.lock`);
}

async function readExistingLockState(lockPath: string): Promise<ExistingLockState> {
  const [raw, metadata] = await Promise.all([
    readFile(lockPath, 'utf8').catch(() => null),
    stat(lockPath).catch(() => null),
  ]);

  const info = (() => {
    try {
      return raw ? (JSON.parse(raw) as Partial<LockInfo>) : null;
    } catch {
      return null;
    }
  })();

  const ageMs = metadata ? Date.now() - metadata.mtimeMs : Number.POSITIVE_INFINITY;
  return { info, ageMs, raw };
}

function formatConflictMessage(
  lockPath: string,
  existing: Partial<LockInfo> | null,
  currentIdentity: string,
  staleAfterMs: number,
  ageMs: number,
) {
  const details = {
    lockPath,
    currentIdentity,
    staleAfterMs,
    existingPid: existing?.pid ?? 'unknown',
    existingRunId: existing?.runId ?? 'unknown',
    existingHostname: existing?.hostname ?? 'unknown',
    existingDatabaseIdentity: existing?.databaseIdentity ?? 'unknown',
    existingStartedAt: existing?.startedAt ?? 'unknown',
    lockAgeMs: Number.isFinite(ageMs) ? Math.round(ageMs) : 'unknown',
  };
  return (
    `Another E2E run lock is active or unsafe to reclaim. ` +
    `details=${JSON.stringify(details)}. ` +
    `Wait for the owning process to finish, or remove stale lock ${lockPath} manually if you confirmed it is safe. ` +
    'To bypass lock protection (not recommended), set E2E_SKIP_RUN_LOCK=1.'
  );
}

export async function acquireE2eRunLock() {
  if (process.env.E2E_SKIP_RUN_LOCK === '1') return;

  const lockIdentity = getLockIdentity();
  const lockPath = getLockPath(lockIdentity);
  const staleAfterMs = getStaleLockThresholdMs();

  await mkdir(dirname(lockPath), { recursive: true });

  const lockInfo: LockInfo = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    hostname: os.hostname(),
    lockIdentity,
    databaseIdentity: getDatabaseIdentity(),
    runId: process.env.E2E_RUN_ID,
    baseUrl: process.env.PLAYWRIGHT_BASE_URL,
  };

  emitDiagnostic('run_lock.acquire.start', {
    lockIdentity,
    lockPath,
    pid: process.pid,
    runId: process.env.E2E_RUN_ID,
    baseUrl: process.env.PLAYWRIGHT_BASE_URL,
  });

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await writeFile(lockPath, JSON.stringify(lockInfo, null, 2), { flag: 'wx' });
      emitDiagnostic('run_lock.acquire.success', {
        lockIdentity,
        lockPath,
        pid: process.pid,
      });
      return;
    } catch (error) {
      if (!(typeof error === 'object' && error && 'code' in error && error.code === 'EEXIST')) {
        throw error;
      }

      const existingState = await readExistingLockState(lockPath);
      const existing = existingState.info;
      const existingPid = existing?.pid;
      const existingHost = existing?.hostname;
      const sameHost = !existingHost || existingHost === os.hostname();
      const activeLocalPid =
        sameHost && typeof existingPid === 'number' && existingPid > 0 && isProcessAlive(existingPid);

      if (activeLocalPid) {
        emitDiagnostic(
          'run_lock.acquire.conflict',
          {
            lockPath,
            lockIdentity,
            existing,
            lockAgeMs: Math.round(existingState.ageMs),
          },
          'warn',
        );
        throw new Error(
          formatConflictMessage(lockPath, existing, lockIdentity, staleAfterMs, existingState.ageMs),
        );
      }

      const lockIsStale = existingState.ageMs >= staleAfterMs;
      const canReclaim =
        (sameHost && typeof existingPid === 'number' && existingPid > 0 && !isProcessAlive(existingPid)) ||
        (lockIsStale &&
          (existingPid === undefined || (typeof existingPid === 'number' && existingPid <= 0)));

      if (!canReclaim) {
        emitDiagnostic(
          'run_lock.acquire.conflict',
          {
            lockPath,
            lockIdentity,
            existing,
            lockAgeMs: Math.round(existingState.ageMs),
            sameHost,
            canReclaim,
          },
          'warn',
        );
        throw new Error(
          formatConflictMessage(lockPath, existing, lockIdentity, staleAfterMs, existingState.ageMs),
        );
      }

      emitDiagnostic('run_lock.acquire.reclaiming_stale_lock', {
        lockPath,
        lockIdentity,
        existing,
        lockAgeMs: Math.round(existingState.ageMs),
      });

      await unlink(lockPath).catch(() => undefined);
      if (attempt === 2) {
        throw new Error(`Unable to reclaim stale E2E lock at ${lockPath}.`);
      }
    }
  }
}

export async function releaseE2eRunLock() {
  if (process.env.E2E_SKIP_RUN_LOCK === '1') return;

  const lockIdentity = getLockIdentity();
  const lockPath = getLockPath(lockIdentity);
  const existingState = await readExistingLockState(lockPath).catch(() => null);
  const existing = existingState?.info;

  const ownedByCurrentProcess = (() => {
    if (!existing) return true;
    const samePid = existing.pid === process.pid;
    const sameHost = !existing.hostname || existing.hostname === os.hostname();
    return samePid && sameHost;
  })();

  if (!ownedByCurrentProcess) {
    emitDiagnostic(
      'run_lock.release.skipped_not_owner',
      {
        lockPath,
        lockIdentity,
        currentPid: process.pid,
        existing,
      },
      'warn',
    );
    return;
  }

  await unlink(lockPath).catch(() => undefined);
  emitDiagnostic('run_lock.release.success', {
    lockPath,
    lockIdentity,
    pid: process.pid,
  });
}
