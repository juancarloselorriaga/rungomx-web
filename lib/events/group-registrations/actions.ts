'use server';

import { and, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import { headers } from 'next/headers';
import { z } from 'zod';

import { db } from '@/db';
import {
  addOnOptions,
  addOnSelections,
  addOns,
  eventDistances,
  eventEditions,
  groupDiscountRules,
  groupRegistrationBatchRows,
  groupRegistrationBatches,
  media,
  profiles,
  pricingTiers,
  registrants,
  registrations,
  users,
} from '@/db/schema';
import { createAuditLog, getRequestContext } from '@/lib/audit';
import { withAuthenticatedUser } from '@/lib/auth/action-wrapper';
import type { AuthContext } from '@/lib/auth/server';
import { isEventsNoPaymentMode } from '@/lib/features/flags';
import { canUserAccessEvent, requireOrgPermission } from '@/lib/organizations/permissions';
import { checkRateLimit } from '@/lib/rate-limit';
import { computeExpiresAt } from '@/lib/events/registration-holds';
import { eventEditionDetailTag, eventEditionRegistrationsTag, publicEventBySlugTag } from '@/lib/events/cache-tags';
import { safeRevalidateTag } from '@/lib/next-cache';
import { normalizeEmail, parseIsoDate } from '@/lib/events/shared/identity';

import {
  GROUP_REGISTRATION_TEMPLATE_EXAMPLE_ROW,
  GROUP_REGISTRATION_TEMPLATE_HEADERS,
  generateGroupRegistrationTemplateCsv,
  parseCsv,
} from './csv';

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string };

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

const systemBuyerEmail = 'group-registrations@system.rungomx';
const systemBuyerName = 'RunGoMX Group Registrations';

function parsePositiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

const GROUP_REGISTRATION_UPLOAD_MAX_REQUESTS = parsePositiveIntegerEnv(
  'EVENTS_GROUP_REGISTRATION_UPLOAD_MAX_REQUESTS',
  6,
);

const GROUP_REGISTRATION_UPLOAD_WINDOW_MS = parsePositiveIntegerEnv(
  'EVENTS_GROUP_REGISTRATION_UPLOAD_WINDOW_MS',
  10 * 60 * 1000,
);

type DbLike = Pick<typeof db, 'query' | 'insert'>;

async function getOrCreateSystemBuyerUserId(tx: DbLike): Promise<string> {
  const existing = await tx.query.users.findFirst({
    where: and(eq(users.email, systemBuyerEmail), isNull(users.deletedAt)),
    columns: { id: true },
  });

  if (existing) return existing.id;

  const [created] = await tx
    .insert(users)
    .values({
      name: systemBuyerName,
      email: systemBuyerEmail,
      emailVerified: true,
    })
    .returning({ id: users.id });

  return created.id;
}

const groupTemplateDownloadSchema = z.object({
  editionId: z.string().uuid(),
});

export const downloadGroupTemplate = withAuthenticatedUser<
  ActionResult<{ csv: string; filename: string }>
>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof groupTemplateDownloadSchema>) => {
  const accessError = checkEventsAccess(authContext);
  if (accessError) {
    return { ok: false, ...accessError };
  }

  const validated = groupTemplateDownloadSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { editionId } = validated.data;

  const membership = await canUserAccessEvent(authContext.user.id, editionId);
  try {
    requireOrgPermission(membership, 'canEditRegistrationSettings');
  } catch {
    return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
  }

  const edition = await db.query.eventEditions.findFirst({
    where: and(eq(eventEditions.id, editionId), isNull(eventEditions.deletedAt)),
    columns: { slug: true },
    with: { series: { columns: { slug: true } } },
  });

  if (!edition?.series?.slug) {
    return { ok: false, error: 'Event edition not found', code: 'NOT_FOUND' };
  }

  const csv = generateGroupRegistrationTemplateCsv();
  const filename = `group-registration-template-${edition.series.slug}-${edition.slug}.csv`;

  return { ok: true, data: { csv, filename } };
});

export const downloadGroupTemplateXlsx = withAuthenticatedUser<
  ActionResult<{ xlsxBase64: string; filename: string; mimeType: string }>
>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof groupTemplateDownloadSchema>) => {
  const accessError = checkEventsAccess(authContext);
  if (accessError) {
    return { ok: false, ...accessError };
  }

  const validated = groupTemplateDownloadSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { editionId } = validated.data;

  const membership = await canUserAccessEvent(authContext.user.id, editionId);
  try {
    requireOrgPermission(membership, 'canEditRegistrationSettings');
  } catch {
    return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
  }

  const edition = await db.query.eventEditions.findFirst({
    where: and(eq(eventEditions.id, editionId), isNull(eventEditions.deletedAt)),
    columns: { slug: true },
    with: { series: { columns: { slug: true } } },
  });

  if (!edition?.series?.slug) {
    return { ok: false, error: 'Event edition not found', code: 'NOT_FOUND' };
  }

  const rows = [
    Array.from(GROUP_REGISTRATION_TEMPLATE_HEADERS),
    Array.from(GROUP_REGISTRATION_TEMPLATE_EXAMPLE_ROW),
  ];

  const { utils, write } = await import('xlsx');

  const ws = utils.aoa_to_sheet(rows);
  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, 'Template');

  const buffer = write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  const xlsxBase64 = buffer.toString('base64');

  const filename = `group-registration-template-${edition.series.slug}-${edition.slug}.xlsx`;

  return {
    ok: true,
    data: {
      xlsxBase64,
      filename,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
  };
});

