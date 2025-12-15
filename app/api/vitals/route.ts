import { NextRequest, NextResponse } from 'next/server';

/**
 * API endpoint to receive and store Core Web Vitals metrics
 * This is optional - you can use this to send metrics to your own analytics system
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate metric data
    if (!body.name || typeof body.value !== 'number') {
      return NextResponse.json({ error: 'Invalid metric data' }, { status: 400 });
    }

    // Log metrics in development
    if (process.env.NODE_ENV === 'development') {
      console.log('[Web Vitals API]', body);
    }

    // In production, you would:
    // 1. Send to your analytics service (e.g., DataDog, New Relic, Segment)
    // 2. Store in a database
    // 3. Send to a monitoring service

    // Example: Send to a third-party service
    // await fetch('https://your-analytics-service.com/vitals', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({
    //     metric: body.name,
    //     value: body.value,
    //     rating: body.rating,
    //     delta: body.delta,
    //     id: body.id,
    //     timestamp: new Date().toISOString(),
    //     url: request.headers.get('referer'),
    //     userAgent: request.headers.get('user-agent'),
    //   }),
    // });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Web Vitals API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
