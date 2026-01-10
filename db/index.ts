'server only';

import { neonConfig, Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from 'ws';

import * as relations from './relations';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString });

export const db = drizzle(pool, { schema: { ...schema, ...relations } });
export type Database = typeof db;
