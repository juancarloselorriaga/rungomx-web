'use server';

import { and, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db';
import { eventEditions, profiles, registrants, registrationInvites, registrations } from '@/db/schema';
import { withAuthenticatedUser } from '@/lib/auth/action-wrapper';
import { checkRateLimit } from '@/lib/rate-limit';
import { normalizeEmail, parseIsoDate, toIsoDateString } from '@/lib/events/shared/identity';
import { hashToken } from '@/lib/events/group-upload/tokens';
import { createAuditLog } from '@/lib/audit';

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string };

type ClaimResult = ActionResult<{ registrationId: string; editionId: string; inviteId: string }>;

const claimInviteSchema = z.object({
  inviteToken: z.string().min(1),
  dateOfBirth: z.string().optional(),
});

export const claimInvite = withAuthenticatedUser<ActionResult<{ registrationId: string }>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof claimInviteSchema>) => {
  const validated = claimInviteSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const user = authContext.user;
  if (!user) {
    return { ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' };
  }

  if (!user.emailVerified) {
    return { ok: false, error: 'Email verification required', code: 'EMAIL_NOT_VERIFIED' };
  }

  const rateLimit = await checkRateLimit(user.id, 'user', {
    action: 'registration_invite_claim',
    maxRequests: 10,
    windowMs: 60 * 1000,
  });

  if (!rateLimit.allowed) {
    return { ok: false, error: 'Too many attempts. Please try again later.', code: 'RATE_LIMITED' };
  }

  const emailNormalized = normalizeEmail(user.email ?? '');
  const tokenHash = hashToken(validated.data.inviteToken);
  const tokenRateLimit = await checkRateLimit(tokenHash, 'user', {
    action: 'registration_invite_claim_token',
    maxRequests: 10,
    windowMs: 60 * 1000,
  });

  if (!tokenRateLimit.allowed) {
    return { ok: false, error: 'Too many attempts. Please try again later.', code: 'RATE_LIMITED' };
  }
  const now = new Date();

  const result: ClaimResult = await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT id FROM ${registrationInvites} WHERE token_hash = ${tokenHash} FOR UPDATE`,
    );

    const invite = await tx.query.registrationInvites.findFirst({
      where: eq(registrationInvites.tokenHash, tokenHash),
    });

    if (!invite) {
      return { ok: false as const, error: 'Invite not found', code: 'NOT_FOUND' };
    }

    if (invite.status === 'claimed') {
      if (invite.claimedByUserId === user.id) {
        return {
          ok: true as const,
          data: {
            registrationId: invite.registrationId,
            editionId: invite.editionId,
            inviteId: invite.id,
          },
        };
      }
      return { ok: false as const, error: 'Invite already claimed', code: 'ALREADY_CLAIMED' };
    }

    if (invite.status === 'cancelled') {
      return { ok: false as const, error: 'Invite cancelled', code: 'INVITE_CANCELLED' };
    }

    if (invite.status === 'expired') {
      return { ok: false as const, error: 'Invite expired', code: 'INVITE_EXPIRED' };
    }

    if (!invite.isCurrent || invite.status === 'superseded') {
      return { ok: false as const, error: 'Invite is not active', code: 'INVITE_INVALID' };
    }

    await tx.execute(sql`SELECT id FROM ${registrations} WHERE id = ${invite.registrationId} FOR UPDATE`);

    const registration = await tx.query.registrations.findFirst({
      where: eq(registrations.id, invite.registrationId),
    });

    if (!registration || registration.status === 'cancelled' || !registration.expiresAt || registration.expiresAt <= now) {
      return { ok: false as const, error: 'Invite expired', code: 'INVITE_EXPIRED' };
    }

    if (registration.buyerUserId && registration.buyerUserId !== user.id) {
      return { ok: false as const, error: 'Invite already claimed', code: 'ALREADY_CLAIMED' };
    }

    if (emailNormalized !== invite.emailNormalized) {
      return { ok: false as const, error: 'Email mismatch', code: 'EMAIL_MISMATCH' };
    }

    const profileDob = authContext.profile?.dateOfBirth ?? null;
    const profileDobIso = toIsoDateString(profileDob);
    const inviteDobIso = toIsoDateString(invite.dateOfBirth);

    if (profileDobIso && profileDobIso !== inviteDobIso) {
      return { ok: false as const, error: 'Date of birth mismatch', code: 'DOB_MISMATCH' };
    }

    if (!profileDobIso) {
      const providedDob = validated.data.dateOfBirth ? parseIsoDate(validated.data.dateOfBirth) : null;
      if (!providedDob) {
        return { ok: false as const, error: 'Date of birth required', code: 'DOB_REQUIRED' };
      }
      if (providedDob !== inviteDobIso) {
        return { ok: false as const, error: 'Date of birth mismatch', code: 'DOB_MISMATCH' };
      }

      await tx
        .update(profiles)
        .set({ dateOfBirth: invite.dateOfBirth, updatedAt: now })
        .where(eq(profiles.userId, user.id));
    }

    const existingRegistration = await tx.query.registrations.findFirst({
      where: and(
        eq(registrations.buyerUserId, user.id),
        eq(registrations.editionId, invite.editionId),
        sql`${registrations.id} != ${invite.registrationId}`,
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
      return { ok: false as const, error: 'Already registered', code: 'ALREADY_REGISTERED' };
    }

    const [updatedRegistration] = await tx
      .update(registrations)
      .set({ buyerUserId: user.id })
      .where(and(eq(registrations.id, invite.registrationId), or(isNull(registrations.buyerUserId), eq(registrations.buyerUserId, user.id))))
      .returning({ id: registrations.id });

    if (!updatedRegistration) {
      return { ok: false as const, error: 'Invite already claimed', code: 'ALREADY_CLAIMED' };
    }

    const existingRegistrant = await tx.query.registrants.findFirst({
      where: eq(registrants.registrationId, invite.registrationId),
    });

    if (existingRegistrant) {
      await tx
        .update(registrants)
        .set({ userId: user.id })
        .where(eq(registrants.id, existingRegistrant.id));
    } else {
      await tx.insert(registrants).values({
        registrationId: invite.registrationId,
        userId: user.id,
      });
    }

    await tx
      .update(registrationInvites)
      .set({ status: 'claimed', claimedAt: now, claimedByUserId: user.id })
      .where(eq(registrationInvites.id, invite.id));

    return {
      ok: true as const,
      data: { registrationId: invite.registrationId, editionId: invite.editionId, inviteId: invite.id },
    };
  });

  if (!result.ok) {
    return result;
  }

  const edition = await db.query.eventEditions.findFirst({
    where: eq(eventEditions.id, result.data.editionId),
    with: { series: true },
  });

  if (edition?.series) {
    await createAuditLog({
      organizationId: edition.series.organizationId,
      actorUserId: user.id,
      action: 'registration_invite.claim',
      entityType: 'registration_invite',
      entityId: result.data.inviteId,
      after: { registrationId: result.data.registrationId },
    });
  }

  return { ok: true, data: { registrationId: result.data.registrationId } };
});
