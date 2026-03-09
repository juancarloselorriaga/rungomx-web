import { cleanupExpiredRateLimits } from '@/lib/rate-limit';
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
    const deletedCount = await cleanupExpiredRateLimits();
    return NextResponse.json({ success: true, deletedCount });
  } catch (error) {
    console.error('[cron][cleanup-expired-rate-limits] Failed to cleanup expired rate limits', error);
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 });
  }
}
