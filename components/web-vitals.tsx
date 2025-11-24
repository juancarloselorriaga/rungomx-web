'use client';

import { useReportWebVitals } from 'next/web-vitals';

// Type definitions for external analytics libraries
interface GtagFunction {
  (command: 'event', eventName: string, eventParams: Record<string, unknown>): void;
}

interface VercelAnalyticsFunction {
  (command: 'event', payload: { name: string; data: Record<string, unknown> }): void;
}

declare global {
  interface Window {
    gtag?: GtagFunction;
    va?: VercelAnalyticsFunction;
  }
}

/**
 * Component to report Core Web Vitals metrics
 * Metrics include: CLS, FID, FCP, LCP, TTFB, INP
 *
 * @see https://nextjs.org/docs/app/api-reference/functions/use-report-web-vitals
 */
export function WebVitals() {
  useReportWebVitals((metric) => {
    // Log to console if enabled via environment variable
    if (process.env.NEXT_PUBLIC_LOG_WEB_VITALS === 'true') {
      console.log(`[Web Vitals] ${metric.name}:`, metric.value, metric);
    }

    // Send to analytics in production
    if (process.env.NODE_ENV === 'production') {
      // Send to your analytics service
      // Examples:

      // Google Analytics 4
      if (typeof window !== 'undefined' && window.gtag) {
        window.gtag('event', metric.name, {
          value: Math.round(metric.name === 'CLS' ? metric.value * 1000 : metric.value),
          event_category: 'Web Vitals',
          event_label: metric.id,
          non_interaction: true,
        });
      }

      // Vercel Analytics
      if (typeof window !== 'undefined' && window.va) {
        window.va('event', {
          name: metric.name,
          data: {
            value: metric.value,
            rating: metric.rating,
            delta: metric.delta,
            id: metric.id,
          },
        });
      }

      // Custom API endpoint
      // fetch('/api/vitals', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(metric),
      // }).catch(console.error);
    }
  });

  return null;
}
