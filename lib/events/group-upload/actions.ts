'use server';

import { and, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import { headers } from 'next/headers';
import { z } from 'zod';

import { db } from '@/db';
import {
  eventEditions,
  registrationInvites,
  registrations,
  groupRegistrationBatches,
  groupUploadLinks,
} from '@/db/schema';
import { createAuditLog, getRequestContext } from '@/lib/audit';
import { withAuthenticatedUser } from '@/lib/auth/action-wrapper';
import {
  getBatchForCoordinatorOrThrow,
  BatchAccessError,
  getEditionGroupUploadPermissionError,
  getOrganizerGroupUploadAccessError,
} from './access';
import {
  createBatchViaLinkWorkflow,
  uploadBatchViaLinkWorkflow,
} from './batch-creation';
import {
  cancelInviteWorkflow,
  extendInviteHoldWorkflow,
  reissueInviteForBatchRowWorkflow,
  resendInviteWorkflow,
  rotateInviteTokenWorkflow,
  sendInvitesForBatchWorkflow,
  updateInviteEmailWorkflow,
} from './invite-delivery';
import { reserveInvitesForBatchWorkflow } from './reservation-runner';
import {
  cancelBatchSchema,
  cancelInviteSchema,
  createBatchSchema,
  createUploadLinkSchema,
  extendInviteHoldSchema,
  listUploadLinksSchema,
  reissueInviteForRowSchema,
  reserveInvitesSchema,
  resendInviteSchema,
  revokeUploadLinkSchema,
  rotateInviteSchema,
  sendInvitesSchema,
  updateInviteEmailSchema,
  uploadBatchSchema,
} from './schemas';
import { generateToken, getTokenPrefix, hashToken } from './tokens';

// =============================================================================
// Types
// =============================================================================

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string };

// =============================================================================
// Config
// =============================================================================

function parsePositiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

const GROUP_UPLOAD_MAX_ROWS = parsePositiveIntegerEnv('EVENTS_GROUP_UPLOAD_MAX_ROWS', 250);
const GROUP_UPLOAD_RESERVE_CHUNK_SIZE = parsePositiveIntegerEnv(
  'EVENTS_GROUP_UPLOAD_RESERVE_CHUNK_SIZE',
  25,
);
const GROUP_UPLOAD_INVITE_SEND_CHUNK_SIZE = parsePositiveIntegerEnv(
  'EVENTS_GROUP_UPLOAD_INVITE_SEND_CHUNK_SIZE',
  10,
);
const GROUP_UPLOAD_CREATE_BATCH_MAX_REQUESTS = parsePositiveIntegerEnv(
  'EVENTS_GROUP_UPLOAD_CREATE_BATCH_MAX_REQUESTS',
  5,
);
const GROUP_UPLOAD_CREATE_BATCH_WINDOW_MS = parsePositiveIntegerEnv(
  'EVENTS_GROUP_UPLOAD_CREATE_BATCH_WINDOW_MS',
  10 * 60 * 1000,
);
const INVITE_SEND_MAX_COUNT = parsePositiveIntegerEnv('EVENTS_GROUP_UPLOAD_INVITE_MAX_SEND_COUNT', 5);
const INVITE_RESEND_COOLDOWN_MS = parsePositiveIntegerEnv(
  'EVENTS_GROUP_UPLOAD_INVITE_RESEND_COOLDOWN_MS',
  10 * 60 * 1000,
);
const INVITE_SEND_RATE_WINDOW_MS = parsePositiveIntegerEnv(
  'EVENTS_GROUP_UPLOAD_INVITE_SEND_RATE_WINDOW_MS',
  5 * 1000,
);

const INVITE_HOLD_HOURS = 72;

// =============================================================================
// Dashboard Actions (Organizer Staff)
// =============================================================================

export const createUploadLink = withAuthenticatedUser<
  ActionResult<{ uploadLinkId: string; token: string; tokenPrefix: string }>
