import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(__dirname, '../..');

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

  if (!process.env.PLAYWRIGHT_PORT) {
    const playwrightPort = readEnvValue('PLAYWRIGHT_PORT', envFiles);
    if (playwrightPort) process.env.PLAYWRIGHT_PORT = playwrightPort;
  }

  if (!process.env.PORT) {
    const port = readEnvValue('PORT', envFiles);
    if (port) process.env.PORT = port;
  }
}