const uploadGroupBatchSchema = z
  .object({
    editionId: z.string().uuid(),
    csvText: z.string().min(1).max(2_000_000).optional(),
    xlsxBase64: z.string().min(1).max(4_000_000).optional(),
    filename: z.string().max(255).optional(),
    sourceFileMediaId: z.string().uuid().optional(),
  })
  .refine((value) => Boolean(value.csvText) !== Boolean(value.xlsxBase64), {
    message: 'Either csvText or xlsxBase64 is required',
    path: ['csvText'],
  });

type UploadGroupBatchResult = {
  batchId: string;
  status: string;
  rowCount: number;
  errorCount: number;
};

const REQUIRED_HEADERS = ['firstName', 'lastName', 'email', 'dateOfBirth'] as const;
const DISTANCE_HEADERS = ['distanceId', 'distanceLabel'] as const;
const ADD_ON_SELECTIONS_HEADER = 'addOnSelections';

type ParsedAddOnSelection = {
  optionId: string;
  quantity: number;
};

function parseAddOnSelectionsJson(value: string): ParsedAddOnSelection[] | { error: string } {
  const trimmed = value.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed)) {
      return { error: 'addOnSelections must be a JSON array' };
    }

    const selections: ParsedAddOnSelection[] = [];
    const seen = new Set<string>();

    for (const item of parsed) {
      if (!item || typeof item !== 'object') {
        return { error: 'addOnSelections must be an array of objects' };
      }
      const optionId = (item as { optionId?: unknown }).optionId;
      const quantityRaw = (item as { quantity?: unknown }).quantity;

      if (typeof optionId !== 'string' || !z.string().uuid().safeParse(optionId).success) {
        return { error: 'addOnSelections.optionId must be a UUID' };
      }

      const quantity =
        typeof quantityRaw === 'number' && Number.isInteger(quantityRaw) ? quantityRaw : 1;

      if (!Number.isFinite(quantity) || quantity <= 0) {
        return { error: 'addOnSelections.quantity must be a positive integer' };
      }

      if (seen.has(optionId)) {
        return { error: 'addOnSelections contains duplicate optionId values' };
      }
      seen.add(optionId);

      selections.push({ optionId, quantity });
    }

    return selections;
  } catch {
    return { error: 'addOnSelections must be valid JSON' };
  }
}

function parseStoredAddOnSelections(value: unknown): ParsedAddOnSelection[] | null {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) return null;

  const seen = new Set<string>();
  const selections: ParsedAddOnSelection[] = [];

  for (const item of value) {
    if (!item || typeof item !== 'object') return null;
    const optionId = (item as { optionId?: unknown }).optionId;
    const quantityRaw = (item as { quantity?: unknown }).quantity;

    if (typeof optionId !== 'string' || !z.string().uuid().safeParse(optionId).success) {
      return null;
    }

    const quantity =
      typeof quantityRaw === 'number' && Number.isInteger(quantityRaw) ? quantityRaw : 1;

    if (!Number.isFinite(quantity) || quantity <= 0) {
      return null;
    }

    if (seen.has(optionId)) return null;
    seen.add(optionId);

    selections.push({ optionId, quantity });
  }

  return selections;
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

