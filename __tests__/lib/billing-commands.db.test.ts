import {
  billingEntitlementOverrides,
  billingPendingEntitlementGrants,
  billingPromotionRedemptions,
  billingPromotions,
  billingSubscriptions,
  billingTrialUses,
} from '@/db/schema';
import {
  claimPendingEntitlementGrantsForUser,
  createPendingEntitlementGrant,
  createPromotion,
  redeemPromotionForUser,
  startTrialForUser,
} from '@/lib/billing/commands';
import { cleanDatabase, getTestDb } from '@/tests/helpers/db';
import { createTestUser } from '@/tests/helpers/fixtures';
import { eq, inArray } from 'drizzle-orm';

describe('billing commands (database)', () => {
  const testDb = getTestDb();

  beforeAll(() => {
    process.env.BILLING_HASH_SECRET_V1 = process.env.BILLING_HASH_SECRET_V1 ?? 'test-billing-secret';
  });

  beforeEach(async () => {
    await cleanDatabase(testDb);
  });

  afterAll(async () => {
    await cleanDatabase(testDb);
  });

  it('enforces a single trial per user under concurrency', async () => {
    const user = await createTestUser(testDb, { emailVerified: true });

    const [first, second] = await Promise.all([
      startTrialForUser({ userId: user.id, isInternal: false, emailVerified: true }),
      startTrialForUser({ userId: user.id, isInternal: false, emailVerified: true }),
    ]);

    const successCount = [first, second].filter((result) => result.ok).length;
    expect(successCount).toBe(1);

    const trialUses = await testDb
      .select()
      .from(billingTrialUses)
      .where(eq(billingTrialUses.userId, user.id));

    expect(trialUses).toHaveLength(1);

    const subscriptions = await testDb
      .select()
      .from(billingSubscriptions)
      .where(eq(billingSubscriptions.userId, user.id));

    expect(subscriptions).toHaveLength(1);
  });

  it('deduplicates promo redemption per user under concurrency', async () => {
    const user = await createTestUser(testDb, { emailVerified: true });
    const creator = await createTestUser(testDb, { emailVerified: true });

    const promotion = await createPromotion({
      createdByUserId: creator.id,
      grantDurationDays: 7,
      grantFixedEndsAt: null,
      validFrom: null,
      validTo: null,
      maxRedemptions: 10,
      isActive: true,
      name: 'Test Promo',
      description: null,
    });

    if (!promotion.ok) {
      throw new Error(promotion.error);
    }

    const code = promotion.data.code;

    const [first, second] = await Promise.all([
      redeemPromotionForUser({ userId: user.id, promoCode: code }),
      redeemPromotionForUser({ userId: user.id, promoCode: code }),
    ]);

    const alreadyRedeemed = [first, second].some(
      (result) => result.ok && result.data.alreadyRedeemed,
    );

    expect(alreadyRedeemed).toBe(true);

    const redemptions = await testDb
      .select()
      .from(billingPromotionRedemptions)
      .where(eq(billingPromotionRedemptions.userId, user.id));

    expect(redemptions).toHaveLength(1);

    const overrides = await testDb
      .select()
      .from(billingEntitlementOverrides)
      .where(eq(billingEntitlementOverrides.userId, user.id));

    expect(overrides).toHaveLength(1);
  });

  it('enforces promotion global cap under concurrency', async () => {
    const [userA, userB, creator] = await Promise.all([
      createTestUser(testDb, { emailVerified: true }),
      createTestUser(testDb, { emailVerified: true }),
      createTestUser(testDb, { emailVerified: true }),
    ]);

    const promotion = await createPromotion({
      createdByUserId: creator.id,
      grantDurationDays: 7,
      grantFixedEndsAt: null,
      validFrom: null,
      validTo: null,
      maxRedemptions: 1,
      isActive: true,
      name: 'Cap Promo',
      description: null,
    });

    if (!promotion.ok) {
      throw new Error(promotion.error);
    }

    const code = promotion.data.code;

    const [first, second] = await Promise.all([
      redeemPromotionForUser({ userId: userA.id, promoCode: code }),
      redeemPromotionForUser({ userId: userB.id, promoCode: code }),
    ]);

    const successCount = [first, second].filter((result) => result.ok).length;
    expect(successCount).toBe(1);

    const [promoRow] = await testDb
      .select()
      .from(billingPromotions)
      .where(eq(billingPromotions.id, promotion.data.promotionId));

    expect(promoRow.redemptionCount).toBeLessThanOrEqual(1);

    const redemptionRows = await testDb
      .select()
      .from(billingPromotionRedemptions)
      .where(inArray(billingPromotionRedemptions.userId, [userA.id, userB.id]));

    expect(redemptionRows).toHaveLength(1);
  });

  it('claims pending grants only once under concurrency', async () => {
    const [user, creator] = await Promise.all([
      createTestUser(testDb, { emailVerified: true }),
      createTestUser(testDb, { emailVerified: true }),
    ]);

    const pending = await createPendingEntitlementGrant({
      email: user.email,
      createdByUserId: creator.id,
      grantDurationDays: 5,
      grantFixedEndsAt: null,
      claimValidFrom: null,
      claimValidTo: null,
      isActive: true,
    });

    if (!pending.ok) {
      throw new Error(pending.error);
    }

    const [first, second] = await Promise.all([
      claimPendingEntitlementGrantsForUser({
        userId: user.id,
        email: user.email,
        claimSource: 'manual_claim',
      }),
      claimPendingEntitlementGrantsForUser({
        userId: user.id,
        email: user.email,
        claimSource: 'manual_claim',
      }),
    ]);

    const claimedTotal =
      (first.ok ? first.data.claimedCount : 0) + (second.ok ? second.data.claimedCount : 0);
    const overridesTotal =
      (first.ok ? first.data.overridesCreated : 0) + (second.ok ? second.data.overridesCreated : 0);

    expect(claimedTotal).toBe(1);
    expect(overridesTotal).toBe(1);

    const [grantRow] = await testDb
      .select()
      .from(billingPendingEntitlementGrants)
      .where(eq(billingPendingEntitlementGrants.id, pending.data.pendingGrantId));

    expect(grantRow.claimedAt).not.toBeNull();

    const overrides = await testDb
      .select()
      .from(billingEntitlementOverrides)
      .where(eq(billingEntitlementOverrides.userId, user.id));

    expect(overrides).toHaveLength(1);
  });
});
