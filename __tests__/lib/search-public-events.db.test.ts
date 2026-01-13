/**
 * Database integration tests for searchPublicEvents
 */
import * as schema from '@/db/schema';
import { searchPublicEvents } from '@/lib/events/queries';
import { cleanDatabase, getTestDb } from '@/tests/helpers/db';

const FUTURE_OFFSET_MS = 7 * 24 * 60 * 60 * 1000;

async function cleanupEvents(db: ReturnType<typeof getTestDb>) {
  await db.delete(schema.pricingTiers);
  await db.delete(schema.eventDistances);
  await db.delete(schema.eventEditions);
  await db.delete(schema.eventSeries);
  await db.delete(schema.organizations);
}

describe('searchPublicEvents - Database Integration', () => {
  const db = getTestDb();
  let seriesName = '';

  beforeEach(async () => {
    await cleanDatabase(db);
    await cleanupEvents(db);

    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    seriesName = `Automated Test Trail Run ${suffix}`;

    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: `Test Org ${suffix}`,
        slug: `test-org-${suffix}`,
      })
      .returning({ id: schema.organizations.id });

    const [series] = await db
      .insert(schema.eventSeries)
      .values({
        organizationId: organization.id,
        slug: `series-${suffix}`,
        name: seriesName,
        sportType: 'trail_running',
      })
      .returning({ id: schema.eventSeries.id });

    await db.insert(schema.eventEditions).values({
      seriesId: series.id,
      editionLabel: '2026',
      publicCode: `T${Math.random().toString(36).slice(2, 10)}`,
      slug: `edition-${suffix}`,
      visibility: 'published',
      startsAt: new Date(Date.now() + FUTURE_OFFSET_MS),
    });
  });

  afterAll(async () => {
    await cleanupEvents(db);
    await cleanDatabase(db);
  });

  it('returns the expected event for a typo query', async () => {
    const result = await searchPublicEvents({
      q: 'traill',
      page: 1,
      limit: 10,
    });

    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.seriesName).toBe(seriesName);
  });

  it('ignores queries shorter than 3 characters', async () => {
    const result = await searchPublicEvents({
      q: 'ma',
      page: 1,
      limit: 10,
    });

    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.seriesName).toBe(seriesName);
  });
});
