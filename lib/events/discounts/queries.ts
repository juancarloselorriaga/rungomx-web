import { and, desc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';

import { db } from '@/db';
import { discountCodes, discountRedemptions, registrations } from '@/db/schema';
import { safeCacheLife, safeCacheTag } from '@/lib/next-cache';
import { eventEditionCouponsTag } from '../cache-tags';
import type { DiscountCodeData } from './actions';

/**
 * Get all discount codes for an event edition with redemption counts.
 */
export async function getDiscountCodesForEdition(editionId: string): Promise<DiscountCodeData[]> {
  'use cache: remote';
  safeCacheTag(eventEditionCouponsTag(editionId));
  safeCacheLife({ expire: 300 });

  const codes = await db.query.discountCodes.findMany({
    where: and(eq(discountCodes.editionId, editionId), isNull(discountCodes.deletedAt)),
    orderBy: [desc(discountCodes.createdAt)],
  });

  if (codes.length === 0) return [];

  const now = new Date();

  // Get redemption counts for all codes
  const redemptionCounts = await db
    .select({
      discountCodeId: discountRedemptions.discountCodeId,
      count: sql<number>`count(*)::int`,
    })
    .from(discountRedemptions)
    .innerJoin(registrations, eq(discountRedemptions.registrationId, registrations.id))
    .where(
      and(
        sql`${discountRedemptions.discountCodeId} IN (${sql.join(
          codes.map((c) => sql`${c.id}`),
          sql`, `,
        )})`,
        isNull(registrations.deletedAt),
        or(
          eq(registrations.status, 'confirmed'),
          and(
            inArray(registrations.status, ['started', 'submitted', 'payment_pending']),
            gt(registrations.expiresAt, now),
          ),
        ),
      ),
    )
    .groupBy(discountRedemptions.discountCodeId);

  const countMap = new Map(redemptionCounts.map((r) => [r.discountCodeId, r.count]));

  return codes.map((code) => ({
    id: code.id,
    editionId: code.editionId,
    code: code.code,
    name: code.name,
    percentOff: code.percentOff,
    maxRedemptions: code.maxRedemptions,
    currentRedemptions: countMap.get(code.id) || 0,
    startsAt: code.startsAt,
    endsAt: code.endsAt,
    isActive: code.isActive,
  }));
}

/**
 * Get a single discount code by ID with its redemption count.
 */
export async function getDiscountCodeById(discountCodeId: string): Promise<DiscountCodeData | null> {
  const code = await db.query.discountCodes.findFirst({
    where: and(eq(discountCodes.id, discountCodeId), isNull(discountCodes.deletedAt)),
  });

  if (!code) return null;

  const now = new Date();

  const redemptionCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(discountRedemptions)
    .innerJoin(registrations, eq(discountRedemptions.registrationId, registrations.id))
    .where(
      and(
        eq(discountRedemptions.discountCodeId, discountCodeId),
        isNull(registrations.deletedAt),
        or(
          eq(registrations.status, 'confirmed'),
          and(
            inArray(registrations.status, ['started', 'submitted', 'payment_pending']),
            gt(registrations.expiresAt, now),
          ),
        ),
      ),
    );

  return {
    id: code.id,
    editionId: code.editionId,
    code: code.code,
    name: code.name,
    percentOff: code.percentOff,
    maxRedemptions: code.maxRedemptions,
    currentRedemptions: redemptionCount[0].count,
    startsAt: code.startsAt,
    endsAt: code.endsAt,
    isActive: code.isActive,
  };
}

/**
 * Get the discount applied to a registration.
 */
export async function getDiscountForRegistration(registrationId: string) {
  const redemption = await db.query.discountRedemptions.findFirst({
    where: eq(discountRedemptions.registrationId, registrationId),
    with: { discountCode: true },
  });

  if (!redemption) return null;

  return {
    id: redemption.id,
    registrationId: redemption.registrationId,
    discountAmountCents: redemption.discountAmountCents,
    redeemedAt: redemption.redeemedAt,
    discountCode: {
      id: redemption.discountCode.id,
      code: redemption.discountCode.code,
      name: redemption.discountCode.name,
      percentOff: redemption.discountCode.percentOff,
    },
  };
}

/**
 * Get discount code redemption history.
 */
export async function getDiscountCodeRedemptions(discountCodeId: string) {
  const redemptions = await db.query.discountRedemptions.findMany({
    where: eq(discountRedemptions.discountCodeId, discountCodeId),
    orderBy: [desc(discountRedemptions.redeemedAt)],
    with: {
      registration: {
        with: {
          buyer: {
            columns: { id: true, name: true, email: true },
          },
        },
      },
    },
  });

  return redemptions.map((r) => ({
    id: r.id,
    discountAmountCents: r.discountAmountCents,
    redeemedAt: r.redeemedAt,
    registration: {
      id: r.registration.id,
      buyerName: r.registration.buyer?.name ?? 'Unclaimed',
      buyerEmail: r.registration.buyer?.email ?? '',
    },
  }));
}
