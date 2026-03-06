import { spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { acquireE2eRunLock, releaseE2eRunLock } from '../e2e/utils/run-lock';
import { emitDiagnostic } from '../e2e/utils/diagnostics';
import {
  normalizeBaseUrl,
  parsePortValue,
  resolvePlaywrightRuntimeTarget,
} from '../e2e/utils/port-env';

function getPnpmCommand() {
  return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
}

function sanitizeRunId(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9._-]/g, '_');
}

function generateRunId() {
  const iso = new Date().toISOString().replace(/[:.]/g, '-');
  const rand = Math.random().toString(16).slice(2, 8);
  return `e2e-${iso}-${rand}`;
}

function hydrateDatabaseUrlFromEnvTest() {
  if (process.env.DATABASE_URL) return;

  const envPath = path.resolve(process.cwd(), '.env.test');
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, 'utf8');
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const withoutExport = trimmed.startsWith('export ') ? trimmed.slice('export '.length).trim() : trimmed;
    if (!withoutExport.startsWith('DATABASE_URL=')) continue;

    let value = withoutExport.slice('DATABASE_URL='.length).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (value) {
      process.env.DATABASE_URL = value;
    }
    return;
  }
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && !!error && 'code' in error;
}

function isProcessAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (isErrnoException(error) && error.code === 'EPERM') return true;
    return false;
  }
}

function getIsolatedPortRange() {
  const startRaw = process.env.E2E_PORT_RANGE_START;
  const endRaw = process.env.E2E_PORT_RANGE_END;

  const start = startRaw ? Number.parseInt(startRaw, 10) : 43138;
  const end = endRaw ? Number.parseInt(endRaw, 10) : 43999;

  if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end <= 0 || start >= end) {
    throw new Error(
      `Invalid isolated port range (E2E_PORT_RANGE_START=${startRaw ?? ''} E2E_PORT_RANGE_END=${
        endRaw ?? ''
      }). Set a valid numeric range or unset both.`,
    );
  }

  return { start, end };
}

function getGlobalLockRootDir() {
  const overrideRoot = process.env.E2E_LOCK_DIR?.trim();
  return overrideRoot ? path.resolve(overrideRoot) : path.resolve(os.tmpdir(), 'rungomx-web');
}

function getPortLockPath(port: number) {
  return path.resolve(getGlobalLockRootDir(), `e2e-port.${port}.lock`);
}

function reserveIsolatedPort(runId: string) {
  const { start, end } = getIsolatedPortRange();
  const range = end - start + 1;

  const seed = (() => {
    const digest = crypto.createHash('sha256').update(runId).digest();
    return digest.length >= 4 ? digest.readUInt32BE(0) : Math.floor(Math.random() * 1_000_000);
  })();

  const maxAttempts = Math.min(range, 128);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const port = start + ((seed + attempt) % range);
    const lockPath = getPortLockPath(port);

    fs.mkdirSync(path.dirname(lockPath), { recursive: true });

    try {
      fs.writeFileSync(
        lockPath,
        JSON.stringify(
          { pid: process.pid, startedAt: new Date().toISOString(), runId, port },
          null,
          2,
        ),
        { flag: 'wx' },
      );
      return { port, lockPath };
    } catch (error) {
      if (!isErrnoException(error) || error.code !== 'EEXIST') throw error;

      const existingRaw = (() => {
        try {
          return fs.readFileSync(lockPath, 'utf8');
        } catch {
          return null;
        }
      })();

      const existing = (() => {
        try {
          return existingRaw ? (JSON.parse(existingRaw) as { pid?: number }) : null;
        } catch {
          return null;
        }
      })();

      const existingPid = existing?.pid;
      const hasActivePid = typeof existingPid === 'number' && existingPid > 0 && isProcessAlive(existingPid);

      if (!hasActivePid) {
        try {
          fs.unlinkSync(lockPath);
        } catch {
          // ignore
        }
        attempt -= 1; // retry same port
        continue;
      }
    }
  }

  throw new Error(
    'Unable to reserve an isolated port for E2E. Try setting PLAYWRIGHT_PORT/PLAYWRIGHT_BASE_URL, ' +
      'or widen the E2E_PORT_RANGE_START/E2E_PORT_RANGE_END range.',
  );
}

