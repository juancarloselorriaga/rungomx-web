import { parse as parseDotenv } from 'dotenv';
import { existsSync, readFileSync } from 'fs';

export type ParsedDbTarget = {
  protocol: string;
  hostname: string;
  port: number;
  host: string;
  database: string;
  username: string;
};

type AssertDatabaseTargetOptions = {
  runtimeUrl: string | undefined;
  runtimeSource: string;
  expectedUrl: string | undefined;
  expectedSource: string;
  operationLabel: string;
};

function parsePort(rawPort: string, protocol: string) {
  if (rawPort) {
    const parsed = Number.parseInt(rawPort, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error(`invalid port "${rawPort}"`);
    }
    return parsed;
  }

  return protocol === 'postgresql:' ? 5432 : 5432;
}

export function parseDatabaseTarget(databaseUrl: string, sourceLabel: string): ParsedDbTarget {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error(`[db-target] ${sourceLabel} must be a valid URL. Received "${databaseUrl}".`);
  }

  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error(
      `[db-target] ${sourceLabel} must use postgres/postgresql protocol. Received "${parsed.protocol}".`,
    );
  }

  const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, '').split('/')[0] ?? '').trim();
  if (!database) {
    throw new Error(`[db-target] ${sourceLabel} must include a database name in the path.`);
  }

  const hostname = parsed.hostname.trim();
  if (!hostname) {
    throw new Error(`[db-target] ${sourceLabel} must include a hostname.`);
  }

  const port = parsePort(parsed.port, parsed.protocol);
  const username = decodeURIComponent(parsed.username || '').trim();

  return {
    protocol: parsed.protocol,
    hostname,
    port,
    host: `${hostname}:${port}`,
    database,
    username,
  };
}

export function describeDatabaseTarget(target: ParsedDbTarget) {
  const userSuffix = target.username ? ` user=${target.username}` : '';
  return `${target.host}/${target.database}${userSuffix}`;
}

export function readEnvFileValue(filePath: string, key: string): string | null {
  if (!existsSync(filePath)) return null;

  const parsed = parseDotenv(readFileSync(filePath, 'utf8'));
  const value = parsed[key]?.trim();
  return value && value.length > 0 ? value : null;
}

export function assertDatabaseTargetMatch({
  runtimeUrl,
  runtimeSource,
  expectedUrl,
  expectedSource,
  operationLabel,
}: AssertDatabaseTargetOptions): ParsedDbTarget {
  if (!runtimeUrl) {
    throw new Error(
      `[db-target] ${operationLabel} blocked: missing runtime DB URL from ${runtimeSource}.`,
    );
  }

  if (!expectedUrl) {
    throw new Error(
      `[db-target] ${operationLabel} blocked: missing expected test DB URL from ${expectedSource}. ` +
        'Provide DATABASE_TEST_URL or DATABASE_URL in .env.test.',
    );
  }

  const runtimeTarget = parseDatabaseTarget(runtimeUrl, runtimeSource);
  const expectedTarget = parseDatabaseTarget(expectedUrl, expectedSource);

  const mismatches: string[] = [];
  if (runtimeTarget.hostname !== expectedTarget.hostname) mismatches.push('hostname');
  if (runtimeTarget.port !== expectedTarget.port) mismatches.push('port');
  if (runtimeTarget.database !== expectedTarget.database) mismatches.push('database');
  const runtimeUsername = runtimeTarget.username || '';
  const expectedUsername = expectedTarget.username || '';
  if (runtimeUsername !== expectedUsername) {
    mismatches.push('username');
  }

  if (mismatches.length > 0) {
    throw new Error(
      `[db-target] ${operationLabel} blocked due to target mismatch (${mismatches.join(', ')}). ` +
        `expected=${describeDatabaseTarget(expectedTarget)} (${expectedSource}); ` +
        `actual=${describeDatabaseTarget(runtimeTarget)} (${runtimeSource}).`,
    );
  }

  return runtimeTarget;
}

export function createDatabaseIdentity(databaseUrl: string | undefined, sourceLabel: string) {
  if (!databaseUrl) return 'db:unknown';
  const target = parseDatabaseTarget(databaseUrl, sourceLabel);
  const user = target.username || 'nouser';
  return `db:${target.host}/${target.database}@${user}`;
}
