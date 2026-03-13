'use server';

import { and, eq, gt, inArray, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';
import { headers } from 'next/headers';

import { db } from '@/db';
import {
  eventDistances,
  eventEditions,
  eventSeries,
  pricingTiers,
  registrationInvites,
  registrations,
  users,
  groupRegistrationBatchRows,
} from '@/db/schema';
import { createAuditLog, getRequestContext } from '@/lib/audit';
import type { AuthContext } from '@/lib/auth/server';
import { sendRegistrationInviteEmail } from '@/lib/events/registration-invite-email';
import { reserveHold, ReserveHoldError } from '@/lib/events/registrations/reserve-hold';
import { normalizeEmail, toIsoDateString } from '@/lib/events/shared/identity';
import { checkRateLimit } from '@/lib/rate-limit';
import { BatchAccessError, getBatchForCoordinatorOrThrow } from './access';
import { deriveInviteToken, getTokenPrefix, hashToken } from './tokens';

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string };

function computeInviteExpiresAt(now: Date, inviteHoldHours: number): Date {
  return new Date(now.getTime() + inviteHoldHours * 60 * 60 * 1000);
}

export async function sendInvitesForBatchWorkflow(params: {
  authContext: AuthContext;
  batchId: string;
  uploadToken: string;
  limit: number;
  inviteSendMaxCount: number;
  inviteSendRateWindowMs: number;
}): Promise<ActionResult<{ sent: number; skipped: number }>> {
  const {
    authContext,
    batchId,
    uploadToken,
    limit,
    inviteSendMaxCount,
    inviteSendRateWindowMs,
  } = params;

  try {
    const access = await getBatchForCoordinatorOrThrow({
      batchId,
      uploadToken,
      authContext,
      requireActiveLink: false,
    });

    if (access.batch.status !== 'processed') {
      return {
        ok: false,
        error: 'Batch must be processed before sending invites',
        code: 'BATCH_NOT_PROCESSED',
      };
    }

    const edition = await db.query.eventEditions.findFirst({
      where: and(eq(eventEditions.id, access.batch.editionId), isNull(eventEditions.deletedAt)),
      with: { series: true },
    });

    if (!edition?.series) {
      return { ok: false, error: 'Event edition not found', code: 'NOT_FOUND' };
    }

    const rateLimit = await checkRateLimit(`${authContext.user!.id}:${access.batch.id}`, 'user', {
      action: 'group_upload_invite_send',
      maxRequests: 1,
      windowMs: inviteSendRateWindowMs,
    });

    if (!rateLimit.allowed) {
      return { ok: false, error: 'Please wait before sending more invites', code: 'RATE_LIMITED' };
    }

    const now = new Date();

    const invites = await db
      .select({
        id: registrationInvites.id,
        email: registrationInvites.email,
        inviteLocale: registrationInvites.inviteLocale,
        expiresAt: registrationInvites.expiresAt,
        sendCount: registrationInvites.sendCount,
        status: registrationInvites.status,
        registrationId: registrationInvites.registrationId,
        batchId: registrationInvites.batchId,
        editionId: registrationInvites.editionId,
        seriesSlug: eventSeries.slug,
        editionSlug: eventEditions.slug,
        seriesName: eventSeries.name,
        editionLabel: eventEditions.editionLabel,
        distanceLabel: eventDistances.label,
        eventStartsAt: eventEditions.startsAt,
        eventTimezone: eventEditions.timezone,
      })
      .from(registrationInvites)
      .innerJoin(registrations, eq(registrationInvites.registrationId, registrations.id))
      .innerJoin(eventEditions, eq(registrationInvites.editionId, eventEditions.id))
      .innerJoin(eventSeries, eq(eventEditions.seriesId, eventSeries.id))
      .innerJoin(eventDistances, eq(registrations.distanceId, eventDistances.id))
      .where(
        and(
          eq(registrationInvites.batchId, access.batch.id),
          eq(registrationInvites.isCurrent, true),
          eq(registrationInvites.status, 'draft'),
          gt(registrationInvites.expiresAt, now),
          ne(registrations.status, 'cancelled'),
          isNull(registrations.deletedAt),
          isNotNull(registrations.expiresAt),
          gt(registrations.expiresAt, now),
        ),
      )
      .limit(limit);

    let sent = 0;
    let skipped = 0;

    for (const invite of invites) {
      if (invite.sendCount >= inviteSendMaxCount) {
        skipped += 1;
        continue;
      }

      const token = deriveInviteToken(invite.id);

      await sendRegistrationInviteEmail({
        inviteId: invite.id,
        email: invite.email,
        locale: invite.inviteLocale,
        seriesSlug: invite.seriesSlug,
        editionSlug: invite.editionSlug,
        eventName: `${invite.seriesName} ${invite.editionLabel}`.trim(),
        distanceLabel: invite.distanceLabel,
        expiresAt: invite.expiresAt,
        timezone: invite.eventTimezone,
        token,
      });

      await db
        .update(registrationInvites)
        .set({
          status: 'sent',
          sendCount: sql`${registrationInvites.sendCount} + 1`,
          lastSentAt: new Date(),
        })
        .where(eq(registrationInvites.id, invite.id));

      sent += 1;
    }

    if (sent > 0) {
      const requestContext = await getRequestContext(await headers());
      const auditResult = await createAuditLog(
        {
          organizationId: edition.series.organizationId,
          actorUserId: authContext.user!.id,
          action: 'group_upload_invites.send',
          entityType: 'group_registration_batch',
          entityId: access.batch.id,
          after: { sentCount: sent },
          request: requestContext,
        },
        db,
      );

      if (!auditResult.ok) {
        return { ok: false, error: 'Failed to create audit log', code: 'AUDIT_FAILED' };
      }
    }

    return { ok: true, data: { sent, skipped } };
  } catch (error) {
    if (error instanceof BatchAccessError) {
      return { ok: false, error: error.message, code: error.code };
    }

    throw error;
  }
}