>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof createUploadLinkSchema>) => {
  const accessError = getOrganizerGroupUploadAccessError(authContext);
  if (accessError) {
    return { ok: false, ...accessError };
  }


  const validated = createUploadLinkSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { editionId, name, paymentResponsibility, startsAt, endsAt, maxBatches, maxInvites } =
    validated.data;

  const permissionError = await getEditionGroupUploadPermissionError({
    authContext,
    editionId,
  });
  if (permissionError) {
    return { ok: false, ...permissionError };
  }

  const edition = await db.query.eventEditions.findFirst({
    where: and(eq(eventEditions.id, editionId), isNull(eventEditions.deletedAt)),
    with: { series: true },
  });

  if (!edition?.series) {
    return { ok: false, error: 'Event edition not found', code: 'NOT_FOUND' };
  }

  const token = generateToken();
  const tokenHash = hashToken(token);
  const tokenPrefix = getTokenPrefix(token);

  const requestContext = await getRequestContext(await headers());

  const [created] = await db
    .insert(groupUploadLinks)
    .values({
      editionId,
      name: name ?? null,
      paymentResponsibility,
      tokenHash,
      tokenPrefix,
      startsAt: startsAt ? new Date(startsAt) : null,
      endsAt: endsAt ? new Date(endsAt) : null,
      maxBatches: maxBatches ?? null,
      maxInvites: maxInvites ?? null,
      createdByUserId: authContext.user.id,
    })
    .returning({ id: groupUploadLinks.id });

  const auditResult = await createAuditLog(
    {
      organizationId: edition.series.organizationId,
      actorUserId: authContext.user.id,
      action: 'group_upload_link.create',
      entityType: 'group_upload_link',
      entityId: created.id,
      after: { name, paymentResponsibility, startsAt, endsAt, maxBatches, maxInvites },
      request: requestContext,
    },
    db,
  );

  if (!auditResult.ok) {
    return { ok: false, error: 'Failed to create audit log', code: 'AUDIT_FAILED' };
  }

  return { ok: true, data: { uploadLinkId: created.id, token, tokenPrefix } };
});

export const revokeUploadLink = withAuthenticatedUser<ActionResult>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof revokeUploadLinkSchema>) => {
  const accessError = getOrganizerGroupUploadAccessError(authContext);
  if (accessError) {
    return { ok: false, ...accessError };
  }


  const validated = revokeUploadLinkSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const link = await db.query.groupUploadLinks.findFirst({
    where: eq(groupUploadLinks.id, validated.data.uploadLinkId),
    with: { edition: { with: { series: true } } },
  });

  if (!link?.edition?.series) {
    return { ok: false, error: 'Upload link not found', code: 'NOT_FOUND' };
  }

  const permissionError = await getEditionGroupUploadPermissionError({
    authContext,
    editionId: link.editionId,
  });
  if (permissionError) {
    return { ok: false, ...permissionError };
  }

  const now = new Date();
  await db
    .update(groupUploadLinks)
    .set({ revokedAt: now, revokedByUserId: authContext.user.id, isActive: false })
    .where(eq(groupUploadLinks.id, link.id));

  const requestContext = await getRequestContext(await headers());
  const auditResult = await createAuditLog(
    {
      organizationId: link.edition.series.organizationId,
      actorUserId: authContext.user.id,
      action: 'group_upload_link.revoke',
      entityType: 'group_upload_link',
      entityId: link.id,
      after: { revokedAt: now },
      request: requestContext,
    },
    db,
  );

  if (!auditResult.ok) {
    return { ok: false, error: 'Failed to create audit log', code: 'AUDIT_FAILED' };
  }

  return { ok: true, data: undefined };
});

export const listUploadLinksForEdition = withAuthenticatedUser<
  ActionResult<
    Array<
      {
        id: string;
        name: string | null;
        tokenPrefix: string;
        status: string;
        startsAt: Date | null;
        endsAt: Date | null;
        maxBatches: number | null;
        maxInvites: number | null;
        createdAt: Date;
        revokedAt: Date | null;
        batchCount: number;
        inviteCount: number;
      }
    >
  >
