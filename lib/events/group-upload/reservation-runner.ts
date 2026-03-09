import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';
import { headers } from 'next/headers';

import { db } from '@/db';
import {
  eventDistances,
  eventEditions,
  groupDiscountRules,
  groupRegistrationBatchRows,
  groupRegistrationBatches,
  pricingTiers,
  profiles,
  registrationInvites,
  registrations,
  users,
} from '@/db/schema';
import { createAuditLog, getRequestContext } from '@/lib/audit';
import type { AuthContext } from '@/lib/auth/server';
import { reserveHold, ReserveHoldError } from '@/lib/events/registrations/reserve-hold';
import { normalizeEmail, toIsoDateString } from '@/lib/events/shared/identity';
import { BatchAccessError, getBatchForCoordinatorOrThrow } from './access';
import { deriveInviteToken, getTokenPrefix, hashToken } from './tokens';

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string };

function computeInviteExpiresAt(now: Date, inviteHoldHours: number): Date {
  return new Date(now.getTime() + inviteHoldHours * 60 * 60 * 1000);
}

export async function reserveInvitesForBatchWorkflow(params: {
  authContext: AuthContext;
  batchId: string;
  uploadToken: string;
  locale: string;
  limit: number;
  inviteHoldHours: number;
}): Promise<
  ActionResult<{
    processed: number;
    succeeded: number;
    failed: number;
    remaining: number;
    groupDiscountPercentOff: number | null;
  }>