export async function resendInviteWorkflow(params: {
  authContext: AuthContext;
  uploadToken: string;
  inviteId: string;
  inviteSendMaxCount: number;
  inviteSendRateWindowMs: number;
  inviteResendCooldownMs: number;
}): Promise<ActionResult> {
  const {
    authContext,
    uploadToken,
    inviteId,
    inviteSendMaxCount,
    inviteSendRateWindowMs,
    inviteResendCooldownMs,
  } = params;

  const invite = await db.query.registrationInvites.findFirst({
    where: eq(registrationInvites.id, inviteId),
    with: {
      registration: {
        with: {
          distance: true,
        },
      },
      edition: {
        with: {
          series: true,
        },
      },
    },
  });

  if (!invite) {
    return { ok: false, error: 'Invite not found', code: 'NOT_FOUND' };
  }

  try {
    await getBatchForCoordinatorOrThrow({
      batchId: invite.batchId,
      uploadToken,
      authContext,
      requireActiveLink: false,
    });
  } catch (error) {
    if (error instanceof BatchAccessError) {
      return { ok: false, error: error.message, code: error.code };
    }
    throw error;
  }

  if (!invite.isCurrent || invite.status !== 'sent') {
    return { ok: false, error: 'Invite cannot be resent', code: 'INVALID_STATE' };
  }

  if (invite.sendCount >= inviteSendMaxCount) {
    return { ok: false, error: 'Invite resend limit reached', code: 'RESEND_LIMIT' };
  }

  const now = new Date();
  if (!invite.expiresAt || invite.expiresAt <= now) {
    return { ok: false, error: 'Invite has expired', code: 'INVITE_EXPIRED' };
  }

  if (
    !invite.registration ||
    invite.registration.status === 'cancelled' ||
    !invite.registration.expiresAt ||
    invite.registration.expiresAt <= now
  ) {
    return { ok: false, error: 'Invite has expired', code: 'INVITE_EXPIRED' };
  }

  const rateLimit = await checkRateLimit(`${authContext.user!.id}:${invite.id}`, 'user', {
    action: 'group_upload_invite_resend',
    maxRequests: 1,
    windowMs: inviteSendRateWindowMs,
  });

  if (!rateLimit.allowed) {
    return { ok: false, error: 'Please wait before resending', code: 'RATE_LIMITED' };
  }
  if (
    invite.lastSentAt &&
    now.getTime() - invite.lastSentAt.getTime() < inviteResendCooldownMs
  ) {
    return { ok: false, error: 'Please wait before resending', code: 'RESEND_COOLDOWN' };
  }

  const token = deriveInviteToken(invite.id);

  await sendRegistrationInviteEmail({
    inviteId: invite.id,
    email: invite.email,
    locale: invite.inviteLocale,
    seriesSlug: invite.edition.series.slug,
    editionSlug: invite.edition.slug,
    eventName: `${invite.edition.series.name} ${invite.edition.editionLabel}`.trim(),
    distanceLabel: invite.registration.distance.label,
    expiresAt: invite.expiresAt,
    timezone: invite.edition.timezone,
    token,
  });

  await db
    .update(registrationInvites)
    .set({ sendCount: sql`${registrationInvites.sendCount} + 1`, lastSentAt: now })
    .where(eq(registrationInvites.id, invite.id));

  return { ok: true, data: undefined };
}

