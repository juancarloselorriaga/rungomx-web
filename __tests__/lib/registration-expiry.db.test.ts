/**
 * Database integration tests for registration expiry and spots remaining.
 */
import * as schema from '@/db/schema';
import { getPublicEventBySlug } from '@/lib/events/queries';
import { cleanDatabase, getTestDb } from '@/tests/helpers/db';

jest.setTimeout(60_000);

async function cleanupEvents(db: ReturnType<typeof getTestDb>) {
  await db.delete(schema.waiverAcceptances);
  await db.delete(schema.registrants);
  await db.delete(schema.registrations);
  await db.delete(schema.pricingTiers);
  await db.delete(schema.eventDistances);
  await db.delete(schema.eventEditions);
  await db.delete(schema.eventSeries);
  await db.delete(schema.organizations);
}

describe('registration expiry - Database Integration', () => {
  const db = getTestDb();
  let seriesSlug = '';
  let editionSlug = '';
  let distanceId = '';
  let editionId = '';
  let userId = '';

  beforeEach(async () => {
    await cleanupEvents(db);
    await cleanDatabase(db);

    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    seriesSlug = `series-${suffix}`;
    editionSlug = `edition-${suffix}`;

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

    const [edition] = await db
      .insert(schema.eventEditions)
      .values({
        seriesId: series.id,
        editionLabel: '2026',
        publicCode: `T${Math.random().toString(36).slice(2, 10)}`,
        slug: editionSlug,
        visibility: 'published',
      })
      .returning({ id: schema.eventEditions.id });

    editionId = edition.id;

    const [distance] = await db
      .insert(schema.eventDistances)
      .values({
        editionId: edition.id,
        label: '10K',
        capacity: 1,
      })
      .returning({ id: schema.eventDistances.id });

    distanceId = distance.id;

    await db.insert(schema.pricingTiers).values({
      distanceId,
      label: 'Early',
      priceCents: 5000,
      currency: 'MXN',
    });

    const [user] = await db
      .insert(schema.users)
      .values({
        name: `Test User ${suffix}`,
        email: `test-${suffix}@example.com`,
      })
      .returning({ id: schema.users.id });

    userId = user.id;
  });

  afterAll(async () => {
    await cleanupEvents(db);
    await cleanDatabase(db);
  });

  it('ignores expired holds when computing spots remaining', async () => {
    await db.insert(schema.registrations).values({
      editionId,
      distanceId,
      buyerUserId: userId,
      status: 'started',
      expiresAt: new Date(Date.now() - 60 * 1000),
    });

    const before = await getPublicEventBySlug(seriesSlug, editionSlug);

    expect(before).not.toBeNull();
    expect(before?.distances[0]?.spotsRemaining).toBe(1);

    await db.insert(schema.registrations).values({
      editionId,
      distanceId,
      buyerUserId: userId,
      status: 'started',
      expiresAt: new Date(Date.now() + 60 * 1000),
    });

    const after = await getPublicEventBySlug(seriesSlug, editionSlug);

    expect(after).not.toBeNull();
    expect(after?.distances[0]?.spotsRemaining).toBe(0);
  });

  it('treats confirmed registrations as reserved even with expiresAt null', async () => {
    await db.insert(schema.registrations).values({
      editionId,
      distanceId,
      buyerUserId: userId,
      status: 'confirmed',
      expiresAt: null,
    });

    const result = await getPublicEventBySlug(seriesSlug, editionSlug);

    expect(result).not.toBeNull();
    expect(result?.distances[0]?.spotsRemaining).toBe(0);
  });
});
