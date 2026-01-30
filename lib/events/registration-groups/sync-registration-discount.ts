import { and, eq, isNull, sql } from 'drizzle-orm';

import { db } from '@/db';
import { addOnSelections, discountRedemptions, registrations } from '@/db/schema';
import { resolveGroupDiscount } from '@/lib/events/registration-groups/discount';

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbClient = typeof db | DbTransaction;

export type SyncRegistrationGroupDiscountResult = {
  id: string;
  groupDiscountPercentOff: number | null;
  groupDiscountAmountCents: number | null;
  totalCents: number | null;
};

async function syncInTx(params: {
  tx: DbClient;
  registrationId: string;
  now: Date;
}): Promise<SyncRegistrationGroupDiscountResult | null> {
  const { tx, registrationId, now } = params;

  await tx.execute(sql`SELECT id FROM ${registrations} WHERE id = ${registrationId} FOR UPDATE`);

  const registration = await tx.query.registrations.findFirst({
    where: and(eq(registrations.id, registrationId), isNull(registrations.deletedAt)),
    columns: {
      id: true,
      status: true,
      editionId: true,
      basePriceCents: true,
      feesCents: true,
      taxCents: true,
      totalCents: true,
      registrationGroupId: true,
      groupDiscountPercentOff: true,
      groupDiscountAmountCents: true,
    },
  });

  if (!registration) {
    return null;
  }

  if (registration.status !== 'started' && registration.status !== 'submitted') {
    return {
      id: registration.id,
      groupDiscountPercentOff: registration.groupDiscountPercentOff,
      groupDiscountAmountCents: registration.groupDiscountAmountCents,
      totalCents: registration.totalCents,
    };
  }

  const basePriceCents = registration.basePriceCents ?? 0;
  const feesCents = registration.feesCents ?? 0;
  const taxCents = registration.taxCents ?? 0;

  const redemption = await tx.query.discountRedemptions.findFirst({
    where: eq(discountRedemptions.registrationId, registrationId),
    columns: { discountAmountCents: true },
  });
  const discountAmountCents = redemption?.discountAmountCents ?? 0;

  const [{ total: addOnTotalCents } = { total: 0 }] = await tx
    .select({
      total: sql<number>`coalesce(sum(${addOnSelections.lineTotalCents}), 0)::int`,
    })
    .from(addOnSelections)
    .where(
      and(eq(addOnSelections.registrationId, registrationId), isNull(addOnSelections.deletedAt)),
    );

  let nextGroupDiscountPercentOff = registration.groupDiscountPercentOff;
  let nextGroupDiscountAmountCents = registration.groupDiscountAmountCents;

  if (nextGroupDiscountPercentOff === null) {
    nextGroupDiscountAmountCents = null;
  }

  if (registration.registrationGroupId && !redemption) {
    const discount = await resolveGroupDiscount({
      groupId: registration.registrationGroupId,
      editionId: registration.editionId,
      tx,
      now,
    });

    if (
      discount &&
      (nextGroupDiscountPercentOff === null || discount.percentOff > nextGroupDiscountPercentOff)
    ) {
      nextGroupDiscountPercentOff = discount.percentOff;
      nextGroupDiscountAmountCents = Math.round((basePriceCents * discount.percentOff) / 100);
    }
  }

  const computedGroupDiscountAmountCents =
    nextGroupDiscountPercentOff === null
      ? 0
      : nextGroupDiscountAmountCents ??
        Math.round((basePriceCents * nextGroupDiscountPercentOff) / 100);

  const persistedGroupDiscountAmountCents =
    nextGroupDiscountPercentOff === null ? null : computedGroupDiscountAmountCents;

  const nextTotalCents = Math.max(
    0,
    basePriceCents +
      feesCents +
      taxCents +
      addOnTotalCents -
      discountAmountCents -
      computedGroupDiscountAmountCents,
  );

  const hasChanges =
    registration.groupDiscountPercentOff !== nextGroupDiscountPercentOff ||
    registration.groupDiscountAmountCents !== persistedGroupDiscountAmountCents ||
    registration.totalCents !== nextTotalCents;

  if (!hasChanges) {
    return {
      id: registration.id,
      groupDiscountPercentOff: registration.groupDiscountPercentOff,
      groupDiscountAmountCents: registration.groupDiscountAmountCents,
      totalCents: registration.totalCents,
    };
  }

  const [updated] = await tx
    .update(registrations)
    .set({
      groupDiscountPercentOff: nextGroupDiscountPercentOff,
      groupDiscountAmountCents: persistedGroupDiscountAmountCents,
      totalCents: nextTotalCents,
      updatedAt: now,
    })
    .where(eq(registrations.id, registrationId))
    .returning({
      id: registrations.id,
      groupDiscountPercentOff: registrations.groupDiscountPercentOff,
      groupDiscountAmountCents: registrations.groupDiscountAmountCents,
      totalCents: registrations.totalCents,
    });

  return updated ?? null;
}

export async function syncRegistrationGroupDiscountForRegistration(params: {
  registrationId: string;
  now?: Date;
  tx?: DbClient;
}): Promise<SyncRegistrationGroupDiscountResult | null> {
  const now = params.now ?? new Date();

  if (params.tx) {
    return syncInTx({ tx: params.tx, registrationId: params.registrationId, now });
  }

  return db.transaction((tx) =>
    syncInTx({
      tx,
      registrationId: params.registrationId,
      now,
    }),
  );
}