export async function rotateInviteTokenWorkflow(params: {
  authContext: AuthContext;
  uploadToken: string;
  inviteId: string;
}): Promise<ActionResult> {
  const { authContext, uploadToken, inviteId } = params;

  const invite = await db.query.registrationInvites.findFirst({
    where: eq(registrationInvites.id, inviteId),
  });

  if (!invite) {
    return { ok: false, error: 'Invite not found', code: 'NOT_FOUND' };
  }

  try {
    await getBatchForCoordinatorOrThrow({
      batchId: invite.batchId,
      uploadToken,
      authContext,
      requireActiveLink: false,
    });
  } catch (error) {
    if (error instanceof BatchAccessError) {
      return { ok: false, error: error.message, code: error.code };
    }
    throw error;
  }

  if (!invite.isCurrent || !['draft', 'sent'].includes(invite.status)) {
    return { ok: false, error: 'Invite cannot be rotated', code: 'INVALID_STATE' };
  }

  const now = new Date();
  if (!invite.expiresAt || invite.expiresAt <= now) {
    return { ok: false, error: 'Invite has expired', code: 'INVITE_EXPIRED' };
  }

  const registration = await db.query.registrations.findFirst({
    where: eq(registrations.id, invite.registrationId),
    columns: { status: true, expiresAt: true },
  });

  if (
    !registration ||
    registration.status === 'cancelled' ||
    !registration.expiresAt ||
    registration.expiresAt <= now
  ) {
    return { ok: false, error: 'Invite has expired', code: 'INVITE_EXPIRED' };
  }

  const existingInvite = await db.query.registrationInvites.findFirst({
    where: and(
      eq(registrationInvites.editionId, invite.editionId),
      eq(registrationInvites.emailNormalized, invite.emailNormalized),
      eq(registrationInvites.isCurrent, true),
      inArray(registrationInvites.status, ['draft', 'sent']),
      sql`${registrationInvites.id} != ${invite.id}`,
    ),
  });

  if (existingInvite) {
    return {
      ok: false,
      error: 'Another active invite already exists',
      code: 'EXISTING_ACTIVE_INVITE',
    };
  }

  const newInviteId = crypto.randomUUID();
  const newToken = deriveInviteToken(newInviteId);
  const newTokenHash = hashToken(newToken);

  await db.transaction(async (tx) => {
    await tx
      .update(registrationInvites)
      .set({ status: 'superseded', isCurrent: false })
      .where(eq(registrationInvites.id, invite.id));

    await tx.insert(registrationInvites).values({
      id: newInviteId,
      editionId: invite.editionId,
      uploadLinkId: invite.uploadLinkId,
      batchId: invite.batchId,
      batchRowId: invite.batchRowId,
      registrationId: invite.registrationId,
      supersedesInviteId: invite.id,
      isCurrent: true,
      createdByUserId: authContext.user!.id,
      email: invite.email,
      emailNormalized: invite.emailNormalized,
      dateOfBirth: invite.dateOfBirth,
      inviteLocale: invite.inviteLocale,
      tokenHash: newTokenHash,
      tokenPrefix: getTokenPrefix(newToken),
      status: 'draft',
      expiresAt: invite.expiresAt,
    });
  });

  return { ok: true, data: undefined };
}

