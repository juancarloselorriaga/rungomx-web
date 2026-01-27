import * as schema from '@/db/schema';
import { getRegistrationsForEdition } from '@/lib/events/registrations/queries';
import { cleanDatabase, getTestDb } from '@/tests/helpers/db';

async function cleanupData(db: ReturnType<typeof getTestDb>) {
  await db.delete(schema.registrants);
  await db.delete(schema.registrations);
  await db.delete(schema.eventDistances);
  await db.delete(schema.eventEditions);
  await db.delete(schema.eventSeries);
  await db.delete(schema.organizations);
  await db.delete(schema.users);
}

describe('getRegistrationsForEdition - Database Integration', () => {
  const db = getTestDb();

  beforeEach(async () => {
    await cleanupData(db);
    await cleanDatabase(db);
  });

  afterAll(async () => {
    await cleanupData(db);
    await cleanDatabase(db);
  });

  it('includes unclaimed registrations in admin listing', async () => {
    const suffix = `${Date.now() % 1e8}-${Math.floor(Math.random() * 1000)}`;

    const [organization] = await db
      .insert(schema.organizations)
      .values({ name: `Org ${suffix}`, slug: `org-${suffix}` })
      .returning({ id: schema.organizations.id });

    const [series] = await db
      .insert(schema.eventSeries)
      .values({
        organizationId: organization.id,
        slug: `series-${suffix}`,
        name: `Series ${suffix}`,
        sportType: 'trail_running',
      })
      .returning({ id: schema.eventSeries.id });

    const [edition] = await db
      .insert(schema.eventEditions)
      .values({
        seriesId: series.id,
        editionLabel: '2026',
        publicCode: `P-${suffix}`,
        slug: `edition-${suffix}`,
        visibility: 'published',
      })
      .returning({ id: schema.eventEditions.id });

    const [distance] = await db
      .insert(schema.eventDistances)
      .values({ editionId: edition.id, label: '10K' })
      .returning({ id: schema.eventDistances.id });

    const [user] = await db
      .insert(schema.users)
      .values({ email: `buyer-${suffix}@example.com`, name: 'Buyer' })
      .returning({ id: schema.users.id });

    await db.insert(schema.registrations).values({
      editionId: edition.id,
      distanceId: distance.id,
      buyerUserId: user.id,
      status: 'confirmed',
    });

    await db.insert(schema.registrations).values({
      editionId: edition.id,
      distanceId: distance.id,
      buyerUserId: null,
      status: 'started',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      paymentResponsibility: 'self_pay',
    });

    const result = await getRegistrationsForEdition({ editionId: edition.id });

    expect(result.total).toBe(2);
    expect(result.items.some((item) => item.buyer.id === null)).toBe(true);
  });
});