export const uploadGroupBatch = withAuthenticatedUser<ActionResult<UploadGroupBatchResult>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof uploadGroupBatchSchema>) => {
  const accessError = checkEventsAccess(authContext);
  if (accessError) {
    return { ok: false, ...accessError };
  }

  const validated = uploadGroupBatchSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { editionId, sourceFileMediaId } = validated.data;

  const membership = await canUserAccessEvent(authContext.user.id, editionId);
  try {
    requireOrgPermission(membership, 'canEditRegistrationSettings');
  } catch {
    return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
  }

  const rateLimit = await checkRateLimit(authContext.user.id, 'user', {
    action: 'group_registration_upload',
    maxRequests: GROUP_REGISTRATION_UPLOAD_MAX_REQUESTS,
    windowMs: GROUP_REGISTRATION_UPLOAD_WINDOW_MS,
  });
  if (!rateLimit.allowed) {
    return { ok: false, error: 'Too many uploads. Please try again later.', code: 'RATE_LIMITED' };
  }

  let parsed: ReturnType<typeof parseCsv>;
  try {
    if (validated.data.csvText) {
      parsed = parseCsv(validated.data.csvText);
    } else {
      const { read, utils } = await import('xlsx');
      const buffer = Buffer.from(validated.data.xlsxBase64 ?? '', 'base64');
      const workbook = read(buffer, { type: 'buffer' });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        return { ok: false, error: 'Excel file must include at least one sheet', code: 'INVALID_XLSX' };
      }
      const firstSheet = workbook.Sheets[firstSheetName];
      const csvText = utils.sheet_to_csv(firstSheet, { blankrows: false });
      parsed = parseCsv(csvText);
    }
  } catch {
    return { ok: false, error: 'Invalid registration file', code: 'INVALID_FILE' };
  }

  const fileHeaders = parsed.headers;
  const rows = parsed.rows;

  if (fileHeaders.length === 0) {
    return { ok: false, error: 'File is missing headers', code: 'INVALID_HEADERS' };
  }

  const headerIndex = buildHeaderIndex(fileHeaders);

  const missingHeaders = REQUIRED_HEADERS.filter((h) => !headerIndex.has(h));
  const hasDistanceHeader = DISTANCE_HEADERS.some((h) => headerIndex.has(h));

  if (missingHeaders.length > 0 || !hasDistanceHeader) {
    return { ok: false, error: 'Headers do not match the expected template', code: 'INVALID_HEADERS' };
  }

  if (rows.length === 0) {
    return { ok: false, error: 'File has no data rows', code: 'NO_ROWS' };
  }

  const MAX_ROWS = 1000;
  if (rows.length > MAX_ROWS) {
    return { ok: false, error: `File exceeds maximum of ${MAX_ROWS} rows`, code: 'TOO_MANY_ROWS' };
  }

  const edition = await db.query.eventEditions.findFirst({
    where: and(eq(eventEditions.id, editionId), isNull(eventEditions.deletedAt)),
    with: { series: true },
  });
  if (!edition?.series) {
    return { ok: false, error: 'Event edition not found', code: 'NOT_FOUND' };
  }

  if (sourceFileMediaId) {
    const existingMedia = await db.query.media.findFirst({
      where: and(
        eq(media.id, sourceFileMediaId),
        eq(media.organizationId, edition.series.organizationId),
        isNull(media.deletedAt),
      ),
      columns: { id: true },
    });

    if (!existingMedia) {
      return { ok: false, error: 'Source file media not found', code: 'VALIDATION_ERROR' };
    }
  }

  const [distances, reservedCounts, editionAddOns] = await Promise.all([
    db.query.eventDistances.findMany({
      where: and(eq(eventDistances.editionId, editionId), isNull(eventDistances.deletedAt)),
      columns: {
        id: true,
        label: true,
        capacity: true,
        capacityScope: true,
      },
    }),
    db
      .select({
        distanceId: registrations.distanceId,
        count: sql<number>`count(*)::int`,
      })
      .from(registrations)
      .where(
        and(
          eq(registrations.editionId, editionId),
          or(
            eq(registrations.status, 'confirmed'),
            and(
              or(
                eq(registrations.status, 'started'),
                eq(registrations.status, 'submitted'),
                eq(registrations.status, 'payment_pending'),
              ),
              gt(registrations.expiresAt, new Date()),
            ),
          ),
          isNull(registrations.deletedAt),
        ),
      )
      .groupBy(registrations.distanceId),
    db.query.addOns.findMany({
      where: and(eq(addOns.editionId, editionId), eq(addOns.isActive, true), isNull(addOns.deletedAt)),
      columns: { id: true, distanceId: true },
      with: {
        options: {
          where: and(eq(addOnOptions.isActive, true), isNull(addOnOptions.deletedAt)),
          columns: { id: true, priceCents: true, maxQtyPerOrder: true },
        },
      },
    }),
  ]);

  const reservedCountByDistanceId = new Map(reservedCounts.map((r) => [r.distanceId, Number(r.count)]));

  const distanceById = new Map(distances.map((d) => [d.id, d]));
  const distanceByLabel = new Map(distances.map((d) => [d.label.trim().toLowerCase(), d]));

  const addOnOptionById = new Map<
    string,
    { priceCents: number; maxQtyPerOrder: number; distanceId: string | null }
  >();
  for (const addOn of editionAddOns) {
    for (const option of addOn.options) {
      addOnOptionById.set(option.id, {
        priceCents: option.priceCents,
        maxQtyPerOrder: option.maxQtyPerOrder,
        distanceId: addOn.distanceId,
      });
    }
  }

  const emails = Array.from(
    new Set(
      rows
        .map((row) => normalizeEmail(getCell(row, headerIndex, 'email')))
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

  const now = new Date();
  const requestContext = await getRequestContext(await headers());

  const batch = await db.transaction(async (tx) => {
    const [createdBatch] = await tx
      .insert(groupRegistrationBatches)
      .values({
        editionId,
        createdByUserId: authContext.user.id,
        status: 'uploaded',
        sourceFileMediaId: sourceFileMediaId ?? undefined,
      })
      .returning();

    const seenIdentityKeys = new Set<string>();
    let errorCount = 0;

    const rowInserts: Array<typeof groupRegistrationBatchRows.$inferInsert> = [];

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const rowIndex = i + 2; // 1 = headers

      const firstName = getCell(row, headerIndex, 'firstName').trim();
      const lastName = getCell(row, headerIndex, 'lastName').trim();
      const emailRaw = getCell(row, headerIndex, 'email');
      const email = normalizeEmail(emailRaw);
      const dateOfBirth = parseIsoDate(getCell(row, headerIndex, 'dateOfBirth'));
      const phone = getCell(row, headerIndex, 'phone').trim() || null;
      const gender = getCell(row, headerIndex, 'gender').trim() || null;
      const genderIdentity = getCell(row, headerIndex, 'genderIdentity').trim() || null;
      const city = getCell(row, headerIndex, 'city').trim() || null;
      const state = getCell(row, headerIndex, 'state').trim() || null;
      const country = getCell(row, headerIndex, 'country').trim() || null;
      const emergencyContactName = getCell(row, headerIndex, 'emergencyContactName').trim() || null;
      const emergencyContactPhone = getCell(row, headerIndex, 'emergencyContactPhone').trim() || null;

      const distanceIdInput = getCell(row, headerIndex, 'distanceId').trim();
      const distanceLabelInput = getCell(row, headerIndex, 'distanceLabel').trim();

      const errors: string[] = [];

      if (!firstName) errors.push('firstName is required');
      if (!lastName) errors.push('lastName is required');
      if (!email) errors.push('email is required');
      if (email && !z.string().email().safeParse(email).success) errors.push('email is invalid');
      if (!dateOfBirth) errors.push('dateOfBirth must be YYYY-MM-DD');

      let resolvedDistanceId: string | null = null;
      if (distanceIdInput) {
        if (!z.string().uuid().safeParse(distanceIdInput).success) {
          errors.push('distanceId must be a UUID');
        } else if (!distanceById.has(distanceIdInput)) {
          errors.push('distanceId does not exist in this edition');
        } else {
          resolvedDistanceId = distanceIdInput;
        }
      } else if (distanceLabelInput) {
        const match = distanceByLabel.get(distanceLabelInput.toLowerCase());
        if (!match) {
          errors.push('distanceLabel does not match any distance in this edition');
        } else {
          resolvedDistanceId = match.id;
        }
      } else {
        errors.push('distanceId or distanceLabel is required');
      }

      if (resolvedDistanceId) {
        const distance = distanceById.get(resolvedDistanceId);
        if (edition.sharedCapacity) {
          const totalReserved = Array.from(reservedCountByDistanceId.values()).reduce(
            (sum, count) => sum + count,
            0,
          );
          if (totalReserved >= edition.sharedCapacity) {
            errors.push('edition is sold out');
          }
        } else if (distance && distance.capacityScope !== 'shared_pool' && distance.capacity !== null) {
          const reserved = reservedCountByDistanceId.get(resolvedDistanceId) ?? 0;
          if (reserved >= distance.capacity) {
            errors.push('distance is sold out');
          }
        }
      }

      const addOnSelectionsCell = getCell(row, headerIndex, ADD_ON_SELECTIONS_HEADER);
      const parsedAddOnSelections = parseAddOnSelectionsJson(addOnSelectionsCell);
      const addOnSelections = Array.isArray(parsedAddOnSelections) ? parsedAddOnSelections : [];

      if (!Array.isArray(parsedAddOnSelections)) {
        errors.push(parsedAddOnSelections.error);
      }

      if (addOnSelections.length > 0 && !resolvedDistanceId) {
        errors.push('addOnSelections requires a valid distance');
      }

      if (resolvedDistanceId && addOnSelections.length > 0) {
        for (const selection of addOnSelections) {
          const option = addOnOptionById.get(selection.optionId);
          if (!option) {
            errors.push('addOnSelections contains an invalid optionId');
            continue;
          }

          if (option.distanceId && option.distanceId !== resolvedDistanceId) {
            errors.push('addOnSelections contains options not available for this distance');
          }

          if (selection.quantity > option.maxQtyPerOrder) {
            errors.push('addOnSelections quantity exceeds maxQtyPerOrder');
          }
        }
      }

      if (email && dateOfBirth) {
        const identityKey = `${email}|${dateOfBirth}`;
        if (seenIdentityKeys.has(identityKey)) {
          errors.push('duplicate row (email + dateOfBirth) in this file');
        } else {
          seenIdentityKeys.add(identityKey);
        }
      }

      let matchedUserId: string | null = null;
      if (email && dateOfBirth) {
        const match = userByEmail.get(email);
        if (match?.userId) {
          if (match.dateOfBirth) {
            const matchDob = match.dateOfBirth.toISOString().split('T')[0];
            if (matchDob !== dateOfBirth) {
              errors.push('existing account found with same email but different dateOfBirth');
            } else {
              matchedUserId = match.userId;
            }
          } else {
            matchedUserId = match.userId;
          }
        }
      }

      if (matchedUserId) {
        const existing = await tx.query.registrations.findFirst({
          where: and(
            eq(registrations.editionId, editionId),
            eq(registrations.buyerUserId, matchedUserId),
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
          columns: { id: true },
        });

        if (existing) {
          errors.push('user already has an active registration for this edition');
        }
      }

      if (errors.length > 0) {
        errorCount += 1;
      }

      rowInserts.push({
        batchId: createdBatch.id,
        rowIndex,
        rawJson: {
          firstName,
          lastName,
          email,
          dateOfBirth,
          phone,
          gender,
          genderIdentity,
          city,
          state,
          country,
          emergencyContactName,
          emergencyContactPhone,
          distanceId: resolvedDistanceId,
          distanceLabel: distanceLabelInput || null,
          addOnSelections,
          matchedUserId,
        },
        validationErrorsJson: errors,
      });
    }

    if (rowInserts.length > 0) {
      await tx.insert(groupRegistrationBatchRows).values(rowInserts);
    }

    const nextStatus = errorCount > 0 ? 'failed' : 'validated';

    await tx
      .update(groupRegistrationBatches)
      .set({ status: nextStatus })
      .where(eq(groupRegistrationBatches.id, createdBatch.id));

    const auditResult = await createAuditLog(
      {
        organizationId: edition.series.organizationId,
        actorUserId: authContext.user.id,
        action: 'group_registrations.upload',
        entityType: 'group_registration_batch',
        entityId: createdBatch.id,
        after: {
          editionId,
          status: nextStatus,
          rows: rowInserts.length,
          errors: errorCount,
          filename: validated.data.filename,
          sourceFileMediaId,
        },
        request: requestContext,
      },
      tx,
    );

    if (!auditResult.ok) {
      throw new Error('Failed to create audit log');
    }

    return { id: createdBatch.id, status: nextStatus, rowCount: rowInserts.length, errorCount };
  });

  return {
    ok: true,
    data: {
      batchId: batch.id,
      status: batch.status,
      rowCount: batch.rowCount,
      errorCount: batch.errorCount,
    },
  };
});

