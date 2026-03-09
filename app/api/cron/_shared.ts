import { NextResponse } from 'next/server';

export function isStandardCronAuthorized(request: Request): boolean {
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

export function standardCronUnauthorizedResponse(): NextResponse {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
