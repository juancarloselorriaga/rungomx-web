'server only';

import { neonConfig, Pool as NeonPool } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-serverless';
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres';
import { Pool as NodePgPool } from 'pg';

import * as relations from './relations';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

const schemaConfig = { schema: { ...schema, ...relations } };

let closePoolFn: () => Promise<void>;
let dbInternal: ReturnType<typeof drizzleNeon>;

if (process.env.NODE_ENV === 'test') {
  // Use the native node-postgres transport for Jest DB suites.
  // Prefer pre-resolved host address when available to avoid per-query DNS instability.
  const testHostAddress = process.env.DATABASE_TEST_HOSTADDR;
  const testHostname = process.env.DATABASE_TEST_HOSTNAME;
  const parsed = new URL(connectionString);
  const pool = testHostAddress
    ? new NodePgPool({
        host: testHostAddress,
        port: Number(parsed.port || '5432'),
        user: decodeURIComponent(parsed.username),
        password: decodeURIComponent(parsed.password),
        database: parsed.pathname.replace(/^\//, ''),
        ssl: {
          rejectUnauthorized: false,
          servername: testHostname ?? parsed.hostname,
        },
      })
    : new NodePgPool({ connectionString });
  dbInternal = drizzleNodePg(pool, schemaConfig) as unknown as ReturnType<typeof drizzleNeon>;
  closePoolFn = async () => {
    await pool.end();
  };
} else {
  // Force `ws` for server-side Neon connections for predictable Node behavior.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  neonConfig.webSocketConstructor = require('ws');

  const pool = new NeonPool({ connectionString });
  dbInternal = drizzleNeon(pool, schemaConfig);
  closePoolFn = async () => {
    await pool.end();
  };
}

export const db = dbInternal;
export type Database = typeof db;

export async function closeDbPool() {
  await closePoolFn();
}
