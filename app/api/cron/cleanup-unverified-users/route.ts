import { cleanupExpiredUnverifiedUsers } from '@/lib/auth/cleanup-unverified-users';
import { NextResponse } from 'next/server';
import {
  isStandardCronAuthorized,
  standardCronUnauthorizedResponse,
} from '@/app/api/cron/_shared';

const TTL_MS = 24 * 60 * 60 * 1000;

export async function GET(request: Request) {
  if (!isStandardCronAuthorized(request)) {
    return standardCronUnauthorizedResponse();
  }

  const cutoff = new Date(Date.now() - TTL_MS);

  try {
    const result = await cleanupExpiredUnverifiedUsers(cutoff);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[cron][cleanup-unverified-users] Failed to cleanup unverified users', error);
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 });
  }
}