const getBatchStatusSchema = z.object({
  batchId: z.string().uuid(),
});

export const getGroupBatchStatus = withAuthenticatedUser<
  ActionResult<{
    id: string;
    editionId: string;
    status: string;
    createdAt: string;
    processedAt: string | null;
    rows: Array<{
      id: string;
      rowIndex: number;
      rawJson: Record<string, unknown>;
      validationErrors: string[];
      createdRegistrationId: string | null;
    }>;
  }>
>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof getBatchStatusSchema>) => {
  const accessError = checkEventsAccess(authContext);
  if (accessError) {
    return { ok: false, ...accessError };
  }

  const validated = getBatchStatusSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { batchId } = validated.data;

  const batch = await db.query.groupRegistrationBatches.findFirst({
    where: eq(groupRegistrationBatches.id, batchId),
    with: {
      rows: {
        orderBy: (r, { asc }) => [asc(r.rowIndex)],
      },
      edition: {
        columns: { id: true },
      },
    },
  });

  if (!batch) {
    return { ok: false, error: 'Batch not found', code: 'NOT_FOUND' };
  }

  const membership = await canUserAccessEvent(authContext.user.id, batch.editionId);
  try {
    requireOrgPermission(membership, 'canEditRegistrationSettings');
  } catch {
    return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
  }

  return {
    ok: true,
    data: {
      id: batch.id,
      editionId: batch.editionId,
      status: batch.status,
      createdAt: batch.createdAt.toISOString(),
      processedAt: batch.processedAt ? batch.processedAt.toISOString() : null,
      rows: batch.rows.map((r) => ({
        id: r.id,
        rowIndex: r.rowIndex,
        rawJson: r.rawJson ?? {},
        validationErrors: r.validationErrorsJson ?? [],
        createdRegistrationId: r.createdRegistrationId,
      })),
    },
  };
});