>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof listUploadLinksSchema>) => {
  const accessError = getOrganizerGroupUploadAccessError(authContext);
  if (accessError) {
    return { ok: false, ...accessError };
  }


  const validated = listUploadLinksSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const permissionError = await getEditionGroupUploadPermissionError({
    authContext,
    editionId: validated.data.editionId,
  });
  if (permissionError) {
    return { ok: false, ...permissionError };
  }

  const links = await db.query.groupUploadLinks.findMany({
    where: eq(groupUploadLinks.editionId, validated.data.editionId),
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });

  const now = new Date();

  const batchCounts = await db
    .select({
      uploadLinkId: groupRegistrationBatches.uploadLinkId,
      count: sql<number>`count(*)::int`,
    })
    .from(groupRegistrationBatches)
    .where(eq(groupRegistrationBatches.editionId, validated.data.editionId))
    .groupBy(groupRegistrationBatches.uploadLinkId);

  const inviteCounts = await db
    .select({
      uploadLinkId: registrationInvites.uploadLinkId,
      count: sql<number>`count(*)::int`,
    })
    .from(registrationInvites)
    .innerJoin(registrations, eq(registrationInvites.registrationId, registrations.id))
    .where(
      and(
        eq(registrationInvites.editionId, validated.data.editionId),
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
    )
    .groupBy(registrationInvites.uploadLinkId);

  const batchCountMap = new Map(batchCounts.map((row) => [row.uploadLinkId ?? '', row.count]));
  const inviteCountMap = new Map(inviteCounts.map((row) => [row.uploadLinkId ?? '', row.count]));

  return {
    ok: true,
    data: links.map((link) => {
      const batchCount = batchCountMap.get(link.id) ?? 0;
      const inviteCount = inviteCountMap.get(link.id) ?? 0;

      let status = 'ACTIVE';
      if (link.revokedAt) status = 'REVOKED';
      else if (!link.isActive) status = 'DISABLED';
      else if (link.startsAt && now < link.startsAt) status = 'NOT_STARTED';
      else if (link.endsAt && now > link.endsAt) status = 'EXPIRED';
      else if ((link.maxBatches && batchCount >= link.maxBatches) || (link.maxInvites && inviteCount >= link.maxInvites)) {
        status = 'MAXED_OUT';
      }

      return {
        id: link.id,
        name: link.name,
        tokenPrefix: link.tokenPrefix,
        status,
        startsAt: link.startsAt,
        endsAt: link.endsAt,
        maxBatches: link.maxBatches,
        maxInvites: link.maxInvites,
        createdAt: link.createdAt,
        revokedAt: link.revokedAt,
        batchCount,
        inviteCount,
      };
    }),
  };
});

// =============================================================================
// Coordinator Actions (Public)
// =============================================================================

export const createBatchViaLink = withAuthenticatedUser<
  ActionResult<{ batchId: string }>
>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof createBatchSchema>) => {
  const validated = createBatchSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  return createBatchViaLinkWorkflow({
    authContext,
    uploadToken: validated.data.uploadToken,
    distanceId: validated.data.distanceId,
    createBatchMaxRequests: GROUP_UPLOAD_CREATE_BATCH_MAX_REQUESTS,
    createBatchWindowMs: GROUP_UPLOAD_CREATE_BATCH_WINDOW_MS,
  });
});

export const uploadBatchViaLink = withAuthenticatedUser<
  ActionResult<{ batchId: string; rowCount: number; errorCount: number }>
>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof uploadBatchSchema>) => {
  const validated = uploadBatchSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  return uploadBatchViaLinkWorkflow({
    authContext,
    batchId: validated.data.batchId,
    uploadToken: validated.data.uploadToken,
    mediaUrl: validated.data.mediaUrl,
    groupUploadMaxRows: GROUP_UPLOAD_MAX_ROWS,
  });
});

export const reserveInvitesForBatch = withAuthenticatedUser<
  ActionResult<{ processed: number; succeeded: number; failed: number; remaining: number; groupDiscountPercentOff: number | null }>
>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof reserveInvitesSchema>) => {
  const validated = reserveInvitesSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  return reserveInvitesForBatchWorkflow({
    authContext,
    batchId: validated.data.batchId,
    uploadToken: validated.data.uploadToken,
    locale: validated.data.locale,
    limit: validated.data.limit ?? GROUP_UPLOAD_RESERVE_CHUNK_SIZE,
    inviteHoldHours: INVITE_HOLD_HOURS,
  });
});

export const sendInvitesForBatch = withAuthenticatedUser<
  ActionResult<{ sent: number; skipped: number }>
>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof sendInvitesSchema>) => {
  const validated = sendInvitesSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  return sendInvitesForBatchWorkflow({
    authContext,
    batchId: validated.data.batchId,
    uploadToken: validated.data.uploadToken,
    limit: validated.data.limit ?? GROUP_UPLOAD_INVITE_SEND_CHUNK_SIZE,
    inviteSendMaxCount: INVITE_SEND_MAX_COUNT,
    inviteSendRateWindowMs: INVITE_SEND_RATE_WINDOW_MS,
  });
});