> {
  const { authContext, batchId, uploadToken, locale, limit, inviteHoldHours } = params;

  try {
    const access = await getBatchForCoordinatorOrThrow({
      batchId,
      uploadToken,
      authContext,
      requireActiveLink: false,
    });

    if (access.batch.status === 'uploaded') {
      return {
        ok: false,
        error: 'Upload a roster file before reserving invites',
        code: 'BATCH_NOT_UPLOADED',
      };
    }

    if (!access.batch.distanceId) {
      return { ok: false, error: 'Batch distance not set', code: 'INVALID_BATCH' };
    }

    const edition = await db.query.eventEditions.findFirst({
      where: eq(eventEditions.id, access.batch.editionId),
      with: { series: true },
    });

    if (!edition?.series) {
      return { ok: false, error: 'Event edition not found', code: 'NOT_FOUND' };
    }

    const distance = await db.query.eventDistances.findFirst({
      where: and(eq(eventDistances.id, access.batch.distanceId), isNull(eventDistances.deletedAt)),
      with: {
        pricingTiers: {
          where: isNull(pricingTiers.deletedAt),
        },
      },
    });

    if (!distance) {
      return { ok: false, error: 'Distance not found', code: 'NOT_FOUND' };
    }

    const now = new Date();

    const activeTier =
      distance.pricingTiers
        .filter((tier) => {
          if (tier.startsAt && now < tier.startsAt) return false;
          if (tier.endsAt && now > tier.endsAt) return false;
          return true;
        })
        .sort((a, b) => a.sortOrder - b.sortOrder)[0] ?? null;

    const basePriceCents = activeTier?.priceCents ?? 0;
    const feesCents = Math.round(basePriceCents * 0.05);
    const totalCents = basePriceCents + feesCents;

    const inviteLocale = edition.primaryLocale || edition.series.primaryLocale || locale;

    let maxInvitesRemaining: number | null = null;
    if (access.uploadLink.maxInvites !== null) {
      const [{ count: inviteCount }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(registrationInvites)
        .innerJoin(registrations, eq(registrationInvites.registrationId, registrations.id))
        .where(
          and(
            eq(registrationInvites.uploadLinkId, access.uploadLink.id),
            eq(registrationInvites.isCurrent, true),
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

      const maxInvites = access.uploadLink.maxInvites ?? 0;
      maxInvitesRemaining = Math.max(maxInvites - (inviteCount ?? 0), 0);
    }

    const rowsToProcess = await db.query.groupRegistrationBatchRows.findMany({
      where: and(
        eq(groupRegistrationBatchRows.batchId, access.batch.id),
        isNull(groupRegistrationBatchRows.createdRegistrationId),
      ),
      orderBy: (table) => [asc(table.rowIndex)],
    });

    let inviteLimitErrorCount = 0;
    let eligibleRows = rowsToProcess.filter((row) => (row.validationErrorsJson ?? []).length === 0);
    if (maxInvitesRemaining !== null) {
      const overflowRows =
        maxInvitesRemaining <= 0 ? eligibleRows : eligibleRows.slice(maxInvitesRemaining);

      if (overflowRows.length > 0) {
        inviteLimitErrorCount = overflowRows.length;
        await db
          .update(groupRegistrationBatchRows)
          .set({ validationErrorsJson: ['INVITE_LIMIT_REACHED'] })
          .where(inArray(groupRegistrationBatchRows.id, overflowRows.map((row) => row.id)));
      }

      eligibleRows = maxInvitesRemaining <= 0 ? [] : eligibleRows.slice(0, maxInvitesRemaining);
    }
    const targetRows = eligibleRows.slice(0, limit);

    const emails = Array.from(
      new Set(
        targetRows
          .map((row) =>
            typeof row.rawJson.emailNormalized === 'string'
              ? row.rawJson.emailNormalized
              : normalizeEmail(String(row.rawJson.email ?? '')),
          )
          .filter(Boolean),
      ),
    );

    const usersByEmail = emails.length
      ? await db
          .select({
            userId: users.id,
            email: users.email,
            dateOfBirth: profiles.dateOfBirth,
          })
          .from(users)
          .leftJoin(profiles, eq(profiles.userId, users.id))
          .where(and(inArray(users.email, emails), isNull(users.deletedAt)))
      : [];

    const userByEmail = new Map(usersByEmail.map((u) => [u.email.toLowerCase(), u]));

    let succeeded = 0;
    let failed = inviteLimitErrorCount;

    for (const row of targetRows) {
      const raw = row.rawJson as Record<string, unknown>;
      const emailNormalized =
        typeof raw.emailNormalized === 'string'
          ? raw.emailNormalized
          : normalizeEmail(String(raw.email ?? ''));
      const dateOfBirth = typeof raw.dateOfBirth === 'string' ? raw.dateOfBirth : null;

      if (!emailNormalized || !dateOfBirth) {
        failed += 1;
        await db
          .update(groupRegistrationBatchRows)
          .set({ validationErrorsJson: ['INVALID_ROW'] })
          .where(eq(groupRegistrationBatchRows.id, row.id));
        continue;
      }

      const dateOfBirthDate = new Date(`${dateOfBirth}T00:00:00.000Z`);

      const matchedUser = userByEmail.get(emailNormalized);
      if (matchedUser?.dateOfBirth) {
        const matchDob = toIsoDateString(matchedUser.dateOfBirth);
        if (matchDob && matchDob !== dateOfBirth) {
          failed += 1;
          await db
            .update(groupRegistrationBatchRows)
            .set({ validationErrorsJson: ['DOB_MISMATCH'] })
            .where(eq(groupRegistrationBatchRows.id, row.id));
          continue;
        }
      }

      try {
        await db.transaction(async (tx) => {
          const existingInvite = await tx.query.registrationInvites.findFirst({
            where: and(
              eq(registrationInvites.editionId, edition.id),
              eq(registrationInvites.emailNormalized, emailNormalized),
              eq(registrationInvites.isCurrent, true),
              inArray(registrationInvites.status, ['draft', 'sent']),
            ),
          });

          if (existingInvite) {
            await tx
              .update(groupRegistrationBatchRows)
              .set({ validationErrorsJson: ['EXISTING_ACTIVE_INVITE'] })
              .where(eq(groupRegistrationBatchRows.id, row.id));
            failed += 1;
            return;
          }

          if (matchedUser?.userId) {
            const existingRegistration = await tx.query.registrations.findFirst({
              where: and(
                eq(registrations.buyerUserId, matchedUser.userId),
                eq(registrations.editionId, edition.id),
                or(
                  eq(registrations.status, 'confirmed'),
                  and(
                    or(
                      eq(registrations.status, 'started'),
                      eq(registrations.status, 'submitted'),
                      eq(registrations.status, 'payment_pending'),
                    ),
                    gt(registrations.expiresAt, now),
                  ),
                ),
                isNull(registrations.deletedAt),
              ),
            });

            if (existingRegistration) {
              await tx
                .update(groupRegistrationBatchRows)
                .set({ validationErrorsJson: ['ALREADY_REGISTERED'] })
                .where(eq(groupRegistrationBatchRows.id, row.id));
              failed += 1;
              return;
            }
          }

          const registrantSnapshot = {
            firstName: typeof raw.firstName === 'string' ? raw.firstName : undefined,
            lastName: typeof raw.lastName === 'string' ? raw.lastName : undefined,
            email: typeof raw.email === 'string' ? raw.email : undefined,
            dateOfBirth,
            phone: typeof raw.phone === 'string' ? raw.phone : undefined,
            gender: typeof raw.gender === 'string' ? raw.gender : undefined,
            city: typeof raw.city === 'string' ? raw.city : undefined,
            state: typeof raw.state === 'string' ? raw.state : undefined,
            country: typeof raw.country === 'string' ? raw.country : undefined,
            emergencyContactName:
              typeof raw.emergencyContactName === 'string' ? raw.emergencyContactName : undefined,
            emergencyContactPhone:
              typeof raw.emergencyContactPhone === 'string'
                ? raw.emergencyContactPhone
                : undefined,
          };

          let createdRegistration;
          try {
            createdRegistration = await reserveHold({
              tx,
              editionId: edition.id,
              distanceId: distance.id,
              capacityScope: distance.capacityScope as 'shared_pool' | 'per_distance',
              editionSharedCapacity: edition.sharedCapacity ?? null,
              distanceCapacity: distance.capacity ?? null,
              buyerUserId: null,
              status: 'started',
              expiresAt: computeInviteExpiresAt(now, inviteHoldHours),
              paymentResponsibility: access.batch.paymentResponsibility,
              pricing: {
                basePriceCents,
                feesCents,
                taxCents: 0,
                totalCents,
              },
              registrantSnapshot,
              registrantGenderIdentity:
                typeof raw.genderIdentity === 'string' ? raw.genderIdentity : null,
              registrantUserId: null,
              now,
            });
          } catch (error) {
            if (error instanceof ReserveHoldError) {
              await tx
                .update(groupRegistrationBatchRows)
                .set({ validationErrorsJson: ['SOLD_OUT'] })
                .where(eq(groupRegistrationBatchRows.id, row.id));
              failed += 1;
              return;
            }
            throw error;
          }

          const inviteId = crypto.randomUUID();
          const inviteToken = deriveInviteToken(inviteId);
          const inviteTokenHash = hashToken(inviteToken);

          await tx.insert(registrationInvites).values({
            id: inviteId,
            editionId: edition.id,
            uploadLinkId: access.uploadLink.id,
            batchId: access.batch.id,
            batchRowId: row.id,
            registrationId: createdRegistration.id,
            createdByUserId: authContext.user!.id,
            email: typeof raw.email === 'string' ? raw.email : emailNormalized,
            emailNormalized,
            dateOfBirth: dateOfBirthDate,
            inviteLocale,
            tokenHash: inviteTokenHash,
            tokenPrefix: getTokenPrefix(inviteToken),
            status: 'draft',
            expiresAt:
              createdRegistration.expiresAt ?? computeInviteExpiresAt(now, inviteHoldHours),
          });

          await tx
            .update(groupRegistrationBatchRows)
            .set({ createdRegistrationId: createdRegistration.id })
            .where(eq(groupRegistrationBatchRows.id, row.id));

          succeeded += 1;
        });
      } catch {
        failed += 1;
      }
    }

    const [{ count: remaining }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(groupRegistrationBatchRows)
      .where(
        and(
          eq(groupRegistrationBatchRows.batchId, access.batch.id),
          isNull(groupRegistrationBatchRows.createdRegistrationId),
          sql`jsonb_array_length(${groupRegistrationBatchRows.validationErrorsJson}) = 0`,
        ),
      );

    let groupDiscountPercentOff: number | null = null;
    if ((remaining ?? 0) <= 0) {
      try {
        groupDiscountPercentOff = await db.transaction(async (tx) => {
          const [processedBatch] = await tx
            .update(groupRegistrationBatches)
            .set({ status: 'processed', processedAt: now })
            .where(
              and(
                eq(groupRegistrationBatches.id, access.batch.id),
                ne(groupRegistrationBatches.status, 'processed'),
              ),
            )
            .returning({ id: groupRegistrationBatches.id });

          if (!processedBatch) {
            return null;
          }

          const reservedRows = await tx
            .select({ registrationId: groupRegistrationBatchRows.createdRegistrationId })
            .from(groupRegistrationBatchRows)
            .where(
              and(
                eq(groupRegistrationBatchRows.batchId, access.batch.id),
                isNotNull(groupRegistrationBatchRows.createdRegistrationId),
              ),
            );

          const reservedRegistrationIds = reservedRows
            .map((row) => row.registrationId)
            .filter((id): id is string => typeof id === 'string');

          if (reservedRegistrationIds.length === 0) {
            return null;
          }

          const discountRules = await tx.query.groupDiscountRules.findMany({
            where: and(
              eq(groupDiscountRules.editionId, access.batch.editionId),
              eq(groupDiscountRules.isActive, true),
            ),
            orderBy: (r) => [desc(r.minParticipants)],
          });

          const applicableRule =
            discountRules.find((rule) => reservedRegistrationIds.length >= rule.minParticipants) ??
            null;
          const percentOff = applicableRule?.percentOff ?? null;

          if (!percentOff) {
            return null;
          }

          const registrationsToDiscount = await tx.query.registrations.findMany({
            where: and(
              inArray(registrations.id, reservedRegistrationIds),
              isNull(registrations.deletedAt),
              ne(registrations.status, 'cancelled'),
            ),
            columns: { id: true, basePriceCents: true, totalCents: true },
          });

          for (const registration of registrationsToDiscount) {
            const currentBasePriceCents = registration.basePriceCents ?? 0;
            const discountAmountCents = Math.round((currentBasePriceCents * percentOff) / 100);
            if (discountAmountCents <= 0) continue;

            const totalBefore = registration.totalCents ?? currentBasePriceCents;

            await tx
              .update(registrations)
              .set({
                basePriceCents: Math.max(currentBasePriceCents - discountAmountCents, 0),
                totalCents: Math.max(totalBefore - discountAmountCents, 0),
                updatedAt: now,
              })
              .where(eq(registrations.id, registration.id));
          }

          try {
            const requestContext = await getRequestContext(await headers());
            await createAuditLog(
              {
                organizationId: edition.series.organizationId,
                actorUserId: authContext.user!.id,
                action: 'group_upload_batch.discount_apply',
                entityType: 'group_registration_batch',
                entityId: access.batch.id,
                after: { percentOff, reservedCount: reservedRegistrationIds.length },
                request: requestContext,
              },
              tx,
            );
          } catch (error) {
            console.warn('[group-upload] Failed to create audit log for group discount:', error);
          }

          return percentOff;
        });
      } catch (error) {
        console.error('[group-upload] Failed to apply group discount:', error);
      }
    }

    return {
      ok: true,
      data: {
        processed: targetRows.length + inviteLimitErrorCount,
        succeeded,
        failed,
        remaining: Math.max(remaining ?? 0, 0),
        groupDiscountPercentOff,
      },
    };
  } catch (error) {
    if (error instanceof BatchAccessError) {
      return { ok: false, error: error.message, code: error.code };
    }

    throw error;
  }
}
