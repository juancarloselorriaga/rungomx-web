import { and, eq, inArray, isNull } from 'drizzle-orm';

import { db } from '@/db';
import { eventWebsiteContent, media } from '@/db/schema';

import {
  websiteContentBlocksSchema,
  type WebsiteContentBlocks,
} from './types';

/**
 * Resolve media URLs for all referenced website media (documents + photos).
 * Returns a map of mediaId -> blobUrl
 */
export async function resolveWebsiteMediaUrls(
  blocks: WebsiteContentBlocks | null,
): Promise<Map<string, string>> {
  const urlMap = new Map<string, string>();

  const documentIds = blocks?.media?.documents?.map((doc) => doc.mediaId) ?? [];
  const photoIds = blocks?.media?.photos?.map((photo) => photo.mediaId) ?? [];
  const mediaIds = Array.from(new Set([...documentIds, ...photoIds]));

  if (mediaIds.length === 0) {
    return urlMap;
  }

  const mediaRecords = await db.query.media.findMany({
    where: and(inArray(media.id, mediaIds), isNull(media.deletedAt)),
  });

  for (const record of mediaRecords) {
    urlMap.set(record.id, record.blobUrl);
  }

  return urlMap;
}

/**
 * Resolve media URLs for documents in website content blocks.
 * Returns a map of mediaId -> blobUrl
 */
export async function resolveDocumentUrls(
  blocks: WebsiteContentBlocks | null,
): Promise<Map<string, string>> {
  if (!blocks?.media?.documents || blocks.media.documents.length === 0) {
    return new Map();
  }

  const allUrls = await resolveWebsiteMediaUrls(blocks);
  const documentIds = new Set(blocks.media.documents.map((doc) => doc.mediaId));
  return new Map(
    Array.from(allUrls.entries()).filter(([id]) => documentIds.has(id)),
  );
}

/**
 * Get event documents with resolved URLs for display on registration confirmation.
 * Returns an array of documents with their labels and blob URLs.
 */
export async function getEventDocuments(
  editionId: string,
  locale: string = 'es',
): Promise<Array<{ label: string; url: string }>> {
  const content = await getPublicWebsiteContent(editionId, locale);
  if (!content?.media?.documents || content.media.documents.length === 0) {
    return [];
  }

  const urlMap = await resolveWebsiteMediaUrls(content);

  return content.media.documents
    .map((doc) => {
      const url = urlMap.get(doc.mediaId);
      return url ? { label: doc.label, url } : null;
    })
    .filter((doc): doc is { label: string; url: string } => doc !== null);
}

/**
 * Get public website content for an event edition.
 * Returns null if no content exists, or the parsed blocks if found.
 */
export async function getPublicWebsiteContent(
  editionId: string,
  locale: string,
): Promise<WebsiteContentBlocks | null> {
  const content = await db.query.eventWebsiteContent.findFirst({
    where: and(
      eq(eventWebsiteContent.editionId, editionId),
      eq(eventWebsiteContent.locale, locale),
      isNull(eventWebsiteContent.deletedAt),
    ),
  });

  if (!content) {
    return null;
  }

  // Parse and validate stored blocks, returning null if invalid
  try {
    const parseResult = websiteContentBlocksSchema.safeParse(content.blocksJson);
    return parseResult.success ? parseResult.data : null;
  } catch {
    return null;
  }
}

/**
 * Check if an event edition has website content for any locale.
 * Useful for determining whether to show the "Website" tab.
 */
export async function hasWebsiteContent(editionId: string): Promise<boolean> {
  const content = await db.query.eventWebsiteContent.findFirst({
    where: and(
      eq(eventWebsiteContent.editionId, editionId),
      isNull(eventWebsiteContent.deletedAt),
    ),
  });

  return Boolean(content);
}