const processBatchSchema = z.object({
  batchId: z.string().uuid(),
});

type ProcessGroupBatchResult = {
  status: string;
  processedAt: string;
  createdCount: number;
  groupDiscountPercentOff: number | null;
};

export const processGroupBatch = withAuthenticatedUser<ActionResult<ProcessGroupBatchResult>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof processBatchSchema>) => {
  const accessError = checkEventsAccess(authContext);
  if (accessError) {
    return { ok: false, ...accessError };
  }

  const validated = processBatchSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { batchId } = validated.data;

  const batch = await db.query.groupRegistrationBatches.findFirst({
    where: eq(groupRegistrationBatches.id, batchId),
    with: {
      rows: {
        orderBy: (r, { asc }) => [asc(r.rowIndex)],
      },
      edition: {
        with: { series: true },
      },
    },
  });

  if (!batch?.edition?.series) {
    return { ok: false, error: 'Batch not found', code: 'NOT_FOUND' };
  }

  const membership = await canUserAccessEvent(authContext.user.id, batch.editionId);
  try {
    requireOrgPermission(membership, 'canEditRegistrationSettings');
  } catch {
    return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
  }

  if (batch.status === 'processed') {
    return {
      ok: true,
      data: {
        status: batch.status,
        processedAt: batch.processedAt?.toISOString() ?? new Date().toISOString(),
        createdCount: batch.rows.filter((r) => r.createdRegistrationId).length,
        groupDiscountPercentOff: null,
      },
    };
  }

  if (batch.status !== 'validated' && batch.status !== 'failed') {
    return { ok: false, error: 'Batch is not validated', code: 'INVALID_STATE' };
  }

  const rowsWithErrors = batch.rows.filter((r) => (r.validationErrorsJson?.length ?? 0) > 0);
  if (rowsWithErrors.length > 0) {
    return { ok: false, error: 'Batch contains validation errors', code: 'VALIDATION_ERROR' };
  }

  const now = new Date();

  const rawRows = batch.rows.map((r) => ({
    id: r.id,
    rowIndex: r.rowIndex,
    rawJson: r.rawJson ?? {},
  }));

  const distanceIds = Array.from(
    new Set(
      rawRows
        .map((r) => r.rawJson.distanceId)
        .filter((v): v is string => typeof v === 'string' && v.length > 0),
    ),
  );

  if (distanceIds.length === 0) {
    return { ok: false, error: 'No distances found in batch', code: 'VALIDATION_ERROR' };
  }

  const discountRules = await db.query.groupDiscountRules.findMany({
    where: and(
      eq(groupDiscountRules.editionId, batch.editionId),
      eq(groupDiscountRules.isActive, true),
    ),
    orderBy: (r, { desc }) => [desc(r.minParticipants)],
  });

  const participantCount = rawRows.length;
  const applicableRule =
    discountRules.find((rule) => participantCount >= rule.minParticipants) ?? null;
  const percentOff = applicableRule ? applicableRule.percentOff : null;
  const requestContext = await getRequestContext(await headers());

  try {
    const processedAt = await db.transaction(async (tx) => {
      const systemBuyerUserId = await getOrCreateSystemBuyerUserId(tx);

      const edition = await tx.query.eventEditions.findFirst({
        where: and(eq(eventEditions.id, batch.editionId), isNull(eventEditions.deletedAt)),
      });
      if (!edition) throw new Error('EDITION_NOT_FOUND');

      // Lock for capacity checks
      if (edition.sharedCapacity) {
        await tx.execute(sql`SELECT id FROM ${eventEditions} WHERE id = ${edition.id} FOR UPDATE`);
      } else {
        for (const distanceId of distanceIds) {
          await tx.execute(sql`SELECT id FROM ${eventDistances} WHERE id = ${distanceId} FOR UPDATE`);
        }
      }

      // Capacity enforcement
      const reservedInEdition = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(registrations)
        .where(
          and(
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
        );

      const reservedCount = Number(reservedInEdition[0]?.count ?? 0);
      if (edition.sharedCapacity && reservedCount + participantCount > edition.sharedCapacity) {
        throw new Error('INSUFFICIENT_CAPACITY');
      }

      if (!edition.sharedCapacity) {
        const perDistanceCounts = new Map<string, number>();
        for (const distanceId of distanceIds) {
          const [countRow] = await tx
            .select({ count: sql<number>`count(*)::int` })
            .from(registrations)
            .where(
              and(
                eq(registrations.distanceId, distanceId),
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
            );
          perDistanceCounts.set(distanceId, Number(countRow?.count ?? 0));
        }

        const distanceCaps = await tx.query.eventDistances.findMany({
          where: inArray(eventDistances.id, distanceIds),
          columns: { id: true, capacity: true },
        });
        const capByDistanceId = new Map(distanceCaps.map((d) => [d.id, d.capacity]));

        const batchCountByDistanceId = new Map<string, number>();
        for (const row of rawRows) {
          const distanceId = row.rawJson.distanceId;
          if (typeof distanceId !== 'string') continue;
          batchCountByDistanceId.set(distanceId, (batchCountByDistanceId.get(distanceId) ?? 0) + 1);
        }

        for (const [distanceId, batchCount] of batchCountByDistanceId.entries()) {
          const cap = capByDistanceId.get(distanceId);
          if (cap === undefined) {
            throw new Error('INVALID_ROW');
          }
          if (cap === null) continue;
          const reserved = perDistanceCounts.get(distanceId) ?? 0;
          if (reserved + batchCount > cap) {
            throw new Error('INSUFFICIENT_CAPACITY');
          }
        }
      }

      const distancesWithPricing = await tx.query.eventDistances.findMany({
        where: inArray(eventDistances.id, distanceIds),
        with: {
          pricingTiers: {
            where: isNull(pricingTiers.deletedAt),
            orderBy: (p, { asc }) => [asc(p.sortOrder)],
          },
        },
      });

      const distancePricing = new Map(
        distancesWithPricing.map((d) => [d.id, d.pricingTiers]),
      );

      const addOnSelectionsByRowId = new Map<string, ParsedAddOnSelection[]>();
      const optionIds: string[] = [];

      for (const row of rawRows) {
        const parsedSelections = parseStoredAddOnSelections(row.rawJson.addOnSelections);
        if (parsedSelections === null) {
          throw new Error('INVALID_ROW');
        }
        addOnSelectionsByRowId.set(row.id, parsedSelections);
        for (const selection of parsedSelections) {
          optionIds.push(selection.optionId);
        }
      }

      const uniqueOptionIds = Array.from(new Set(optionIds));
      const addOnOptionsById = new Map<
        string,
        { priceCents: number; maxQtyPerOrder: number; addOnDistanceId: string | null }
      >();

      if (uniqueOptionIds.length > 0) {
        const options = await tx.query.addOnOptions.findMany({
          where: and(
            inArray(addOnOptions.id, uniqueOptionIds),
            isNull(addOnOptions.deletedAt),
            eq(addOnOptions.isActive, true),
          ),
          with: { addOn: true },
        });

        if (options.length !== uniqueOptionIds.length) {
          throw new Error('INVALID_ROW');
        }

        for (const option of options) {
          const addOn = option.addOn;
          if (
            !addOn ||
            addOn.deletedAt !== null ||
            addOn.isActive !== true ||
            addOn.editionId !== edition.id
          ) {
            throw new Error('INVALID_ROW');
          }

          addOnOptionsById.set(option.id, {
            priceCents: option.priceCents,
            maxQtyPerOrder: option.maxQtyPerOrder,
            addOnDistanceId: addOn.distanceId,
          });
        }
      }

      const nextStatus = isEventsNoPaymentMode() ? 'confirmed' : 'payment_pending';
      const nextExpiresAt = nextStatus === 'confirmed' ? null : computeExpiresAt(now, 'payment_pending');

      let createdCount = 0;

      for (const row of rawRows) {
        const distanceId = row.rawJson.distanceId;
        if (typeof distanceId !== 'string') throw new Error('INVALID_ROW');

        const tiers = distancePricing.get(distanceId) ?? [];
        const activeTier =
          tiers
            .filter((t) => {
              if (t.startsAt && now < t.startsAt) return false;
              if (t.endsAt && now > t.endsAt) return false;
              return true;
            })
            .sort((a, b) => a.sortOrder - b.sortOrder)[0] ?? null;

        const basePriceCentsOriginal = activeTier?.priceCents ?? 0;
        const feesCents = Math.round(basePriceCentsOriginal * 0.05);
        const discountAmountCents =
          percentOff !== null ? Math.round((basePriceCentsOriginal * percentOff) / 100) : 0;
        const basePriceCents = Math.max(basePriceCentsOriginal - discountAmountCents, 0);
        const rowAddOnSelections = addOnSelectionsByRowId.get(row.id) ?? [];

        let addOnTotalCents = 0;
        for (const selection of rowAddOnSelections) {
          const option = addOnOptionsById.get(selection.optionId);
          if (!option) {
            throw new Error('INVALID_ROW');
          }

          if (selection.quantity > option.maxQtyPerOrder) {
            throw new Error('INVALID_ROW');
          }

          if (option.addOnDistanceId && option.addOnDistanceId !== distanceId) {
            throw new Error('INVALID_ROW');
          }

          addOnTotalCents += option.priceCents * selection.quantity;
        }

        const totalCents = basePriceCents + feesCents + addOnTotalCents;

        const matchedUserId = typeof row.rawJson.matchedUserId === 'string' ? row.rawJson.matchedUserId : null;
        const buyerUserId = matchedUserId ?? systemBuyerUserId;

        const [createdRegistration] = await tx
          .insert(registrations)
          .values({
            editionId: edition.id,
            distanceId,
            buyerUserId,
            status: nextStatus,
            basePriceCents,
            feesCents,
            taxCents: 0,
            totalCents,
            expiresAt: nextExpiresAt,
          })
          .returning({ id: registrations.id });

        if (rowAddOnSelections.length > 0) {
          await tx.insert(addOnSelections).values(
            rowAddOnSelections.map((selection) => {
              const option = addOnOptionsById.get(selection.optionId);
              if (!option) {
                throw new Error('INVALID_ROW');
              }

              return {
                registrationId: createdRegistration.id,
                optionId: selection.optionId,
                quantity: selection.quantity,
                lineTotalCents: option.priceCents * selection.quantity,
              };
            }),
          );
        }

        const snapshot = {
          firstName: typeof row.rawJson.firstName === 'string' ? row.rawJson.firstName : undefined,
          lastName: typeof row.rawJson.lastName === 'string' ? row.rawJson.lastName : undefined,
          email: typeof row.rawJson.email === 'string' ? row.rawJson.email : undefined,
          dateOfBirth: typeof row.rawJson.dateOfBirth === 'string' ? row.rawJson.dateOfBirth : undefined,
          gender: typeof row.rawJson.gender === 'string' ? row.rawJson.gender : undefined,
          phone: typeof row.rawJson.phone === 'string' ? row.rawJson.phone : undefined,
          city: typeof row.rawJson.city === 'string' ? row.rawJson.city : undefined,
          state: typeof row.rawJson.state === 'string' ? row.rawJson.state : undefined,
          country: typeof row.rawJson.country === 'string' ? row.rawJson.country : undefined,
          emergencyContactName:
            typeof row.rawJson.emergencyContactName === 'string'
              ? row.rawJson.emergencyContactName
              : undefined,
          emergencyContactPhone:
            typeof row.rawJson.emergencyContactPhone === 'string'
              ? row.rawJson.emergencyContactPhone
              : undefined,
        };

        await tx.insert(registrants).values({
          registrationId: createdRegistration.id,
          userId: matchedUserId,
          profileSnapshot: snapshot,
          genderIdentity: typeof row.rawJson.genderIdentity === 'string' ? row.rawJson.genderIdentity : null,
        });

        const perRegistrationAudit = await createAuditLog(
          {
            organizationId: batch.edition.series.organizationId,
            actorUserId: authContext.user.id,
            action: 'registration.create',
            entityType: 'registration',
            entityId: createdRegistration.id,
            after: {
              editionId: edition.id,
              distanceId,
              buyerUserId,
              status: nextStatus,
              basePriceCents,
              feesCents,
              taxCents: 0,
              addOnTotalCents,
              totalCents,
              groupBatchId: batch.id,
              batchRowId: row.id,
              rowIndex: row.rowIndex,
              percentOff,
            },
            request: requestContext,
          },
          tx,
        );

        if (!perRegistrationAudit.ok) {
          throw new Error('Failed to create audit log');
        }

        await tx
          .update(groupRegistrationBatchRows)
          .set({ createdRegistrationId: createdRegistration.id })
          .where(eq(groupRegistrationBatchRows.id, row.id));

        createdCount += 1;
      }

      const processedAt = new Date();
      await tx
        .update(groupRegistrationBatches)
        .set({ status: 'processed', processedAt })
        .where(eq(groupRegistrationBatches.id, batch.id));

      const auditResult = await createAuditLog(
        {
          organizationId: batch.edition.series.organizationId,
          actorUserId: authContext.user.id,
          action: 'group_registrations.process',
          entityType: 'group_registration_batch',
          entityId: batch.id,
          after: { status: 'processed', createdCount, percentOff },
          request: requestContext,
        },
        tx,
      );
      if (!auditResult.ok) {
        throw new Error('Failed to create audit log');
      }

      return { processedAt, createdCount };
    });

    safeRevalidateTag(eventEditionDetailTag(batch.editionId), { expire: 0 });
    safeRevalidateTag(eventEditionRegistrationsTag(batch.editionId), { expire: 0 });
    safeRevalidateTag(publicEventBySlugTag(batch.edition.series.slug, batch.edition.slug), { expire: 0 });

    return {
      ok: true,
      data: {
        status: 'processed',
        processedAt: processedAt.processedAt.toISOString(),
        createdCount: processedAt.createdCount,
        groupDiscountPercentOff: percentOff,
      },
    };
  } catch (error) {
    const failure = (() => {
      if (!(error instanceof Error)) return null;
      if (error.message === 'INSUFFICIENT_CAPACITY') {
        return {
          response: { ok: false as const, error: 'Insufficient capacity to process this batch', code: 'INSUFFICIENT_CAPACITY' },
          audit: { reason: 'INSUFFICIENT_CAPACITY' as const, message: error.message },
        };
      }
      if (error.message === 'EDITION_NOT_FOUND') {
        return {
          response: { ok: false as const, error: 'Event edition not found', code: 'NOT_FOUND' },
          audit: { reason: 'EDITION_NOT_FOUND' as const, message: error.message },
        };
      }
      if (error.message === 'INVALID_ROW') {
        return {
          response: { ok: false as const, error: 'Batch contains invalid row data', code: 'VALIDATION_ERROR' },
          audit: { reason: 'INVALID_ROW' as const, message: error.message },
        };
      }
      return null;
    })();

    if (!failure) {
      throw error;
    }

    const failedAt = new Date();
    await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(groupRegistrationBatches)
        .set({ status: 'failed', processedAt: failedAt })
        .where(
          and(
            eq(groupRegistrationBatches.id, batch.id),
            or(
              eq(groupRegistrationBatches.status, 'validated'),
              eq(groupRegistrationBatches.status, 'failed'),
            ),
          ),
        )
        .returning({ id: groupRegistrationBatches.id });

      if (!updated) {
        return;
      }

      const auditResult = await createAuditLog(
        {
          organizationId: batch.edition.series.organizationId,
          actorUserId: authContext.user.id,
          action: 'group_registrations.process_failed',
          entityType: 'group_registration_batch',
          entityId: batch.id,
          before: { status: batch.status },
          after: {
            status: 'failed',
            reason: failure.audit.reason,
            message: failure.audit.message,
            percentOff,
          },
          request: requestContext,
        },
        tx,
      );

      if (!auditResult.ok) {
        throw new Error('Failed to create audit log');
      }
    });

    return failure.response;
  }
});