export const resendInvite = withAuthenticatedUser<ActionResult>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof resendInviteSchema>) => {
  const validated = resendInviteSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  return resendInviteWorkflow({
    authContext,
    uploadToken: validated.data.uploadToken,
    inviteId: validated.data.inviteId,
    inviteSendMaxCount: INVITE_SEND_MAX_COUNT,
    inviteSendRateWindowMs: INVITE_SEND_RATE_WINDOW_MS,
    inviteResendCooldownMs: INVITE_RESEND_COOLDOWN_MS,
  });
});

export const rotateInviteToken = withAuthenticatedUser<ActionResult>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof rotateInviteSchema>) => {
  const validated = rotateInviteSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  return rotateInviteTokenWorkflow({
    authContext,
    uploadToken: validated.data.uploadToken,
    inviteId: validated.data.inviteId,
  });
});

export const updateInviteEmail = withAuthenticatedUser<ActionResult>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof updateInviteEmailSchema>) => {
  const validated = updateInviteEmailSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  return updateInviteEmailWorkflow({
    authContext,
    uploadToken: validated.data.uploadToken,
    inviteId: validated.data.inviteId,
    email: validated.data.email,
  });
});

export const reissueInviteForBatchRow = withAuthenticatedUser<
  ActionResult<{ inviteId: string }>
>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof reissueInviteForRowSchema>) => {
  const validated = reissueInviteForRowSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  return reissueInviteForBatchRowWorkflow({
    authContext,
    uploadToken: validated.data.uploadToken,
    batchRowId: validated.data.batchRowId,
    locale: validated.data.locale,
    inviteHoldHours: INVITE_HOLD_HOURS,
  });
});

export const extendInviteHold = withAuthenticatedUser<
  ActionResult<{ expiresAt: string }>
>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof extendInviteHoldSchema>) => {
  const validated = extendInviteHoldSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  return extendInviteHoldWorkflow({
    authContext,
    uploadToken: validated.data.uploadToken,
    inviteId: validated.data.inviteId,
    inviteHoldHours: INVITE_HOLD_HOURS,
  });
});

export const cancelInvite = withAuthenticatedUser<ActionResult>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof cancelInviteSchema>) => {
  const validated = cancelInviteSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  return cancelInviteWorkflow({
    authContext,
    uploadToken: validated.data.uploadToken,
    inviteId: validated.data.inviteId,
  });
});

export const cancelBatch = withAuthenticatedUser<ActionResult>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof cancelBatchSchema>) => {

  const validated = cancelBatchSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  try {
    const access = await getBatchForCoordinatorOrThrow({
      batchId: validated.data.batchId,
      uploadToken: validated.data.uploadToken,
      authContext,
      requireActiveLink: false,
    });

    const edition = await db.query.eventEditions.findFirst({
      where: and(eq(eventEditions.id, access.batch.editionId), isNull(eventEditions.deletedAt)),
      with: { series: true },
    });

    const invites = await db.query.registrationInvites.findMany({
      where: and(eq(registrationInvites.batchId, access.batch.id), eq(registrationInvites.isCurrent, true)),
    });

    await db.transaction(async (tx) => {
      for (const invite of invites) {
        if (invite.status === 'claimed') continue;

        await tx
          .update(registrations)
          .set({ status: 'cancelled', expiresAt: null })
          .where(eq(registrations.id, invite.registrationId));

        await tx
          .update(registrationInvites)
          .set({ status: 'cancelled', isCurrent: false })
          .where(eq(registrationInvites.id, invite.id));
      }
    });

    if (edition?.series) {
      const requestContext = await getRequestContext(await headers());
      await createAuditLog(
        {
          organizationId: edition.series.organizationId,
          actorUserId: authContext.user.id,
          action: 'group_upload_batch.cancel',
          entityType: 'group_registration_batch',
          entityId: access.batch.id,
          after: { cancelledInvites: invites.length },
          request: requestContext,
        },
        db,
      );
    }

    return { ok: true, data: undefined };
  } catch (error) {
    if (error instanceof BatchAccessError) {
      return { ok: false, error: error.message, code: error.code };
    }

    throw error;
  }
});
