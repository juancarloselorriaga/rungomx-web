/**
 * Database integration tests for getPublicOtherEditionsForSeries
 */
import * as schema from '@/db/schema';
import { getPublicEventBySlug, getPublicOtherEditionsForSeries } from '@/lib/events/queries';
import { cleanDatabase, getTestDb } from '@/tests/helpers/db';

async function cleanupEvents(db: ReturnType<typeof getTestDb>) {
  await db.delete(schema.auditLogs);
  await db.delete(schema.pricingTiers);
  await db.delete(schema.eventDistances);
  await db.delete(schema.eventEditions);
  await db.delete(schema.eventSeries);
  await db.delete(schema.organizations);
}

describe('getPublicOtherEditionsForSeries - Database Integration', () => {
  const db = getTestDb();

  beforeEach(async () => {
    await cleanDatabase(db);
    await cleanupEvents(db);
  });

  afterAll(async () => {
    await cleanupEvents(db);
    await cleanDatabase(db);
  });

  it('returns other published editions for the series, excluding the current edition', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const seriesSlug = `series-${suffix}`;
    const currentEditionSlug = `edition-current-${suffix}`;

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
        slug: seriesSlug,
        name: `Test Series ${suffix}`,
        sportType: 'trail_running',
      })
      .returning({ id: schema.eventSeries.id });

    // Current edition (published, but should be excluded from "other editions")
    const [currentEdition] = await db
      .insert(schema.eventEditions)
      .values({
        seriesId: series.id,
        editionLabel: '2026',
        publicCode: `T${Math.random().toString(36).slice(2, 10)}`,
        slug: currentEditionSlug,
        visibility: 'published',
        startsAt: new Date('2026-03-15T12:00:00.000Z'),
      })
      .returning({ id: schema.eventEditions.id });

    // Other published edition (should be returned)
    await db.insert(schema.eventEditions).values({
      seriesId: series.id,
      editionLabel: '2025',
      publicCode: `T${Math.random().toString(36).slice(2, 10)}`,
      slug: `edition-2025-${suffix}`,
      visibility: 'published',
      startsAt: new Date('2025-03-15T12:00:00.000Z'),
    });

    // Draft edition (should not be returned)
    await db.insert(schema.eventEditions).values({
      seriesId: series.id,
      editionLabel: '2024',
      publicCode: `T${Math.random().toString(36).slice(2, 10)}`,
      slug: `edition-2024-${suffix}`,
      visibility: 'draft',
      startsAt: new Date('2024-03-15T12:00:00.000Z'),
    });

    const event = await getPublicEventBySlug(seriesSlug, currentEditionSlug);
    expect(event).not.toBeNull();

    const otherEditions = await getPublicOtherEditionsForSeries(series.id, currentEdition.id);

    expect(otherEditions.map((e) => e.editionLabel)).toEqual(['2025']);
  });
});