const upsertGroupDiscountRuleSchema = z.object({
  editionId: z.string().uuid(),
  minParticipants: z.number().int().positive(),
  percentOff: z.number().int().min(1).max(100),
  isActive: z.boolean().default(true),
});

export const createGroupDiscountRule = withAuthenticatedUser<ActionResult<{ id: string }>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof upsertGroupDiscountRuleSchema>) => {
  const accessError = checkEventsAccess(authContext);
  if (accessError) {
    return { ok: false, ...accessError };
  }

  const validated = upsertGroupDiscountRuleSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { editionId, minParticipants, percentOff, isActive } = validated.data;

  const membership = await canUserAccessEvent(authContext.user.id, editionId);
  try {
    requireOrgPermission(membership, 'canEditRegistrationSettings');
  } catch {
    return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
  }

  const edition = await db.query.eventEditions.findFirst({
    where: and(eq(eventEditions.id, editionId), isNull(eventEditions.deletedAt)),
    with: { series: true },
  });

  if (!edition?.series) {
    return { ok: false, error: 'Event edition not found', code: 'NOT_FOUND' };
  }

  const requestContext = await getRequestContext(await headers());

  const rule = await db.transaction(async (tx) => {
    const existing = await tx.query.groupDiscountRules.findFirst({
      where: and(
        eq(groupDiscountRules.editionId, editionId),
        eq(groupDiscountRules.minParticipants, minParticipants),
      ),
    });

    const [upserted] = await tx
      .insert(groupDiscountRules)
      .values({ editionId, minParticipants, percentOff, isActive })
      .onConflictDoUpdate({
        target: [groupDiscountRules.editionId, groupDiscountRules.minParticipants],
        set: { percentOff, isActive, updatedAt: new Date() },
      })
      .returning({ id: groupDiscountRules.id });

    const auditResult = await createAuditLog(
      {
        organizationId: edition.series.organizationId,
        actorUserId: authContext.user.id,
        action: 'group_registrations.discount_rule.upsert',
        entityType: 'group_discount_rule',
        entityId: upserted.id,
        before: existing ? {
          minParticipants: existing.minParticipants,
          percentOff: existing.percentOff,
          isActive: existing.isActive,
        } : undefined,
        after: {
          minParticipants,
          percentOff,
          isActive,
        },
        request: requestContext,
      },
      tx,
    );

    if (!auditResult.ok) {
      throw new Error('Failed to create audit log');
    }

    return upserted;
  });

  return { ok: true, data: { id: rule.id } };
});
