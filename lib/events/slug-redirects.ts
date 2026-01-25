'server only';

import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { eventSlugRedirects } from '@/db/schema';

export type SlugRedirectTarget = {
  seriesSlug: string;
  editionSlug: string;
  hops: number;
};

export async function resolveEventSlugRedirect(
  seriesSlug: string,
  editionSlug: string,
  options?: { maxHops?: number },
): Promise<SlugRedirectTarget | null> {
  const maxHops = options?.maxHops ?? 5;
  const visited = new Set<string>();

  let currentSeriesSlug = seriesSlug;
  let currentEditionSlug = editionSlug;
  let hops = 0;

  for (let i = 0; i < maxHops; i += 1) {
    const key = `${currentSeriesSlug}/${currentEditionSlug}`;
    if (visited.has(key)) {
      return null;
    }
    visited.add(key);

    const next = await db.query.eventSlugRedirects.findFirst({
      where: and(
        eq(eventSlugRedirects.fromSeriesSlug, currentSeriesSlug),
        eq(eventSlugRedirects.fromEditionSlug, currentEditionSlug),
      ),
    });

    if (!next) {
      return hops > 0
        ? { seriesSlug: currentSeriesSlug, editionSlug: currentEditionSlug, hops }
        : null;
    }

    currentSeriesSlug = next.toSeriesSlug;
    currentEditionSlug = next.toEditionSlug;
    hops += 1;
  }

  return hops > 0 ? { seriesSlug: currentSeriesSlug, editionSlug: currentEditionSlug, hops } : null;
}
