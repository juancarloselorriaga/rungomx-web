import { cleanupExpiredRegistrations } from '@/lib/events/cleanup-expired-registrations';
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
    const cancelledCount = await cleanupExpiredRegistrations();
    return NextResponse.json({ success: true, cancelledCount });
  } catch (error) {
    console.error(
      '[cron][cleanup-expired-event-registrations] Failed to cleanup expired registrations',
      error,
    );
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 });
  }
}
