import * as schema from '@/db/schema';
import { resolveEventSlugRedirect } from '@/lib/events/slug-redirects';
import { getTestDb } from '@/tests/helpers/db';

async function cleanup(db: ReturnType<typeof getTestDb>) {
  await db.delete(schema.eventSlugRedirects);
}

describe('resolveEventSlugRedirect - Database Integration', () => {
  const db = getTestDb();

  beforeEach(async () => {
    await cleanup(db);
  });

  afterAll(async () => {
    await cleanup(db);
  });

  it('resolves a redirect chain to the final target', async () => {
    await db.insert(schema.eventSlugRedirects).values([
      {
        fromSeriesSlug: 'series-a',
        fromEditionSlug: 'old',
        toSeriesSlug: 'series-a',
        toEditionSlug: 'mid',
        reason: 'test',
      },
      {
        fromSeriesSlug: 'series-a',
        fromEditionSlug: 'mid',
        toSeriesSlug: 'series-a',
        toEditionSlug: 'new',
        reason: 'test',
      },
    ]);

    const result = await resolveEventSlugRedirect('series-a', 'old');
    expect(result).toEqual({ seriesSlug: 'series-a', editionSlug: 'new', hops: 2 });
  });

  it('returns null when no redirect exists', async () => {
    const result = await resolveEventSlugRedirect('series-a', 'missing');
    expect(result).toBeNull();
  });

  it('returns null when a loop is detected', async () => {
    await db.insert(schema.eventSlugRedirects).values([
      {
        fromSeriesSlug: 'series-a',
        fromEditionSlug: 'old',
        toSeriesSlug: 'series-a',
        toEditionSlug: 'mid',
        reason: 'test',
      },
      {
        fromSeriesSlug: 'series-a',
        fromEditionSlug: 'mid',
        toSeriesSlug: 'series-a',
        toEditionSlug: 'old',
        reason: 'test',
      },
    ]);

    const result = await resolveEventSlugRedirect('series-a', 'old');
    expect(result).toBeNull();
  });
});

