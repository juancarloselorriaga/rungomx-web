'server only';

import { neonConfig, Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';

import * as relations from './relations';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

// Prefer Node's built-in WebSocket implementation when available (more stable across Node versions).
// Fall back to `ws` only when the global WebSocket is not present.
// eslint-disable-next-line @typescript-eslint/no-require-imports
neonConfig.webSocketConstructor = (globalThis as unknown as { WebSocket?: unknown }).WebSocket
  ?? require('ws');

const pool = new Pool({ connectionString });

export const db = drizzle(pool, { schema: { ...schema, ...relations } });
export type Database = typeof db;
