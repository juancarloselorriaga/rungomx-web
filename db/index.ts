'server only';

import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres';
// @ts-expect-error `pg` typings are not resolved under this workspace's bundler module resolution.
import { Pool as NodePgPool } from 'pg';

import * as relations from './relations';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

type DbSchema = typeof schema & typeof relations;
type DbClient = ReturnType<typeof drizzleNodePg<DbSchema>>;
const schemaConfig = { schema: { ...schema, ...relations } };

let closePoolFn: () => Promise<void>;
let dbInternal: DbClient;

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
  dbInternal = drizzleNodePg<DbSchema>(pool, schemaConfig);
  closePoolFn = async () => {
    await pool.end();
  };
} else {
  // Vercel Node runtime can use TCP with the Neon pooler URL (pg driver),
  // keeping full transaction support and avoiding WebSocket transport pitfalls.
  const pool = new NodePgPool({ connectionString });
  dbInternal = drizzleNodePg<DbSchema>(pool, schemaConfig);
  closePoolFn = async () => {
    await pool.end();
  };
}

export const db = dbInternal;
export type Database = typeof db;

export async function closeDbPool() {
  await closePoolFn();
}
