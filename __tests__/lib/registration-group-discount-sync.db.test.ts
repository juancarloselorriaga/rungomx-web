/**
 * Database integration tests for registration group discount syncing.
 *
 * Goal: a registration that started before the group qualifies should still
 * receive the discount once the group reaches the verified-member threshold.
 */
import * as schema from '@/db/schema';
import { startRegistrationForUser } from '@/lib/events/start-registration';
import { syncRegistrationGroupDiscountForRegistration } from '@/lib/events/registration-groups/sync-registration-discount';
import { cleanDatabase, getTestDb } from '@/tests/helpers/db';
import { createTestUser } from '@/tests/helpers/fixtures';
import { eq } from 'drizzle-orm';

async function cleanupEvents(db: ReturnType<typeof getTestDb>) {
  await db.delete(schema.auditLogs);
  await db.delete(schema.addOnSelections);
  await db.delete(schema.discountRedemptions);
  await db.delete(schema.discountCodes);
  await db.delete(schema.groupDiscountRules);
  await db.delete(schema.registrationGroupMembers);
  await db.delete(schema.registrationGroups);
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

describe('registration group discount sync - Database Integration', () => {
  const db = getTestDb();

  beforeEach(async () => {
    await cleanupEvents(db);
    await cleanDatabase(db);
  });

  afterAll(async () => {
    await cleanupEvents(db);
    await cleanDatabase(db);
  });

  it('applies the group discount once enough members are email-verified', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const publicCode = `PUB-${suffix.replace(/[^0-9]/g, '').slice(0, 15)}`;
    const now = new Date();

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
        registrationOpensAt: new Date(now.getTime() - 60_000),
        registrationClosesAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      })
      .returning({ id: schema.eventEditions.id });

    const [distance] = await db
      .insert(schema.eventDistances)
      .values({
        editionId: edition.id,
        label: '10K',
        capacity: 100,
      })
      .returning({ id: schema.eventDistances.id });

    await db.insert(schema.pricingTiers).values({
      distanceId: distance.id,
      label: 'Standard',
      priceCents: 10_000,
      currency: 'MXN',
      sortOrder: 0,
    });

    const userA = await createTestUser(db, {
      email: `user-a-${suffix}@example.com`,
      emailVerified: true,
    });
    const userB = await createTestUser(db, {
      email: `user-b-${suffix}@example.com`,
      emailVerified: false,
    });

    const [group] = await db
      .insert(schema.registrationGroups)
      .values({
        editionId: edition.id,
        distanceId: distance.id,
        createdByUserId: userA.id,
        name: `Group ${suffix}`,
        tokenHash: `hash-${suffix}`,
        tokenPrefix: 'TEST',
        maxMembers: 10,
        isActive: true,
      })
      .returning({ id: schema.registrationGroups.id });

    await db.insert(schema.registrationGroupMembers).values([
      { groupId: group.id, userId: userA.id, joinedAt: now, leftAt: null },
      { groupId: group.id, userId: userB.id, joinedAt: now, leftAt: null },
    ]);

    await db.insert(schema.groupDiscountRules).values({
      editionId: edition.id,
      minParticipants: 2,
      percentOff: 10,
      isActive: true,
    });

    const started = await startRegistrationForUser(userA.id, distance.id, {
      now,
      registrationGroupId: group.id,
    });

    // Only one email-verified member at start: no discount.
    expect(started.groupDiscountPercentOff).toBeNull();
    expect(started.groupDiscountAmountCents).toBeNull();
    expect(started.totalCents).toBe(10_500); // 10,000 + 5% fee

    await db.update(schema.users).set({ emailVerified: true }).where(eq(schema.users.id, userB.id));

    const synced = await syncRegistrationGroupDiscountForRegistration({
      registrationId: started.id,
      now,
    });

    expect(synced).toEqual(
      expect.objectContaining({
        id: started.id,
        groupDiscountPercentOff: 10,
        groupDiscountAmountCents: 1_000,
        totalCents: 9_500,
      }),
    );
  });
});
