import { db } from '@/db';

export type ApplyTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
