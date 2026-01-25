import { and, asc, eq, isNull } from 'drizzle-orm';

import { db } from '@/db';
import { eventSeries } from '@/db/schema';

// =============================================================================
// Types
// =============================================================================

export type EventSeriesSummary = {
  id: string;
  name: string;
  slug: string;
  sportType: string;
};

// =============================================================================
// Queries
// =============================================================================

/**
 * Get event series for an organization.
 */
export async function getOrganizationEventSeries(
  organizationId: string,
): Promise<EventSeriesSummary[]> {
  const series = await db.query.eventSeries.findMany({
    where: and(
      eq(eventSeries.organizationId, organizationId),
      isNull(eventSeries.deletedAt),
    ),
    orderBy: [asc(eventSeries.name)],
  });

  return series.map((s) => ({
    id: s.id,
    name: s.name,
    slug: s.slug,
    sportType: s.sportType,
  }));
}