export async function updateInviteEmailWorkflow(params: {
  authContext: AuthContext;
  uploadToken: string;
  inviteId: string;
  email: string;
}): Promise<ActionResult> {
  const { authContext, uploadToken, inviteId, email } = params;

  const invite = await db.query.registrationInvites.findFirst({
    where: eq(registrationInvites.id, inviteId),
  });

  if (!invite) {
    return { ok: false, error: 'Invite not found', code: 'NOT_FOUND' };
  }

  try {
    await getBatchForCoordinatorOrThrow({
      batchId: invite.batchId,
      uploadToken,
      authContext,
      requireActiveLink: false,
    });
  } catch (error) {
    if (error instanceof BatchAccessError) {
      return { ok: false, error: error.message, code: error.code };
    }
    throw error;
  }

  if (!invite.isCurrent || !['draft', 'sent'].includes(invite.status)) {
    return { ok: false, error: 'Invite cannot be updated', code: 'INVALID_STATE' };
  }

  const now = new Date();
  if (!invite.expiresAt || invite.expiresAt <= now) {
    return { ok: false, error: 'Invite has expired', code: 'INVITE_EXPIRED' };
  }

  const registration = await db.query.registrations.findFirst({
    where: eq(registrations.id, invite.registrationId),
    columns: { status: true, expiresAt: true },
  });

  if (
    !registration ||
    registration.status === 'cancelled' ||
    !registration.expiresAt ||
    registration.expiresAt <= now
  ) {
    return { ok: false, error: 'Invite has expired', code: 'INVITE_EXPIRED' };
  }

  const emailNormalized = normalizeEmail(email);

  const existingInvite = await db.query.registrationInvites.findFirst({
    where: and(
      eq(registrationInvites.editionId, invite.editionId),
      eq(registrationInvites.emailNormalized, emailNormalized),
      eq(registrationInvites.isCurrent, true),
      inArray(registrationInvites.status, ['draft', 'sent']),
      sql`${registrationInvites.id} != ${invite.id}`,
    ),
  });

  if (existingInvite) {
    return {
      ok: false,
      error: 'Another active invite already exists',
      code: 'EXISTING_ACTIVE_INVITE',
    };
  }

  const matchedUser = await db.query.users.findFirst({
    where: and(eq(users.email, emailNormalized), isNull(users.deletedAt)),
    with: { profile: true },
  });

  if (matchedUser?.profile?.dateOfBirth) {
    const matchDob = toIsoDateString(matchedUser.profile.dateOfBirth);
    const inviteDob = toIsoDateString(invite.dateOfBirth);
    if (matchDob && inviteDob && matchDob !== inviteDob) {
      return { ok: false, error: 'Date of birth mismatch', code: 'DOB_MISMATCH' };
    }
  }

  if (matchedUser?.id) {
    const existingRegistration = await db.query.registrations.findFirst({
      where: and(
        eq(registrations.buyerUserId, matchedUser.id),
        eq(registrations.editionId, invite.editionId),
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

    if (existingRegistration && existingRegistration.id !== invite.registrationId) {
      return { ok: false, error: 'User already registered', code: 'ALREADY_REGISTERED' };
    }
  }

  const newInviteId = crypto.randomUUID();
  const newToken = deriveInviteToken(newInviteId);
  const newTokenHash = hashToken(newToken);

  await db.transaction(async (tx) => {
    await tx
      .update(registrationInvites)
      .set({ status: 'superseded', isCurrent: false })
      .where(eq(registrationInvites.id, invite.id));

    await tx.insert(registrationInvites).values({
      id: newInviteId,
      editionId: invite.editionId,
      uploadLinkId: invite.uploadLinkId,
      batchId: invite.batchId,
      batchRowId: invite.batchRowId,
      registrationId: invite.registrationId,
      supersedesInviteId: invite.id,
      isCurrent: true,
      createdByUserId: authContext.user!.id,
      email,
      emailNormalized,
      dateOfBirth: invite.dateOfBirth,
      inviteLocale: invite.inviteLocale,
      tokenHash: newTokenHash,
      tokenPrefix: getTokenPrefix(newToken),
      status: 'draft',
      expiresAt: invite.expiresAt,
    });

    await tx
      .update(groupRegistrationBatchRows)
      .set({
        rawJson: sql`jsonb_set(jsonb_set(${groupRegistrationBatchRows.rawJson}, '{email}', to_jsonb(${email})), '{emailNormalized}', to_jsonb(${emailNormalized}))`,
      })
      .where(eq(groupRegistrationBatchRows.id, invite.batchRowId));
  });

  return { ok: true, data: undefined };
}

export async function reissueInviteForBatchRowWorkflow(params: {
  authContext: AuthContext;
  uploadToken: string;
  batchRowId: string;
  locale: string;
  inviteHoldHours: number;
}): Promise<ActionResult<{ inviteId: string }>> {
  const { authContext, uploadToken, batchRowId, locale, inviteHoldHours } = params;

  const batchRow = await db.query.groupRegistrationBatchRows.findFirst({
    where: eq(groupRegistrationBatchRows.id, batchRowId),
    with: {
      batch: true,
    },
  });

  if (!batchRow?.batch) {
    return { ok: false, error: 'Batch row not found', code: 'NOT_FOUND' };
  }

  let access: Awaited<ReturnType<typeof getBatchForCoordinatorOrThrow>>;
  try {
    access = await getBatchForCoordinatorOrThrow({
      batchId: batchRow.batchId,
      uploadToken,
      authContext,
      requireActiveLink: false,
    });
  } catch (error) {
    if (error instanceof BatchAccessError) {
      return { ok: false, error: error.message, code: error.code };
    }
    throw error;
  }

  if (!batchRow.createdRegistrationId) {
    return { ok: false, error: 'Row has not been reserved yet', code: 'INVALID_STATE' };
  }

  if ((batchRow.validationErrorsJson ?? []).length > 0) {
    return { ok: false, error: 'Row contains validation errors', code: 'INVALID_STATE' };
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

  const raw = (batchRow.rawJson ?? {}) as Record<string, unknown>;
  const emailNormalized =
    typeof raw.emailNormalized === 'string'
      ? raw.emailNormalized
      : normalizeEmail(String(raw.email ?? ''));
  const dateOfBirth = typeof raw.dateOfBirth === 'string' ? raw.dateOfBirth : null;

  if (!emailNormalized || !dateOfBirth) {
    await db
      .update(groupRegistrationBatchRows)
      .set({ validationErrorsJson: ['INVALID_ROW'] })
      .where(eq(groupRegistrationBatchRows.id, batchRow.id));

    return { ok: false, error: 'Row data is invalid', code: 'INVALID_ROW' };
  }

  const dateOfBirthDate = new Date(`${dateOfBirth}T00:00:00.000Z`);

  const matchedUser = await db.query.users.findFirst({
    where: and(eq(users.email, emailNormalized), isNull(users.deletedAt)),
    with: { profile: true },
  });

  if (matchedUser?.profile?.dateOfBirth) {
    const matchDob = toIsoDateString(matchedUser.profile.dateOfBirth);
    if (matchDob && matchDob !== dateOfBirth) {
      await db
        .update(groupRegistrationBatchRows)
        .set({ validationErrorsJson: ['DOB_MISMATCH'] })
        .where(eq(groupRegistrationBatchRows.id, batchRow.id));

      return { ok: false, error: 'Date of birth mismatch', code: 'DOB_MISMATCH' };
    }
  }

  if (matchedUser?.id) {
    const existingRegistration = await db.query.registrations.findFirst({
      where: and(
        eq(registrations.buyerUserId, matchedUser.id),
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
      await db
        .update(groupRegistrationBatchRows)
        .set({ validationErrorsJson: ['ALREADY_REGISTERED'] })
        .where(eq(groupRegistrationBatchRows.id, batchRow.id));

      return { ok: false, error: 'User already registered', code: 'ALREADY_REGISTERED' };
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
      typeof raw.emergencyContactPhone === 'string' ? raw.emergencyContactPhone : undefined,
  };

  try {
    const inviteId = await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT id FROM ${groupRegistrationBatchRows} WHERE id = ${batchRow.id} FOR UPDATE`,
      );

      const currentRow = await tx.query.groupRegistrationBatchRows.findFirst({
        where: eq(groupRegistrationBatchRows.id, batchRow.id),
        columns: {
          id: true,
          createdRegistrationId: true,
        },
      });

      if (!currentRow?.createdRegistrationId) {
        throw new Error('ROW_NOT_RESERVED');
      }

      const existingRegistration = await tx.query.registrations.findFirst({
        where: eq(registrations.id, currentRow.createdRegistrationId),
        columns: { status: true, expiresAt: true },
      });

      const registrationIsActive =
        existingRegistration &&
        (existingRegistration.status === 'confirmed' ||
          (['started', 'submitted', 'payment_pending'].includes(existingRegistration.status) &&
            !!existingRegistration.expiresAt &&
            existingRegistration.expiresAt > now));

      if (registrationIsActive) {
        throw new Error('REGISTRATION_ACTIVE');
      }

      await tx
        .update(registrationInvites)
        .set({ status: 'expired', isCurrent: false, updatedAt: now })
        .where(
          and(
            eq(registrationInvites.batchRowId, batchRow.id),
            eq(registrationInvites.isCurrent, true),
          ),
        );

      await tx
        .update(registrations)
        .set({ status: 'cancelled', expiresAt: null, updatedAt: now })
        .where(eq(registrations.id, currentRow.createdRegistrationId));

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
            .where(eq(groupRegistrationBatchRows.id, batchRow.id));
          throw error;
        }
        throw error;
      }

      const newInviteId = crypto.randomUUID();
      const inviteToken = deriveInviteToken(newInviteId);
      const inviteTokenHash = hashToken(inviteToken);

      await tx.insert(registrationInvites).values({
        id: newInviteId,
        editionId: edition.id,
        uploadLinkId: access.uploadLink.id,
        batchId: access.batch.id,
        batchRowId: batchRow.id,
        registrationId: createdRegistration.id,
        createdByUserId: authContext.user!.id,
        email: typeof raw.email === 'string' ? raw.email : emailNormalized,
        emailNormalized,
        dateOfBirth: dateOfBirthDate,
        inviteLocale,
        tokenHash: inviteTokenHash,
        tokenPrefix: getTokenPrefix(inviteToken),
        status: 'draft',
        expiresAt: createdRegistration.expiresAt ?? computeInviteExpiresAt(now, inviteHoldHours),
      });

      await tx
        .update(groupRegistrationBatchRows)
        .set({ createdRegistrationId: createdRegistration.id, validationErrorsJson: [] })
        .where(eq(groupRegistrationBatchRows.id, batchRow.id));

      return newInviteId;
    });

    try {
      const requestContext = await getRequestContext(await headers());
      await createAuditLog(
        {
          organizationId: edition.series.organizationId,
          actorUserId: authContext.user!.id,
          action: 'group_upload_invite.reissue',
          entityType: 'registration_invite',
          entityId: inviteId,
          after: { batchId: access.batch.id, batchRowId: batchRow.id },
          request: requestContext,
        },
        db,
      );
    } catch (error) {
      console.warn('[group-upload] Failed to create audit log for invite reissue:', error);
    }

    return { ok: true, data: { inviteId } };
  } catch (error) {
    if (error instanceof ReserveHoldError) {
      return { ok: false, error: 'Distance is sold out', code: 'SOLD_OUT' };
    }
    if (error instanceof Error) {
      if (error.message === 'REGISTRATION_ACTIVE') {
        return { ok: false, error: 'Row already has an active registration', code: 'INVALID_STATE' };
      }
      if (error.message === 'ROW_NOT_RESERVED') {
        return { ok: false, error: 'Row is not reserved', code: 'INVALID_STATE' };
      }
    }
    throw error;
  }
}

export async function extendInviteHoldWorkflow(params: {
  authContext: AuthContext;
  uploadToken: string;
  inviteId: string;
  inviteHoldHours: number;
}): Promise<ActionResult<{ expiresAt: string }>> {
  const { authContext, uploadToken, inviteId, inviteHoldHours } = params;

  const invite = await db.query.registrationInvites.findFirst({
    where: eq(registrationInvites.id, inviteId),
    with: {
      registration: true,
      edition: {
        with: { series: true },
      },
    },
  });

  if (!invite?.registration) {
    return { ok: false, error: 'Invite not found', code: 'NOT_FOUND' };
  }

  try {
    await getBatchForCoordinatorOrThrow({
      batchId: invite.batchId,
      uploadToken,
      authContext,
      requireActiveLink: false,
    });
  } catch (error) {
    if (error instanceof BatchAccessError) {
      return { ok: false, error: error.message, code: error.code };
    }
    throw error;
  }

  if (!invite.isCurrent || !['draft', 'sent', 'claimed'].includes(invite.status)) {
    return { ok: false, error: 'Invite cannot be extended', code: 'INVALID_STATE' };
  }

  if (invite.registration.status === 'cancelled') {
    return { ok: false, error: 'Invite has expired', code: 'INVITE_EXPIRED' };
  }

  if (invite.registration.status === 'confirmed') {
    return { ok: false, error: 'Registration already confirmed', code: 'INVALID_STATE' };
  }

  const now = new Date();
  const expiresAt = computeInviteExpiresAt(now, inviteHoldHours);

  await db.transaction(async (tx) => {
    await tx
      .update(registrations)
      .set({ expiresAt, updatedAt: now })
      .where(eq(registrations.id, invite.registrationId));

    await tx
      .update(registrationInvites)
      .set({ expiresAt, updatedAt: now })
      .where(eq(registrationInvites.id, invite.id));
  });

  if (invite.edition?.series) {
    try {
      const requestContext = await getRequestContext(await headers());
      await createAuditLog(
        {
          organizationId: invite.edition.series.organizationId,
          actorUserId: authContext.user!.id,
          action: 'group_upload_invite.extend',
          entityType: 'registration_invite',
          entityId: invite.id,
          after: { expiresAt: expiresAt.toISOString(), registrationId: invite.registrationId },
          request: requestContext,
        },
        db,
      );
    } catch (error) {
      console.warn('[group-upload] Failed to create audit log for invite hold extend:', error);
    }
  }

  return { ok: true, data: { expiresAt: expiresAt.toISOString() } };
}

export async function cancelInviteWorkflow(params: {
  authContext: AuthContext;
  uploadToken: string;
  inviteId: string;
}): Promise<ActionResult> {
  const { authContext, uploadToken, inviteId } = params;

  const invite = await db.query.registrationInvites.findFirst({
    where: eq(registrationInvites.id, inviteId),
  });

  if (!invite) {
    return { ok: false, error: 'Invite not found', code: 'NOT_FOUND' };
  }

  try {
    await getBatchForCoordinatorOrThrow({
      batchId: invite.batchId,
      uploadToken,
      authContext,
      requireActiveLink: false,
    });
  } catch (error) {
    if (error instanceof BatchAccessError) {
      return { ok: false, error: error.message, code: error.code };
    }
    throw error;
  }

  if (invite.status === 'claimed') {
    return { ok: false, error: 'Invite already claimed', code: 'ALREADY_CLAIMED' };
  }

  if (!invite.isCurrent || !['draft', 'sent'].includes(invite.status)) {
    return { ok: false, error: 'Invite cannot be cancelled', code: 'INVALID_STATE' };
  }

  const edition = await db.query.eventEditions.findFirst({
    where: and(eq(eventEditions.id, invite.editionId), isNull(eventEditions.deletedAt)),
    with: { series: true },
  });

  await db.transaction(async (tx) => {
    await tx
      .update(registrations)
      .set({ status: 'cancelled', expiresAt: null })
      .where(eq(registrations.id, invite.registrationId));

    await tx
      .update(registrationInvites)
      .set({ status: 'cancelled', isCurrent: false })
      .where(eq(registrationInvites.id, invite.id));
  });

  if (edition?.series) {
    const requestContext = await getRequestContext(await headers());
    await createAuditLog(
      {
        organizationId: edition.series.organizationId,
        actorUserId: authContext.user!.id,
        action: 'group_upload_invite.cancel',
        entityType: 'registration_invite',
        entityId: invite.id,
        after: { registrationId: invite.registrationId },
        request: requestContext,
      },
      db,
    );
  }

  return { ok: true, data: undefined };
}
