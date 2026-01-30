import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const DEFAULT_PORT = '8080';
const nodeEnv = process.env.NODE_ENV || 'development';
const envFiles = [
  `.env.${nodeEnv}.local`,
  '.env.local',
  `.env.${nodeEnv}`,
  '.env',
];

function readPortFromEnvFile(filePath) {
  const contents = readFileSync(filePath, 'utf8');
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^PORT\s*=\s*(.+)$/);
    if (!match) continue;
    let value = match[1].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value) return value;
  }
  return null;
}

if (!process.env.PORT) {
  for (const envFile of envFiles) {
    const filePath = path.join(process.cwd(), envFile);
    if (!existsSync(filePath)) continue;
    const port = readPortFromEnvFile(filePath);
    if (port) {
      process.env.PORT = port;
      break;
    }
  }
}

if (!process.env.PORT) {
  process.env.PORT = DEFAULT_PORT;
}

const command = process.platform === 'win32' ? 'next.cmd' : 'next';
const args = ['dev', ...process.argv.slice(2)];
const child = spawn(command, args, {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code) => {
  process.exit(typeof code === 'number' ? code : 1);
});
