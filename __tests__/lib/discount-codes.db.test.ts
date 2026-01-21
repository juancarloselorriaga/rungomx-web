import { db } from '@/db';
import {
  discountCodes,
  discountRedemptions,
  eventDistances,
  eventEditions,
  eventSeries,
  organizations,
  pricingTiers,
  registrations,
  users,
} from '@/db/schema';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { randomUUID } from 'crypto';

import { getDiscountCodesForEdition } from '@/lib/events/discounts/queries';

describe('discount codes (database)', () => {
  let testOrgId: string;
  let testSeriesId: string;
  let testEditionId: string;
  let testDistanceId: string;
  const createdDiscountCodeIds: string[] = [];
  const createdRegistrationIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    // Create test organization
    const [org] = await db
      .insert(organizations)
      .values({
        id: randomUUID(),
        name: `Test Org ${Date.now()}`,
        slug: `test-org-${Date.now()}`,
      })
      .returning();
    testOrgId = org.id;

    // Create test event series
    const [series] = await db
      .insert(eventSeries)
      .values({
        id: randomUUID(),
        name: `Test Series ${Date.now()}`,
        slug: `test-series-${Date.now()}`,
        sportType: 'trail_running',
        status: 'active',
        organizationId: testOrgId,
      })
      .returning();
    testSeriesId = series.id;

    // Create test event edition
    const [edition] = await db
      .insert(eventEditions)
      .values({
        id: randomUUID(),
        editionLabel: '2026',
        slug: `edition-${Date.now()}`,
        publicCode: `PUB${Date.now().toString().slice(-8)}`,
        visibility: 'published',
        timezone: 'America/Mexico_City',
        seriesId: testSeriesId,
      })
      .returning();
    testEditionId = edition.id;

    // Create test distance
    const [distance] = await db
      .insert(eventDistances)
      .values({
        id: randomUUID(),
        label: '10K',
        distanceValue: '10',
        distanceUnit: 'km',
        kind: 'distance',
        terrain: 'road',
        editionId: testEditionId,
      })
      .returning();
    testDistanceId = distance.id;

    // Create pricing tier
    await db.insert(pricingTiers).values({
      id: randomUUID(),
      label: 'Standard',
      priceCents: 50000,
      currency: 'MXN',
      distanceId: testDistanceId,
    });
  });

  afterAll(async () => {
    // Clean up created discount codes
    for (const id of createdDiscountCodeIds) {
      await db.delete(discountRedemptions).where(eq(discountRedemptions.discountCodeId, id));
      await db.delete(discountCodes).where(eq(discountCodes.id, id));
    }

    if (createdRegistrationIds.length > 0) {
      await db.delete(registrations).where(inArray(registrations.id, createdRegistrationIds));
    }

    if (createdUserIds.length > 0) {
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }

    // Clean up in reverse order of creation
    await db.delete(pricingTiers).where(eq(pricingTiers.distanceId, testDistanceId));
    await db.delete(eventDistances).where(eq(eventDistances.id, testDistanceId));
    await db.delete(eventEditions).where(eq(eventEditions.id, testEditionId));
    await db.delete(eventSeries).where(eq(eventSeries.id, testSeriesId));
    await db.delete(organizations).where(eq(organizations.id, testOrgId));
  });

  describe('max_redemptions persistence', () => {
    it('should persist max_redemptions when set to a positive integer', async () => {
      const code = `TEST${Date.now()}`;
      const maxRedemptions = 5;

      // Insert discount code with maxRedemptions
      const [created] = await db
        .insert(discountCodes)
        .values({
          id: randomUUID(),
          editionId: testEditionId,
          code,
          percentOff: 10,
          maxRedemptions: maxRedemptions ?? null, // Using ?? as in the fix
          isActive: true,
        })
        .returning();

      createdDiscountCodeIds.push(created.id);

      // Verify the value was persisted
      const [fetched] = await db
        .select()
        .from(discountCodes)
        .where(eq(discountCodes.id, created.id));

      expect(fetched.maxRedemptions).toBe(maxRedemptions);
    });

    it('should persist max_redemptions as 1 (minimum valid value)', async () => {
      const code = `MIN${Date.now()}`;
      const maxRedemptions = 1;

      const [created] = await db
        .insert(discountCodes)
        .values({
          id: randomUUID(),
          editionId: testEditionId,
          code,
          percentOff: 10,
          maxRedemptions: maxRedemptions ?? null,
          isActive: true,
        })
        .returning();

      createdDiscountCodeIds.push(created.id);

      const [fetched] = await db
        .select()
        .from(discountCodes)
        .where(eq(discountCodes.id, created.id));

      expect(fetched.maxRedemptions).toBe(1);
    });

    it('should persist max_redemptions as null when not provided', async () => {
      const code = `UNLIMITED${Date.now()}`;
      const maxRedemptions = null;

      const [created] = await db
        .insert(discountCodes)
        .values({
          id: randomUUID(),
          editionId: testEditionId,
          code,
          percentOff: 10,
          maxRedemptions: maxRedemptions ?? null,
          isActive: true,
        })
        .returning();

      createdDiscountCodeIds.push(created.id);

      const [fetched] = await db
        .select()
        .from(discountCodes)
        .where(eq(discountCodes.id, created.id));

      expect(fetched.maxRedemptions).toBeNull();
    });

    it('should persist max_redemptions as null when undefined', async () => {
      const code = `UNDEF${Date.now()}`;
      const maxRedemptions = undefined;

      const [created] = await db
        .insert(discountCodes)
        .values({
          id: randomUUID(),
          editionId: testEditionId,
          code,
          percentOff: 10,
          maxRedemptions: maxRedemptions ?? null,
          isActive: true,
        })
        .returning();

      createdDiscountCodeIds.push(created.id);

      const [fetched] = await db
        .select()
        .from(discountCodes)
        .where(eq(discountCodes.id, created.id));

      expect(fetched.maxRedemptions).toBeNull();
    });
  });

  describe('max_redemptions enforcement', () => {
    it('should allow redemption when count is below max', async () => {
      const code = `ENFORCE${Date.now()}`;
      const maxRedemptions = 2;

      // Create discount code
      const [discountCode] = await db
        .insert(discountCodes)
        .values({
          id: randomUUID(),
          editionId: testEditionId,
          code,
          percentOff: 10,
          maxRedemptions,
          isActive: true,
        })
        .returning();

      createdDiscountCodeIds.push(discountCode.id);

      // Fetch the code and check redemption count
      const [fetched] = await db
        .select()
        .from(discountCodes)
        .where(
          and(
            eq(discountCodes.id, discountCode.id),
            isNull(discountCodes.deletedAt),
          ),
        );

      expect(fetched.maxRedemptions).toBe(maxRedemptions);

      // Simulate checking redemption count (as done in validateDiscountCode)
      const redemptionCount = await db
        .select()
        .from(discountRedemptions)
        .where(eq(discountRedemptions.discountCodeId, discountCode.id));

      const currentCount = redemptionCount.length;
      const canRedeem =
        fetched.maxRedemptions === null || currentCount < fetched.maxRedemptions;

      expect(canRedeem).toBe(true);
    });
  });

  describe('active redemption counting', () => {
    it('should count only confirmed and unexpired holds', async () => {
      const code = `COUNT${Date.now()}`.slice(0, 50);

      const [discountCode] = await db
        .insert(discountCodes)
        .values({
          id: randomUUID(),
          editionId: testEditionId,
          code,
          percentOff: 10,
          maxRedemptions: null,
          isActive: true,
        })
        .returning();

      createdDiscountCodeIds.push(discountCode.id);

      const [user] = await db
        .insert(users)
        .values({
          id: randomUUID(),
          name: 'Test Athlete',
          email: `test-athlete-${Date.now()}@example.com`,
          emailVerified: true,
        })
        .returning();

      createdUserIds.push(user.id);

      const now = new Date();
      const past = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const future = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const registrationRows = await db
        .insert(registrations)
        .values([
          {
            id: randomUUID(),
            editionId: testEditionId,
            distanceId: testDistanceId,
            buyerUserId: user.id,
            status: 'confirmed',
            expiresAt: null,
            basePriceCents: 50000,
            feesCents: 0,
            taxCents: 0,
            totalCents: 45000,
          },
          {
            id: randomUUID(),
            editionId: testEditionId,
            distanceId: testDistanceId,
            buyerUserId: user.id,
            status: 'started',
            expiresAt: past,
            basePriceCents: 50000,
            feesCents: 0,
            taxCents: 0,
            totalCents: 45000,
          },
          {
            id: randomUUID(),
            editionId: testEditionId,
            distanceId: testDistanceId,
            buyerUserId: user.id,
            status: 'submitted',
            expiresAt: future,
            basePriceCents: 50000,
            feesCents: 0,
            taxCents: 0,
            totalCents: 45000,
          },
          {
            id: randomUUID(),
            editionId: testEditionId,
            distanceId: testDistanceId,
            buyerUserId: user.id,
            status: 'payment_pending',
            expiresAt: future,
            basePriceCents: 50000,
            feesCents: 0,
            taxCents: 0,
            totalCents: 45000,
          },
          {
            id: randomUUID(),
            editionId: testEditionId,
            distanceId: testDistanceId,
            buyerUserId: user.id,
            status: 'cancelled',
            expiresAt: null,
            basePriceCents: 50000,
            feesCents: 0,
            taxCents: 0,
            totalCents: 45000,
          },
        ])
        .returning();

      createdRegistrationIds.push(...registrationRows.map((r) => r.id));

      await db.insert(discountRedemptions).values(
        registrationRows.map((r) => ({
          id: randomUUID(),
          registrationId: r.id,
          discountCodeId: discountCode.id,
          discountAmountCents: 5000,
          redeemedAt: now,
        })),
      );

      const codes = await getDiscountCodesForEdition(testEditionId);
      const fetched = codes.find((c) => c.id === discountCode.id);

      expect(fetched?.currentRedemptions).toBe(3);
    });
  });

  describe('soft delete + code reuse', () => {
    it('should allow re-creating the same code after soft delete', async () => {
      const code = `REUSE${Date.now()}`.slice(0, 50);

      const [first] = await db
        .insert(discountCodes)
        .values({
          id: randomUUID(),
          editionId: testEditionId,
          code,
          percentOff: 10,
          maxRedemptions: null,
          isActive: true,
        })
        .returning();

      createdDiscountCodeIds.push(first.id);

      await db
        .update(discountCodes)
        .set({ deletedAt: new Date() })
        .where(eq(discountCodes.id, first.id));

      const [second] = await db
        .insert(discountCodes)
        .values({
          id: randomUUID(),
          editionId: testEditionId,
          code,
          percentOff: 15,
          maxRedemptions: null,
          isActive: true,
        })
        .returning();

      createdDiscountCodeIds.push(second.id);

      expect(second.code).toBe(code);
    });
  });

  describe('one coupon per registration constraint', () => {
    it('should prevent multiple discount redemptions for the same registration', async () => {
      const codeA = `ONEA${Date.now()}`.slice(0, 50);
      const codeB = `ONEB${Date.now()}`.slice(0, 50);

      const [discountCodeA] = await db
        .insert(discountCodes)
        .values({
          id: randomUUID(),
          editionId: testEditionId,
          code: codeA,
          percentOff: 10,
          maxRedemptions: null,
          isActive: true,
        })
        .returning();

      const [discountCodeB] = await db
        .insert(discountCodes)
        .values({
          id: randomUUID(),
          editionId: testEditionId,
          code: codeB,
          percentOff: 10,
          maxRedemptions: null,
          isActive: true,
        })
        .returning();

      createdDiscountCodeIds.push(discountCodeA.id, discountCodeB.id);

      const [user] = await db
        .insert(users)
        .values({
          id: randomUUID(),
          name: 'Test Athlete 2',
          email: `test-athlete2-${Date.now()}@example.com`,
          emailVerified: true,
        })
        .returning();

      createdUserIds.push(user.id);

      const [registration] = await db
        .insert(registrations)
        .values({
          id: randomUUID(),
          editionId: testEditionId,
          distanceId: testDistanceId,
          buyerUserId: user.id,
          status: 'confirmed',
          expiresAt: null,
          basePriceCents: 50000,
          feesCents: 0,
          taxCents: 0,
          totalCents: 45000,
        })
        .returning();

      createdRegistrationIds.push(registration.id);

      const now = new Date();

      await db.insert(discountRedemptions).values({
        id: randomUUID(),
        registrationId: registration.id,
        discountCodeId: discountCodeA.id,
        discountAmountCents: 5000,
        redeemedAt: now,
      });

      await expect(
        db.insert(discountRedemptions).values({
          id: randomUUID(),
          registrationId: registration.id,
          discountCodeId: discountCodeB.id,
          discountAmountCents: 5000,
          redeemedAt: now,
        }),
      ).rejects.toThrow();

      const redemptions = await db
        .select()
        .from(discountRedemptions)
        .where(eq(discountRedemptions.registrationId, registration.id));

      expect(redemptions).toHaveLength(1);
    });
  });
});
