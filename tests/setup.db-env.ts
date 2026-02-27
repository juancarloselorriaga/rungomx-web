/**
 * Early environment setup for DB tests.
 * Runs via Jest `setupFiles` before test modules are evaluated.
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { execFileSync } from 'child_process';

const envFile = resolve(__dirname, '../.env.test');
const result = config({ path: envFile, override: true, quiet: true });

if (result.error) {
  throw new Error(`Failed to load .env.test from ${envFile}: ${result.error.message}`);
}

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set in .env.test');
}

// Keep a stable test-only URL even if other loaders mutate DATABASE_URL later.
process.env.DATABASE_TEST_URL = process.env.DATABASE_URL;

function resolveHostAddressSync(hostname: string): string | null {
  try {
    const resolverScript = `
      const dns = require('dns');
      dns.lookup(process.argv[1], (error, address) => {
        if (error || !address) {
          process.exit(1);
          return;
        }
        process.stdout.write(address);
      });
    `;
    const address = execFileSync(process.execPath, ['-e', resolverScript, hostname], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    return address.length > 0 ? address : null;
  } catch {
    return null;
  }
}

try {
  const parsed = new URL(process.env.DATABASE_TEST_URL);
  process.env.DATABASE_TEST_HOSTNAME = parsed.hostname;
  const resolvedAddress = resolveHostAddressSync(parsed.hostname);
  if (resolvedAddress) {
    process.env.DATABASE_TEST_HOSTADDR = resolvedAddress;
  }
} catch {
  // URL parse and DNS resolution are best-effort; db/index.ts falls back to connection string.
}
