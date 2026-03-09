import { cleanupExpiredSessions } from '@/lib/auth/cleanup-expired-sessions';
import { NextResponse } from 'next/server';
import {
  isStandardCronAuthorized,
  standardCronUnauthorizedResponse,
} from '@/app/api/cron/_shared';

export async function GET(request: Request) {
  if (!isStandardCronAuthorized(request)) {
    return standardCronUnauthorizedResponse();
  }

  try {
    const result = await cleanupExpiredSessions();
    return NextResponse.json(result);
  } catch (error) {
    console.error('[cron][cleanup-expired-sessions] Failed to cleanup expired sessions', error);
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 });
  }
}
