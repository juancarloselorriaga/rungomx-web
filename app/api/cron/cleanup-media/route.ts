import { NextResponse } from 'next/server';

import { cleanupOrphanedMedia } from '@/lib/events/media/cleanup';

/**
 * Cron job to clean up orphaned media files.
 *
 * This endpoint is called by Vercel Cron. To enable it, add to vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/cron/cleanup-media",
 *     "schedule": "0 3 * * *"
 *   }]
 * }
 *
 * This runs daily at 3 AM UTC. Adjust the schedule as needed.
 */
export async function GET(request: Request): Promise<NextResponse> {
  // Verify the request is from Vercel Cron
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  // In production, require CRON_SECRET for security
  if (process.env.NODE_ENV === 'production' && cronSecret) {
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const result = await cleanupOrphanedMedia({
      dryRun: false,
      olderThanDays: 1, // Only delete media older than 1 day
    });

    return NextResponse.json({
      success: true,
      result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[cron/cleanup-media] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
