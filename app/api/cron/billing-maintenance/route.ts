import { runBillingMaintenance } from '@/lib/billing/cron';
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
    const result = await runBillingMaintenance();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('[cron][billing-maintenance] Failed to run billing maintenance', error);
    return NextResponse.json({ error: 'Billing maintenance failed' }, { status: 500 });
  }
}
