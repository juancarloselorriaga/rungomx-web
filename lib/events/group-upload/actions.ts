'use server';

import { and, eq, gt, inArray, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';
import { headers } from 'next/headers';
import { z } from 'zod';

import { db } from '@/db';
import {
  eventDistances,
  eventEditions,
  eventSeries,
  media,
  pricingTiers,
  profiles,
  groupDiscountRules,
  registrationInvites,
  registrations,
  users,
  groupRegistrationBatches,
  groupRegistrationBatchRows,
  groupUploadLinks,
} from '@/db/schema';
import { createAuditLog, getRequestContext } from '@/lib/audit';
import { withAuthenticatedUser } from '@/lib/auth/action-wrapper';
import type { AuthContext } from '@/lib/auth/server';
import { PAYMENT_RESPONSIBILITIES } from '@/lib/events/constants';
import { checkRateLimit } from '@/lib/rate-limit';
import { EVENT_MEDIA_GROUP_REGISTRATION_TYPES } from '@/lib/events/media/constants';
import { reserveHold, ReserveHoldError } from '@/lib/events/registrations/reserve-hold';
import { normalizeEmail, parseIsoDate, toIsoDateString } from '@/lib/events/shared/identity';
import { canUserAccessEvent, requireOrgPermission } from '@/lib/organizations/permissions';
import { getBatchForCoordinatorOrThrow, BatchAccessError } from './access';
import { getUploadLinkByToken } from './queries';
import { deriveInviteToken, generateToken, getTokenPrefix, hashToken } from './tokens';
import { sendRegistrationInviteEmail } from '@/lib/events/registration-invite-email';
import { parseCsv } from '@/lib/events/group-registrations/csv';

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
// Helpers
// =============================================================================

function checkEventsAccess(authContext: AuthContext): { error: string; code: string } | null {
  if (authContext.permissions.canManageEvents) {
    return null;
  }

  if (!authContext.permissions.canViewOrganizersDashboard) {
    return {
      error: 'You do not have permission to manage events',
      code: 'FORBIDDEN',
    };
  }

  return null;
}


function buildHeaderIndex(headers: string[]) {
  const map = new Map<string, number>();
  headers.forEach((h, i) => {
    const key = h.trim();
    if (!key) return;
    if (!map.has(key)) map.set(key, i);
  });
  return map;
}

function getCell(row: string[], headerIndex: Map<string, number>, header: string): string {
  const idx = headerIndex.get(header);
  if (idx === undefined) return '';
  return row[idx] ?? '';
}

const REQUIRED_HEADERS = ['firstName', 'lastName', 'email', 'dateOfBirth'] as const;

async function parseRosterFile(mediaId: string) {
  const file = await db.query.media.findFirst({
    where: and(eq(media.id, mediaId), isNull(media.deletedAt)),
    columns: { blobUrl: true, mimeType: true, sizeBytes: true },
  });

  if (!file?.blobUrl) {
    return { ok: false as const, error: 'Source file not found', code: 'INVALID_FILE' };
  }

  if (file.mimeType && !EVENT_MEDIA_GROUP_REGISTRATION_TYPES.includes(file.mimeType as typeof EVENT_MEDIA_GROUP_REGISTRATION_TYPES[number])) {
    return { ok: false as const, error: 'Invalid file type', code: 'INVALID_FILE' };
  }

  const response = await fetch(file.blobUrl);
  if (!response.ok) {
    return { ok: false as const, error: 'Failed to load upload file', code: 'INVALID_FILE' };
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  try {
    if (file.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
      const { read, utils } = await import('xlsx');
      const workbook = read(buffer, { type: 'buffer' });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        return { ok: false as const, error: 'Excel file must include at least one sheet', code: 'INVALID_FILE' };
      }
      const firstSheet = workbook.Sheets[firstSheetName];
      const csvText = utils.sheet_to_csv(firstSheet, { blankrows: false });
      const parsed = parseCsv(csvText);
      return { ok: true as const, parsed };
    }

    const csvText = buffer.toString('utf8');
    const parsed = parseCsv(csvText);
    return { ok: true as const, parsed };
  } catch {
    return { ok: false as const, error: 'Invalid registration file', code: 'INVALID_FILE' };
  }
}

function computeInviteExpiresAt(now: Date): Date {
  return new Date(now.getTime() + INVITE_HOLD_HOURS * 60 * 60 * 1000);
}

async function resolveMediaRecordByUrl(params: { blobUrl: string; organizationId: string }) {
  const { blobUrl, organizationId } = params;

  if (
    !blobUrl.includes('vercel-storage.com') &&
    !blobUrl.includes('blob.vercel-storage.com')
  ) {
    return null;
  }

  const MAX_MEDIA_LOOKUP_ATTEMPTS = 3;
  let record: typeof media.$inferSelect | null = null;

  for (let attempt = 0; attempt < MAX_MEDIA_LOOKUP_ATTEMPTS; attempt += 1) {
    record =
      (await db.query.media.findFirst({
        where: and(
          eq(media.organizationId, organizationId),
          eq(media.blobUrl, blobUrl),
          isNull(media.deletedAt),
        ),
      })) ?? null;

    if (record) break;

    if (attempt < MAX_MEDIA_LOOKUP_ATTEMPTS - 1) {
      await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
    }
  }

  if (record) return record;

  try {
    const [created] = await db
      .insert(media)
      .values({
        organizationId,
        blobUrl,
        kind: 'document',
      })
      .returning();

    return created ?? null;
  } catch (error) {
    console.warn('[group-upload] Failed to persist media record for uploaded roster:', error);
    return null;
  }
}

// =============================================================================
// Schemas
// =============================================================================

const createUploadLinkSchema = z.object({
  editionId: z.string().uuid(),
  name: z.string().max(255).optional().nullable(),
  paymentResponsibility: z.enum(PAYMENT_RESPONSIBILITIES).default('self_pay'),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
  maxBatches: z.number().int().positive().optional().nullable(),
  maxInvites: z.number().int().positive().optional().nullable(),
});

const revokeUploadLinkSchema = z.object({
  uploadLinkId: z.string().uuid(),
});

const listUploadLinksSchema = z.object({
  editionId: z.string().uuid(),
});

const createBatchSchema = z.object({
  uploadToken: z.string().min(1),
  distanceId: z.string().uuid(),
});

const uploadBatchSchema = z.object({
  uploadToken: z.string().min(1),
  batchId: z.string().uuid(),
  mediaUrl: z.string().url(),
});

const reserveInvitesSchema = z.object({
  uploadToken: z.string().min(1),
  batchId: z.string().uuid(),
  limit: z.number().int().positive().max(100).optional(),
  locale: z.string().min(2).max(10),
});

const sendInvitesSchema = z.object({
  uploadToken: z.string().min(1),
  batchId: z.string().uuid(),
  limit: z.number().int().positive().max(50).optional(),
});

const resendInviteSchema = z.object({
  uploadToken: z.string().min(1),
  inviteId: z.string().uuid(),
});

const rotateInviteSchema = z.object({
  uploadToken: z.string().min(1),
  inviteId: z.string().uuid(),
});

const updateInviteEmailSchema = z.object({
  uploadToken: z.string().min(1),
  inviteId: z.string().uuid(),
  email: z.string().email(),
});

const cancelInviteSchema = z.object({
  uploadToken: z.string().min(1),
  inviteId: z.string().uuid(),
});

const cancelBatchSchema = z.object({
  uploadToken: z.string().min(1),
  batchId: z.string().uuid(),
});

// =============================================================================
// Dashboard Actions (Organizer Staff)
// =============================================================================

export const createUploadLink = withAuthenticatedUser<
  ActionResult<{ uploadLinkId: string; token: string; tokenPrefix: string }>
>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof createUploadLinkSchema>) => {
  const accessError = checkEventsAccess(authContext);
  if (accessError) {
    return { ok: false, ...accessError };
  }


  const validated = createUploadLinkSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { editionId, name, paymentResponsibility, startsAt, endsAt, maxBatches, maxInvites } =
    validated.data;

  if (!authContext.permissions.canManageEvents) {
    const membership = await canUserAccessEvent(authContext.user.id, editionId);
    try {
      requireOrgPermission(membership, 'canEditRegistrationSettings');
    } catch {
      return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
    }
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
  const accessError = checkEventsAccess(authContext);
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

  if (!authContext.permissions.canManageEvents) {
    const membership = await canUserAccessEvent(authContext.user.id, link.editionId);
    try {
      requireOrgPermission(membership, 'canEditRegistrationSettings');
    } catch {
      return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
    }
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
  const accessError = checkEventsAccess(authContext);
  if (accessError) {
    return { ok: false, ...accessError };
  }


  const validated = listUploadLinksSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  if (!authContext.permissions.canManageEvents) {
    const membership = await canUserAccessEvent(authContext.user.id, validated.data.editionId);
    try {
      requireOrgPermission(membership, 'canEditRegistrationSettings');
    } catch {
      return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
    }
  }

  const links = await db.query.groupUploadLinks.findMany({
    where: eq(groupUploadLinks.editionId, validated.data.editionId),
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });

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
    .where(eq(registrationInvites.editionId, validated.data.editionId))
    .groupBy(registrationInvites.uploadLinkId);

  const batchCountMap = new Map(batchCounts.map((row) => [row.uploadLinkId ?? '', row.count]));
  const inviteCountMap = new Map(inviteCounts.map((row) => [row.uploadLinkId ?? '', row.count]));
  const now = new Date();

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

  const { uploadToken, distanceId } = validated.data;
  const linkResult = await getUploadLinkByToken({ token: uploadToken });

  if (!linkResult.link || linkResult.status !== 'ACTIVE') {
    return { ok: false, error: 'Upload link not available', code: 'LINK_INVALID' };
  }

  const rateLimit = await checkRateLimit(authContext.user.id, 'user', {
    action: `group_upload_batch_${linkResult.link.id}`,
    maxRequests: GROUP_UPLOAD_CREATE_BATCH_MAX_REQUESTS,
    windowMs: GROUP_UPLOAD_CREATE_BATCH_WINDOW_MS,
  });

  if (!rateLimit.allowed) {
    return { ok: false, error: 'Too many requests. Please try again later.', code: 'RATE_LIMITED' };
  }

  const distance = await db.query.eventDistances.findFirst({
    where: and(
      eq(eventDistances.id, distanceId),
      eq(eventDistances.editionId, linkResult.link.editionId),
      isNull(eventDistances.deletedAt),
    ),
  });

  if (!distance) {
    return { ok: false, error: 'Distance not found for this event', code: 'INVALID_DISTANCE' };
  }

  const edition = await db.query.eventEditions.findFirst({
    where: and(eq(eventEditions.id, linkResult.link.editionId), isNull(eventEditions.deletedAt)),
    with: { series: true },
  });

  if (!edition?.series) {
    return { ok: false, error: 'Event edition not found', code: 'NOT_FOUND' };
  }

  const [created] = await db
    .insert(groupRegistrationBatches)
    .values({
      editionId: linkResult.link.editionId,
      uploadLinkId: linkResult.link.id,
      distanceId: distance.id,
      paymentResponsibility: linkResult.link.paymentResponsibility,
      createdByUserId: authContext.user.id,
      status: 'uploaded',
    })
    .returning({ id: groupRegistrationBatches.id });

  const requestContext = await getRequestContext(await headers());
  const auditResult = await createAuditLog(
    {
      organizationId: edition.series.organizationId,
      actorUserId: authContext.user.id,
      action: 'group_upload_batch.create',
      entityType: 'group_registration_batch',
      entityId: created.id,
      after: { uploadLinkId: linkResult.link.id, distanceId: distance.id },
      request: requestContext,
    },
    db,
  );

  if (!auditResult.ok) {
    return { ok: false, error: 'Failed to create audit log', code: 'AUDIT_FAILED' };
  }

  return { ok: true, data: { batchId: created.id } };
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

  try {
    const access = await getBatchForCoordinatorOrThrow({
      batchId: validated.data.batchId,
      uploadToken: validated.data.uploadToken,
      authContext,
    });

    const existingRows = await db.query.groupRegistrationBatchRows.findFirst({
      where: eq(groupRegistrationBatchRows.batchId, access.batch.id),
      columns: { id: true },
    });

    if (existingRows) {
      return { ok: false, error: 'Batch already uploaded', code: 'ALREADY_UPLOADED' };
    }

    const edition = await db.query.eventEditions.findFirst({
      where: and(eq(eventEditions.id, access.batch.editionId), isNull(eventEditions.deletedAt)),
      with: { series: true },
    });

    if (!edition?.series) {
      return { ok: false, error: 'Event edition not found', code: 'NOT_FOUND' };
    }

    const mediaRecord = await resolveMediaRecordByUrl({
      blobUrl: validated.data.mediaUrl,
      organizationId: edition.series.organizationId,
    });

    if (!mediaRecord) {
      return { ok: false, error: 'Uploaded file not found', code: 'INVALID_FILE' };
    }

    const parsedResult = await parseRosterFile(mediaRecord.id);
    if (!parsedResult.ok) {
      return { ok: false, error: parsedResult.error, code: parsedResult.code };
    }

    const { headers, rows } = parsedResult.parsed;

    if (headers.length === 0) {
      return { ok: false, error: 'File is missing headers', code: 'INVALID_HEADERS' };
    }

    const headerIndex = buildHeaderIndex(headers);

    const missingHeaders = REQUIRED_HEADERS.filter((h) => !headerIndex.has(h));
    if (missingHeaders.length > 0) {
      return { ok: false, error: 'Headers do not match the expected template', code: 'INVALID_HEADERS' };
    }

    if (rows.length === 0) {
      return { ok: false, error: 'File has no data rows', code: 'NO_ROWS' };
    }

    if (rows.length > GROUP_UPLOAD_MAX_ROWS) {
      return {
        ok: false,
        error: `File exceeds maximum of ${GROUP_UPLOAD_MAX_ROWS} rows`,
        code: 'TOO_MANY_ROWS',
      };
    }

    const emails = Array.from(
      new Set(
        rows
          .map((row) => normalizeEmail(getCell(row, headerIndex, 'email')))
          .filter(Boolean),
      ),
    );

    const emailCounts = new Map<string, number>();
    for (const row of rows) {
      const normalized = normalizeEmail(getCell(row, headerIndex, 'email'));
      if (!normalized) continue;
      emailCounts.set(normalized, (emailCounts.get(normalized) ?? 0) + 1);
    }

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

    let errorCount = 0;
    const rowInserts: Array<typeof groupRegistrationBatchRows.$inferInsert> = [];

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const rowIndex = i + 2;

      const firstName = getCell(row, headerIndex, 'firstName').trim();
      const lastName = getCell(row, headerIndex, 'lastName').trim();
      const emailRaw = getCell(row, headerIndex, 'email');
      const emailNormalized = normalizeEmail(emailRaw);
      const dateOfBirth = parseIsoDate(getCell(row, headerIndex, 'dateOfBirth'));
      const phone = getCell(row, headerIndex, 'phone').trim() || null;
      const gender = getCell(row, headerIndex, 'gender').trim() || null;
      const genderIdentity = getCell(row, headerIndex, 'genderIdentity').trim() || null;
      const city = getCell(row, headerIndex, 'city').trim() || null;
      const state = getCell(row, headerIndex, 'state').trim() || null;
      const country = getCell(row, headerIndex, 'country').trim() || null;
      const emergencyContactName = getCell(row, headerIndex, 'emergencyContactName').trim() || null;
      const emergencyContactPhone = getCell(row, headerIndex, 'emergencyContactPhone').trim() || null;

      const errors: string[] = [];

      if (!firstName) errors.push('MISSING_FIRST_NAME');
      if (!lastName) errors.push('MISSING_LAST_NAME');
      if (!emailNormalized) errors.push('MISSING_EMAIL');
      if (emailNormalized && !z.string().email().safeParse(emailNormalized).success) {
        errors.push('INVALID_EMAIL');
      }
      if (!dateOfBirth) errors.push('INVALID_DOB');

      if (emailNormalized && (emailCounts.get(emailNormalized) ?? 0) > 1) {
        errors.push('DUPLICATE_EMAIL_IN_FILE');
      }

      if (emailNormalized && dateOfBirth) {
        const match = userByEmail.get(emailNormalized);
        if (match?.dateOfBirth) {
          const matchDob = toIsoDateString(match.dateOfBirth);
          if (matchDob && matchDob !== dateOfBirth) {
            errors.push('DOB_MISMATCH');
          }
        }
      }

      if (errors.length > 0) {
        errorCount += 1;
      }

      rowInserts.push({
        batchId: access.batch.id,
        rowIndex,
        rawJson: {
          firstName,
          lastName,
          email: emailRaw.trim(),
          emailNormalized,
          dateOfBirth: dateOfBirth ?? null,
          phone,
          gender,
          genderIdentity,
          city,
          state,
          country,
          emergencyContactName,
          emergencyContactPhone,
        },
        validationErrorsJson: errors,
      });
    }

    await db.transaction(async (tx) => {
      await tx
        .update(groupRegistrationBatches)
        .set({
          sourceFileMediaId: mediaRecord.id,
          status: 'validated',
        })
        .where(eq(groupRegistrationBatches.id, access.batch.id));

      if (rowInserts.length > 0) {
        await tx.insert(groupRegistrationBatchRows).values(rowInserts);
      }
    });

    return { ok: true, data: { batchId: access.batch.id, rowCount: rows.length, errorCount } };
  } catch (error) {
    if (error instanceof BatchAccessError) {
      return { ok: false, error: error.message, code: error.code };
    }

    throw error;
  }
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

  const limit = validated.data.limit ?? GROUP_UPLOAD_RESERVE_CHUNK_SIZE;

  try {
    const access = await getBatchForCoordinatorOrThrow({
      batchId: validated.data.batchId,
      uploadToken: validated.data.uploadToken,
      authContext,
    });

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

    const inviteLocale =
      edition.primaryLocale || edition.series.primaryLocale || validated.data.locale;

    const rowsToProcess = await db.query.groupRegistrationBatchRows.findMany({
      where: and(
        eq(groupRegistrationBatchRows.batchId, access.batch.id),
        isNull(groupRegistrationBatchRows.createdRegistrationId),
      ),
      orderBy: (table, { asc }) => [asc(table.rowIndex)],
    });

    const eligibleRows = rowsToProcess.filter((row) => (row.validationErrorsJson ?? []).length === 0);
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
    let failed = 0;

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
              typeof raw.emergencyContactPhone === 'string' ? raw.emergencyContactPhone : undefined,
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
              expiresAt: computeInviteExpiresAt(now),
              paymentResponsibility: access.batch.paymentResponsibility,
              pricing: {
                basePriceCents,
                feesCents,
                taxCents: 0,
                totalCents,
              },
              registrantSnapshot,
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
            createdByUserId: authContext.user.id,
            email: typeof raw.email === 'string' ? raw.email : emailNormalized,
            emailNormalized,
            dateOfBirth: dateOfBirthDate,
            inviteLocale,
            tokenHash: inviteTokenHash,
            tokenPrefix: getTokenPrefix(inviteToken),
            status: 'draft',
            expiresAt: createdRegistration.expiresAt ?? computeInviteExpiresAt(now),
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
          // Mark processed only once (idempotent) to avoid double-applying discounts.
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
            orderBy: (r, { desc }) => [desc(r.minParticipants)],
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
            const basePriceCents = registration.basePriceCents ?? 0;
            const discountAmountCents = Math.round((basePriceCents * percentOff) / 100);
            if (discountAmountCents <= 0) continue;

            const totalBefore = registration.totalCents ?? basePriceCents;

            await tx
              .update(registrations)
              .set({
                basePriceCents: Math.max(basePriceCents - discountAmountCents, 0),
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
                actorUserId: authContext.user.id,
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
        processed: targetRows.length,
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

  const limit = validated.data.limit ?? GROUP_UPLOAD_INVITE_SEND_CHUNK_SIZE;

  try {
    const access = await getBatchForCoordinatorOrThrow({
      batchId: validated.data.batchId,
      uploadToken: validated.data.uploadToken,
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

    const rateLimit = await checkRateLimit(`${authContext.user.id}:${access.batch.id}`, 'user', {
      action: 'group_upload_invite_send',
      maxRequests: 1,
      windowMs: INVITE_SEND_RATE_WINDOW_MS,
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
      if (invite.sendCount >= INVITE_SEND_MAX_COUNT) {
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
          actorUserId: authContext.user.id,
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
});

export const resendInvite = withAuthenticatedUser<ActionResult>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof resendInviteSchema>) => {

  const validated = resendInviteSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const invite = await db.query.registrationInvites.findFirst({
    where: eq(registrationInvites.id, validated.data.inviteId),
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
      uploadToken: validated.data.uploadToken,
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

  if (invite.sendCount >= INVITE_SEND_MAX_COUNT) {
    return { ok: false, error: 'Invite resend limit reached', code: 'RESEND_LIMIT' };
  }

  const now = new Date();
  if (!invite.expiresAt || invite.expiresAt <= now) {
    return { ok: false, error: 'Invite has expired', code: 'INVITE_EXPIRED' };
  }

  if (!invite.registration || invite.registration.status === 'cancelled' || !invite.registration.expiresAt || invite.registration.expiresAt <= now) {
    return { ok: false, error: 'Invite has expired', code: 'INVITE_EXPIRED' };
  }

  const rateLimit = await checkRateLimit(`${authContext.user.id}:${invite.id}`, 'user', {
    action: 'group_upload_invite_resend',
    maxRequests: 1,
    windowMs: INVITE_SEND_RATE_WINDOW_MS,
  });

  if (!rateLimit.allowed) {
    return { ok: false, error: 'Please wait before resending', code: 'RATE_LIMITED' };
  }
  if (invite.lastSentAt && now.getTime() - invite.lastSentAt.getTime() < INVITE_RESEND_COOLDOWN_MS) {
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
});

export const rotateInviteToken = withAuthenticatedUser<ActionResult>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof rotateInviteSchema>) => {

  const validated = rotateInviteSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const invite = await db.query.registrationInvites.findFirst({
    where: eq(registrationInvites.id, validated.data.inviteId),
  });

  if (!invite) {
    return { ok: false, error: 'Invite not found', code: 'NOT_FOUND' };
  }

  try {
    await getBatchForCoordinatorOrThrow({
      batchId: invite.batchId,
      uploadToken: validated.data.uploadToken,
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

  if (!registration || registration.status === 'cancelled' || !registration.expiresAt || registration.expiresAt <= now) {
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
    return { ok: false, error: 'Another active invite already exists', code: 'EXISTING_ACTIVE_INVITE' };
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
      createdByUserId: authContext.user.id,
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
});

export const updateInviteEmail = withAuthenticatedUser<ActionResult>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof updateInviteEmailSchema>) => {

  const validated = updateInviteEmailSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const invite = await db.query.registrationInvites.findFirst({
    where: eq(registrationInvites.id, validated.data.inviteId),
  });

  if (!invite) {
    return { ok: false, error: 'Invite not found', code: 'NOT_FOUND' };
  }

  try {
    await getBatchForCoordinatorOrThrow({
      batchId: invite.batchId,
      uploadToken: validated.data.uploadToken,
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

  if (!registration || registration.status === 'cancelled' || !registration.expiresAt || registration.expiresAt <= now) {
    return { ok: false, error: 'Invite has expired', code: 'INVITE_EXPIRED' };
  }

  const emailNormalized = normalizeEmail(validated.data.email);

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
    return { ok: false, error: 'Another active invite already exists', code: 'EXISTING_ACTIVE_INVITE' };
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
      createdByUserId: authContext.user.id,
      email: validated.data.email,
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
        rawJson: sql`jsonb_set(jsonb_set(${groupRegistrationBatchRows.rawJson}, '{email}', to_jsonb(${validated.data.email})), '{emailNormalized}', to_jsonb(${emailNormalized}))`,
      })
      .where(eq(groupRegistrationBatchRows.id, invite.batchRowId));
  });

  return { ok: true, data: undefined };
});

export const cancelInvite = withAuthenticatedUser<ActionResult>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof cancelInviteSchema>) => {

  const validated = cancelInviteSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const invite = await db.query.registrationInvites.findFirst({
    where: eq(registrationInvites.id, validated.data.inviteId),
  });

  if (!invite) {
    return { ok: false, error: 'Invite not found', code: 'NOT_FOUND' };
  }

  try {
    await getBatchForCoordinatorOrThrow({
      batchId: invite.batchId,
      uploadToken: validated.data.uploadToken,
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
        actorUserId: authContext.user.id,
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