function resolveExplicitTargetFromEnv() {
  const baseUrlRaw = process.env.PLAYWRIGHT_BASE_URL?.trim();
  const playwrightPortRaw = process.env.PLAYWRIGHT_PORT?.trim();
  const portRaw = process.env.PORT?.trim();
  const explicitPortValue = playwrightPortRaw
    ? parsePortValue(playwrightPortRaw, 'PLAYWRIGHT_PORT')
    : null;
  const fallbackPortValue = portRaw ? parsePortValue(portRaw, 'PORT') : null;

  if (
    explicitPortValue !== null &&
    fallbackPortValue !== null &&
    explicitPortValue !== fallbackPortValue
  ) {
    throw new Error(
      `[e2e:isolated] Conflicting ports detected: PLAYWRIGHT_PORT=${explicitPortValue} and PORT=${fallbackPortValue}. ` +
        'Use a single consistent value.',
    );
  }

  if (baseUrlRaw) {
    const normalized = normalizeBaseUrl(baseUrlRaw, 'PLAYWRIGHT_BASE_URL');
    if (explicitPortValue !== null && explicitPortValue !== normalized.port) {
      throw new Error(
        `[e2e:isolated] Conflicting config: PLAYWRIGHT_BASE_URL uses port ${normalized.port} but PLAYWRIGHT_PORT=${explicitPortValue}.`,
      );
    }
    if (fallbackPortValue !== null && fallbackPortValue !== normalized.port) {
      throw new Error(
        `[e2e:isolated] Conflicting config: PLAYWRIGHT_BASE_URL uses port ${normalized.port} but PORT=${fallbackPortValue}.`,
      );
    }
    return { baseUrl: normalized.origin, port: normalized.port, source: 'PLAYWRIGHT_BASE_URL' as const };
  }

  if (explicitPortValue !== null) {
    const port = explicitPortValue;
    return { baseUrl: `http://127.0.0.1:${port}`, port, source: 'PLAYWRIGHT_PORT' as const };
  }

  if (fallbackPortValue !== null) {
    const port = fallbackPortValue;
    return { baseUrl: `http://127.0.0.1:${port}`, port, source: 'PORT' as const };
  }

  return null;
}

function signalToExitCode(signal: NodeJS.Signals | null) {
  if (!signal) return 1;
  if (signal === 'SIGINT') return 130;
  if (signal === 'SIGTERM') return 143;
  return 1;
}

async function main() {
  const [targetScript = 'test:e2e', ...forwardArgs] = process.argv.slice(2);

  hydrateDatabaseUrlFromEnvTest();

  const runId = sanitizeRunId(process.env.E2E_RUN_ID || generateRunId());
  const explicitTarget = resolveExplicitTargetFromEnv();
  const reserved = explicitTarget ? null : reserveIsolatedPort(runId);
  const resolvedTarget = explicitTarget
    ? explicitTarget
    : reserved
      ? { baseUrl: `http://127.0.0.1:${reserved.port}`, port: reserved.port, source: 'reserved' as const }
      : resolvePlaywrightRuntimeTarget({
          applyToProcessEnv: false,
        });
  const baseUrl = resolvedTarget.baseUrl;
  const port = resolvedTarget.port;

  process.env.E2E_RUN_ID = runId;
  process.env.PLAYWRIGHT_PORT = String(port);
  process.env.PLAYWRIGHT_BASE_URL = baseUrl;
  process.env.PORT = String(port);

  let cleanedUp = false;
  const releaseReservedPort = () => {
    if (!reserved) return;
    try {
      fs.unlinkSync(reserved.lockPath);
    } catch {
      // ignore
    }
  };
  const cleanup = async (reason: string) => {
    if (cleanedUp) return;
    cleanedUp = true;
    emitDiagnostic('isolated_runner.cleanup.start', { reason, runId, baseUrl, port });
    releaseReservedPort();
    await releaseE2eRunLock();
    emitDiagnostic('isolated_runner.cleanup.complete', { reason, runId, baseUrl, port });
  };

  emitDiagnostic('isolated_runner.start', {
    runId,
    targetScript,
    baseUrl,
    port,
    explicitSource: explicitTarget?.source ?? 'reserved',
    reservedPortLock: reserved?.lockPath ?? null,
  });

  try {
    await acquireE2eRunLock();
  } catch (error) {
    await cleanup('acquire-lock-failure');
    throw error;
  }

  console.log(`[e2e] isolated runId=${runId}`);
  console.log(`[e2e] isolated baseUrl=${baseUrl}`);
  console.log(`[e2e] isolated artifactsDir=test-results/${runId}`);
  console.log(`[e2e] isolated reportDir=playwright-report/${runId}`);

  const childEnv = { ...process.env };

  // pnpm/playwright may set FORCE_COLOR for descendants; keeping NO_COLOR alongside it only
  // generates Node warnings and does not change test behavior.
  delete childEnv.NO_COLOR;

  const child = spawn(getPnpmCommand(), [targetScript, ...forwardArgs], {
    stdio: 'inherit',
    env: {
      ...childEnv,
      E2E_RUN_ID: runId,
      PLAYWRIGHT_PORT: String(port),
      PLAYWRIGHT_BASE_URL: baseUrl,
      PORT: String(port),
      // Lock is acquired by this wrapper process; avoid double-locking in Playwright globalSetup/teardown.
      E2E_SKIP_RUN_LOCK: '1',
    },
  });

  const forwardSignal = (signal: NodeJS.Signals) => {
    emitDiagnostic('isolated_runner.signal.forward', { signal, childPid: child.pid, runId }, 'warn');
    if (!child.killed) child.kill(signal);
  };

  process.on('SIGINT', forwardSignal);
  process.on('SIGTERM', forwardSignal);

  try {
    const childExitCode = await new Promise<number>((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => {
        emitDiagnostic('isolated_runner.child.exit', {
          runId,
          code,
          signal,
        });
        resolve(code ?? signalToExitCode(signal));
      });
    }).finally(() => {
      process.off('SIGINT', forwardSignal);
      process.off('SIGTERM', forwardSignal);
    });

    process.exitCode = childExitCode;
  } finally {
    await cleanup('child-complete');
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
