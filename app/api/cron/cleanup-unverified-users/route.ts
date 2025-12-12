import { NextResponse } from 'next/server';
import { cleanupExpiredUnverifiedUsers } from '@/lib/auth/cleanup-unverified-users';

const TTL_MS = 24 * 60 * 60 * 1000;

function isAuthorized(request: Request) {
  const authHeader = request.headers.get('authorization') ?? '';
  const secret = process.env.CRON_SECRET;

  // In production, require CRON_SECRET (set in Vercel dashboard)
  if (secret) {
    return authHeader === `Bearer ${secret}`;
  }

  // Fallback for development only (x-vercel-cron header can be spoofed)
  if (process.env.NODE_ENV === 'development') {
    const cronHeader = request.headers.get('x-vercel-cron');
    return cronHeader === '1';
  }

  // No secret configured in production = deny all
  return false;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

