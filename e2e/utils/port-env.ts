import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(__dirname, '../..');
export const DEFAULT_E2E_PORT = 43137;

type ResolvedPlaywrightTarget = {
  baseUrl: string;
  origin: string;
  port: number;
  source: 'PLAYWRIGHT_BASE_URL' | 'PLAYWRIGHT_PORT' | 'PORT' | 'default';
};

function readEnvValueFromFile(filePath: string, key: string): string | null {
  const contents = readFileSync(filePath, 'utf8');
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(new RegExp(`^(?:export\\s+)?${key}\\s*=\\s*(.+)$`));
    if (!match) continue;
    let value = match[1].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    return value || null;
  }
  return null;
}

function readEnvValue(key: string, envFiles: string[]): string | null {
  for (const envFile of envFiles) {
    const filePath = resolve(repoRoot, envFile);
    if (!existsSync(filePath)) continue;
    const value = readEnvValueFromFile(filePath, key);
    if (value) return value;
  }
  return null;
}

export function hydratePortEnv() {
  const nodeEnv = process.env.NODE_ENV || 'test';
  const envFiles = [
    `.env.${nodeEnv}.local`,
    '.env.local',
    `.env.${nodeEnv}`,
    '.env',
  ];

  if (!process.env.PLAYWRIGHT_BASE_URL) {
    const playwrightBaseUrl = readEnvValue('PLAYWRIGHT_BASE_URL', envFiles);
    if (playwrightBaseUrl) process.env.PLAYWRIGHT_BASE_URL = playwrightBaseUrl;
  }

  if (!process.env.PLAYWRIGHT_PORT) {
    const playwrightPort = readEnvValue('PLAYWRIGHT_PORT', envFiles);
    if (playwrightPort) process.env.PLAYWRIGHT_PORT = playwrightPort;
  }

  if (!process.env.PORT) {
    const port = readEnvValue('PORT', envFiles);
    if (port) process.env.PORT = port;
  }
}

export function parsePortValue(raw: string, source: string): number {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`[e2e:port-env] ${source} must be a valid port number (1-65535). Received "${raw}".`);
  }
  return parsed;
}

export function normalizeBaseUrl(rawBaseUrl: string, source: string) {
  let parsed: URL;
  try {
    parsed = new URL(rawBaseUrl);
  } catch {
    throw new Error(`[e2e:port-env] ${source} must be a valid URL. Received "${rawBaseUrl}".`);
  }

  if (parsed.protocol !== 'http:') {
    throw new Error(
      `[e2e:port-env] ${source} must use http protocol for local Playwright webServer runs. Received "${parsed.protocol}".`,
    );
  }

  const inferredPort = parsed.port || '80';
  const port = parsePortValue(inferredPort, `${source} port`);
  return { origin: parsed.origin, port };
}

export function resolvePlaywrightRuntimeTarget({
  defaultPort = DEFAULT_E2E_PORT,
  applyToProcessEnv = false,
}: {
  defaultPort?: number;
  applyToProcessEnv?: boolean;
} = {}): ResolvedPlaywrightTarget {
  hydratePortEnv();

  const explicitBaseUrl = process.env.PLAYWRIGHT_BASE_URL?.trim();
  const explicitPort = process.env.PLAYWRIGHT_PORT?.trim();
  const fallbackPort = process.env.PORT?.trim();
  const explicitPortValue = explicitPort ? parsePortValue(explicitPort, 'PLAYWRIGHT_PORT') : null;
  const fallbackPortValue = fallbackPort ? parsePortValue(fallbackPort, 'PORT') : null;

  if (
    explicitPortValue !== null &&
    fallbackPortValue !== null &&
    explicitPortValue !== fallbackPortValue
  ) {
    throw new Error(
      `[e2e:port-env] Conflicting ports detected: PLAYWRIGHT_PORT=${explicitPortValue} and PORT=${fallbackPortValue}. ` +
        'Use a single consistent value.',
    );
  }

  let resolved: ResolvedPlaywrightTarget;

  if (explicitBaseUrl) {
    const normalized = normalizeBaseUrl(explicitBaseUrl, 'PLAYWRIGHT_BASE_URL');
    if (explicitPortValue !== null && explicitPortValue !== normalized.port) {
      throw new Error(
        `[e2e:port-env] Conflicting config: PLAYWRIGHT_BASE_URL uses port ${normalized.port} but PLAYWRIGHT_PORT=${explicitPortValue}.`,
      );
    }
    if (fallbackPortValue !== null && fallbackPortValue !== normalized.port) {
      throw new Error(
        `[e2e:port-env] Conflicting config: PLAYWRIGHT_BASE_URL uses port ${normalized.port} but PORT=${fallbackPortValue}.`,
      );
    }
    resolved = {
      baseUrl: normalized.origin,
      origin: normalized.origin,
      port: normalized.port,
      source: 'PLAYWRIGHT_BASE_URL',
    };
  } else if (explicitPortValue !== null) {
    const port = explicitPortValue;
    resolved = {
      baseUrl: `http://127.0.0.1:${port}`,
      origin: `http://127.0.0.1:${port}`,
      port,
      source: 'PLAYWRIGHT_PORT',
    };
  } else if (fallbackPortValue !== null) {
    const port = fallbackPortValue;
    resolved = {
      baseUrl: `http://127.0.0.1:${port}`,
      origin: `http://127.0.0.1:${port}`,
      port,
      source: 'PORT',
    };
  } else {
    resolved = {
      baseUrl: `http://127.0.0.1:${defaultPort}`,
      origin: `http://127.0.0.1:${defaultPort}`,
      port: defaultPort,
      source: 'default',
    };
  }

  if (applyToProcessEnv) {
    process.env.PLAYWRIGHT_BASE_URL = resolved.origin;
    process.env.PLAYWRIGHT_PORT = String(resolved.port);
    process.env.PORT = String(resolved.port);
  }

  return resolved;
}
