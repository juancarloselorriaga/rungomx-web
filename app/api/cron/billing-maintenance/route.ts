import { runBillingMaintenance } from '@/lib/billing/cron';
import { NextResponse } from 'next/server';

function isAuthorized(request: Request) {
  const authHeader = request.headers.get('authorization') ?? '';
  const secret = process.env.CRON_SECRET;

  if (secret) {
    return authHeader === `Bearer ${secret}`;
  }

  if (process.env.NODE_ENV === 'development') {
    const cronHeader = request.headers.get('x-vercel-cron');
    return cronHeader === '1';
  }

  return false;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runBillingMaintenance();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('[cron][billing-maintenance] Failed to run billing maintenance', error);
    return NextResponse.json({ error: 'Billing maintenance failed' }, { status: 500 });
  }
}
