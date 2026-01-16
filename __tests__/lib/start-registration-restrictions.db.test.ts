/**
 * Database integration tests for startRegistration policy restrictions.
 *
 * Policy:
 * - One active registration per event edition per user (no multi-distance by default)
 * - Allow resuming an in-progress hold for the same distance
 * - Allow re-registering after cancellation
 */
import * as schema from '@/db/schema';
import { startRegistrationForUser } from '@/lib/events/start-registration';
import { cleanDatabase, getTestDb } from '@/tests/helpers/db';
import { createTestUser } from '@/tests/helpers/fixtures';
import { eq } from 'drizzle-orm';

async function cleanupEvents(db: ReturnType<typeof getTestDb>) {
  await db.delete(schema.waiverAcceptances);
  await db.delete(schema.registrants);
  await db.delete(schema.registrations);
  await db.delete(schema.waivers);
  await db.delete(schema.pricingTiers);
  await db.delete(schema.eventDistances);
  await db.delete(schema.eventEditions);
  await db.delete(schema.eventSeries);
  await db.delete(schema.organizationMemberships);
  await db.delete(schema.organizations);
  await db.delete(schema.users);
}

describe('startRegistration policy - Database Integration', () => {
  const db = getTestDb();

  beforeEach(async () => {
    await cleanupEvents(db);
    await cleanDatabase(db);
  });

  afterAll(async () => {
    await cleanupEvents(db);
    await cleanDatabase(db);
  });

  async function seedEventWithTwoDistances() {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const publicCode = `PUB-${suffix.replace(/[^0-9]/g, '').slice(0, 15)}`;

    const [organization] = await db
      .insert(schema.organizations)
      .values({ name: `Test Org ${suffix}`, slug: `test-org-${suffix}` })
      .returning({ id: schema.organizations.id });

    const [series] = await db
      .insert(schema.eventSeries)
      .values({
        organizationId: organization.id,
        slug: `series-${suffix}`,
        name: `Test Series ${suffix}`,
        sportType: 'trail_running',
      })
      .returning({ id: schema.eventSeries.id });

    const [edition] = await db
      .insert(schema.eventEditions)
      .values({
        seriesId: series.id,
        editionLabel: '2026',
        publicCode,
        slug: `edition-${suffix}`,
        visibility: 'published',
        registrationOpensAt: new Date(Date.now() - 60_000),
        registrationClosesAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      })
      .returning({ id: schema.eventEditions.id });

    const [distanceA] = await db
      .insert(schema.eventDistances)
      .values({
        editionId: edition.id,
        label: '10K',
        capacity: 100,
      })
      .returning({ id: schema.eventDistances.id });

    const [distanceB] = await db
      .insert(schema.eventDistances)
      .values({
        editionId: edition.id,
        label: '5K',
        capacity: 100,
      })
      .returning({ id: schema.eventDistances.id });

    return { editionId: edition.id, distanceAId: distanceA.id, distanceBId: distanceB.id };
  }

  it('blocks registering for a different distance when an active registration exists in the edition', async () => {
    const { editionId, distanceAId, distanceBId } = await seedEventWithTwoDistances();
    const user = await createTestUser(db, { email: `user-${Date.now()}@example.com` });

    await db.insert(schema.registrations).values({
      editionId,
      distanceId: distanceAId,
      buyerUserId: user.id,
      status: 'confirmed',
    });

    await expect(startRegistrationForUser(user.id, distanceBId)).rejects.toEqual(
      expect.objectContaining({ code: 'ALREADY_REGISTERED' }),
    );
  });

  it('blocks registering again for the same distance when already confirmed', async () => {
    const { editionId, distanceAId } = await seedEventWithTwoDistances();
    const user = await createTestUser(db, { email: `user-${Date.now()}@example.com` });

    await db.insert(schema.registrations).values({
      editionId,
      distanceId: distanceAId,
      buyerUserId: user.id,
      status: 'confirmed',
    });

    await expect(startRegistrationForUser(user.id, distanceAId)).rejects.toEqual(
      expect.objectContaining({ code: 'ALREADY_REGISTERED' }),
    );
  });

  it('allows resuming an in-progress hold for the same distance', async () => {
    const { editionId, distanceAId } = await seedEventWithTwoDistances();
    const user = await createTestUser(db, { email: `user-${Date.now()}@example.com` });
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const [existing] = await db
      .insert(schema.registrations)
      .values({
        editionId,
        distanceId: distanceAId,
        buyerUserId: user.id,
        status: 'started',
        expiresAt,
      })
      .returning({ id: schema.registrations.id });

    const result = await startRegistrationForUser(user.id, distanceAId);
    expect(result.id).toBe(existing.id);
  });

  it('allows registering again after cancellation', async () => {
    const { editionId, distanceAId } = await seedEventWithTwoDistances();
    const user = await createTestUser(db, { email: `user-${Date.now()}@example.com` });

    await db.insert(schema.registrations).values({
      editionId,
      distanceId: distanceAId,
      buyerUserId: user.id,
      status: 'cancelled',
    });

    const result = await startRegistrationForUser(user.id, distanceAId);
    expect(result).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        status: 'started',
      }),
    );
  });

  it('throws a typed error for sold out distances', async () => {
    const { editionId, distanceAId } = await seedEventWithTwoDistances();
    const now = new Date();
    const user = await createTestUser(db, { email: `user-${Date.now()}@example.com` });

    await db
      .update(schema.eventDistances)
      .set({ capacity: 1 })
      .where(eq(schema.eventDistances.id, distanceAId));

    // Fill capacity
    await db.insert(schema.registrations).values({
      editionId,
      distanceId: distanceAId,
      buyerUserId: (await createTestUser(db)).id,
      status: 'started',
      expiresAt: new Date(now.getTime() + 60_000),
    });

    await expect(startRegistrationForUser(user.id, distanceAId, { now })).rejects.toEqual(
      expect.objectContaining({ code: 'SOLD_OUT' }),
    );
  });
});
