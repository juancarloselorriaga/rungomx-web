import { and, eq, inArray, isNull } from 'drizzle-orm';
import { headers } from 'next/headers';
import { z } from 'zod';

import { db } from '@/db';
import {
  eventDistances,
  eventEditions,
  groupRegistrationBatches,
  groupRegistrationBatchRows,
  profiles,
  users,
} from '@/db/schema';
import { createAuditLog, getRequestContext } from '@/lib/audit';
import type { AuthContext } from '@/lib/auth/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { normalizeEmail, parseIsoDate, toIsoDateString } from '@/lib/events/shared/identity';
import { getBatchForCoordinatorOrThrow, BatchAccessError } from './access';
import {
  buildHeaderIndex,
  getCell,
  parseRosterFile,
  REQUIRED_HEADERS,
  resolveMediaRecordByUrl,
} from './file-parser';
import { getUploadLinkByToken } from './queries';

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string };

export async function createBatchViaLinkWorkflow(params: {
  authContext: AuthContext;
  uploadToken: string;
  distanceId: string;
  createBatchMaxRequests: number;
  createBatchWindowMs: number;
}): Promise<ActionResult<{ batchId: string }>> {
  const { authContext, uploadToken, distanceId, createBatchMaxRequests, createBatchWindowMs } =
    params;
  const linkResult = await getUploadLinkByToken({ token: uploadToken });

  if (!linkResult.link || linkResult.status !== 'ACTIVE') {
    return { ok: false, error: 'Upload link not available', code: 'LINK_INVALID' };
  }

  const rateLimit = await checkRateLimit(authContext.user!.id, 'user', {
    action: `group_upload_batch_${linkResult.link.id}`,
    maxRequests: createBatchMaxRequests,
    windowMs: createBatchWindowMs,
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
      createdByUserId: authContext.user!.id,
      status: 'uploaded',
    })
    .returning({ id: groupRegistrationBatches.id });

  const requestContext = await getRequestContext(await headers());
  const auditResult = await createAuditLog(
    {
      organizationId: edition.series.organizationId,
      actorUserId: authContext.user!.id,
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
}

export async function uploadBatchViaLinkWorkflow(params: {
  authContext: AuthContext;
  batchId: string;
  uploadToken: string;
  mediaUrl: string;
  groupUploadMaxRows: number;
}): Promise<ActionResult<{ batchId: string; rowCount: number; errorCount: number }>> {
  const { authContext, batchId, uploadToken, mediaUrl, groupUploadMaxRows } = params;

  try {
    const access = await getBatchForCoordinatorOrThrow({
      batchId,
      uploadToken,
      authContext,
      requireActiveLink: false,
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
      blobUrl: mediaUrl,
      organizationId: edition.series.organizationId,
    });

    if (!mediaRecord) {
      return { ok: false, error: 'Uploaded file not found', code: 'INVALID_FILE' };
    }

    const parsedResult = await parseRosterFile(mediaRecord.id);
    if (!parsedResult.ok) {
      return { ok: false, error: parsedResult.error, code: parsedResult.code };
    }

    const { headers: parsedHeaders, rows } = parsedResult.parsed;

    if (parsedHeaders.length === 0) {
      return { ok: false, error: 'File is missing headers', code: 'INVALID_HEADERS' };
    }

    const headerIndex = buildHeaderIndex(parsedHeaders);
    const missingHeaders = REQUIRED_HEADERS.filter((h) => !headerIndex.has(h));
    if (missingHeaders.length > 0) {
      return {
        ok: false,
        error: 'Headers do not match the expected template',
        code: 'INVALID_HEADERS',
      };
    }

    if (rows.length === 0) {
      return { ok: false, error: 'File has no data rows', code: 'NO_ROWS' };
    }

    if (rows.length > groupUploadMaxRows) {
      return {
        ok: false,
        error: `File exceeds maximum of ${groupUploadMaxRows} rows`,
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
      const emergencyContactName =
        getCell(row, headerIndex, 'emergencyContactName').trim() || null;
      const emergencyContactPhone =
        getCell(row, headerIndex, 'emergencyContactPhone').trim() || null;

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

    return {
      ok: true,
      data: { batchId: access.batch.id, rowCount: rows.length, errorCount },
    };
  } catch (error) {
    if (error instanceof BatchAccessError) {
      return { ok: false, error: error.message, code: error.code };
    }

    throw error;
  }
}
