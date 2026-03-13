import { and, eq, isNull } from 'drizzle-orm';

import { db } from '@/db';
import { media } from '@/db/schema';
import { EVENT_MEDIA_GROUP_REGISTRATION_TYPES } from '@/lib/events/media/constants';
import { parseCsv } from '@/lib/events/group-registrations/csv';

export function buildHeaderIndex(headers: string[]) {
  const map = new Map<string, number>();
  headers.forEach((h, i) => {
    const key = h.trim();
    if (!key) return;
    if (!map.has(key)) map.set(key, i);
  });
  return map;
}

export function getCell(row: string[], headerIndex: Map<string, number>, header: string): string {
  const idx = headerIndex.get(header);
  if (idx === undefined) return '';
  return row[idx] ?? '';
}

export const REQUIRED_HEADERS = ['firstName', 'lastName', 'email', 'dateOfBirth'] as const;

export async function parseRosterFile(mediaId: string) {
  const file = await db.query.media.findFirst({
    where: and(eq(media.id, mediaId), isNull(media.deletedAt)),
    columns: { blobUrl: true, mimeType: true, sizeBytes: true },
  });

  if (!file?.blobUrl) {
    return { ok: false as const, error: 'Source file not found', code: 'INVALID_FILE' };
  }

  if (
    file.mimeType &&
    !EVENT_MEDIA_GROUP_REGISTRATION_TYPES.includes(
      file.mimeType as (typeof EVENT_MEDIA_GROUP_REGISTRATION_TYPES)[number],
    )
  ) {
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
        return {
          ok: false as const,
          error: 'Excel file must include at least one sheet',
          code: 'INVALID_FILE',
        };
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

export async function resolveMediaRecordByUrl(params: {
  blobUrl: string;
  organizationId: string;
}) {
  const { blobUrl, organizationId } = params;

  if (
    !blobUrl.includes('vercel-storage.com') &&
    !blobUrl.includes('blob.vercel-storage.com')
  ) {
    return null;
  }

  const maxMediaLookupAttempts = 3;
  let record: typeof media.$inferSelect | null = null;

  for (let attempt = 0; attempt < maxMediaLookupAttempts; attempt += 1) {
    record =
      (await db.query.media.findFirst({
        where: and(
          eq(media.organizationId, organizationId),
          eq(media.blobUrl, blobUrl),
          isNull(media.deletedAt),
        ),
      })) ?? null;

    if (record) break;

    if (attempt < maxMediaLookupAttempts - 1) {
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
