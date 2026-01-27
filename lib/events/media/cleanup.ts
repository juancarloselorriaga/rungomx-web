'use server';

import { del } from '@vercel/blob';
import { eq, and, isNull, lt } from 'drizzle-orm';

import { db } from '@/db';
import { media, eventWebsiteContent, eventEditions } from '@/db/schema';

/**
 * Extract all mediaIds referenced in website content blocks.
 */
function extractMediaIdsFromBlocks(blocksJson: unknown): string[] {
  const mediaIds: string[] = [];

  if (!blocksJson || typeof blocksJson !== 'object') {
    return mediaIds;
  }

  const blocks = blocksJson as Record<string, unknown>;

  // Extract from media section (photos and documents)
  const mediaSection = blocks.media as { photos?: { mediaId: string }[]; documents?: { mediaId: string }[] } | undefined;
  if (mediaSection?.photos) {
    for (const photo of mediaSection.photos) {
      if (photo.mediaId) mediaIds.push(photo.mediaId);
    }
  }
  if (mediaSection?.documents) {
    for (const doc of mediaSection.documents) {
      if (doc.mediaId) mediaIds.push(doc.mediaId);
    }
  }

  // Extract from sponsors section (sponsor logos)
  const sponsorsSection = blocks.sponsors as { tiers?: { sponsors?: { logoMediaId: string }[] }[] } | undefined;
  if (sponsorsSection?.tiers) {
    for (const tier of sponsorsSection.tiers) {
      if (tier.sponsors) {
        for (const sponsor of tier.sponsors) {
          if (sponsor.logoMediaId) mediaIds.push(sponsor.logoMediaId);
        }
      }
    }
  }

  return mediaIds;
}

export type CleanupResult = {
  scanned: number;
  orphansFound: number;
  deleted: number;
  errors: number;
  orphanIds?: string[];
};

/**
 * Find all media IDs that are referenced somewhere in the database.
 */
async function getReferencedMediaIds(): Promise<Set<string>> {
  const referencedIds = new Set<string>();

  // 1. Get all mediaIds from eventWebsiteContent blocks
  const websiteContents = await db.query.eventWebsiteContent.findMany({
    where: isNull(eventWebsiteContent.deletedAt),
    columns: { blocksJson: true },
  });

  for (const content of websiteContents) {
    const ids = extractMediaIdsFromBlocks(content.blocksJson);
    for (const id of ids) {
      referencedIds.add(id);
    }
  }

  // 2. Get all heroImageMediaIds from eventEditions
  const editions = await db.query.eventEditions.findMany({
    where: isNull(eventEditions.deletedAt),
    columns: { heroImageMediaId: true },
  });

  for (const edition of editions) {
    if (edition.heroImageMediaId) {
      referencedIds.add(edition.heroImageMediaId);
    }
  }

  return referencedIds;
}

/**
 * Clean up orphaned media files that are not referenced anywhere.
 *
 * @param options.dryRun - If true, only report what would be deleted without actually deleting
 * @param options.organizationId - If provided, only clean up media for this organization
 * @param options.olderThanDays - Only delete media older than this many days (default: 1)
 * @returns Cleanup result with counts
 */
export async function cleanupOrphanedMedia(options: {
  dryRun?: boolean;
  organizationId?: string;
  olderThanDays?: number;
} = {}): Promise<CleanupResult> {
  const { dryRun = false, organizationId, olderThanDays = 1 } = options;

  // Get all referenced media IDs
  const referencedIds = await getReferencedMediaIds();

  // Calculate the cutoff date (only delete media older than X days to avoid race conditions)
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

  // Build the query for finding orphaned media
  const conditions = [
    isNull(media.deletedAt),
    lt(media.createdAt, cutoffDate),
  ];

  if (organizationId) {
    conditions.push(eq(media.organizationId, organizationId));
  }

  // Get all media records (we'll filter in memory since we need to check against the set)
  const allMedia = await db.query.media.findMany({
    where: and(...conditions),
    columns: {
      id: true,
      blobUrl: true,
      organizationId: true,
    },
  });

  // Find orphans (not in referenced set)
  const orphans = allMedia.filter((m) => !referencedIds.has(m.id));

  const result: CleanupResult = {
    scanned: allMedia.length,
    orphansFound: orphans.length,
    deleted: 0,
    errors: 0,
  };

  if (dryRun) {
    result.orphanIds = orphans.map((m) => m.id);
    return result;
  }

  // Delete orphans
  for (const orphan of orphans) {
    try {
      // Soft delete the media record
      await db
        .update(media)
        .set({ deletedAt: new Date() })
        .where(eq(media.id, orphan.id));

      // Delete the blob from storage
      try {
        await del(orphan.blobUrl);
      } catch (blobError) {
        // Log but don't fail - blob might already be deleted
        console.warn(`[media-cleanup] Failed to delete blob for ${orphan.id}:`, blobError);
      }

      result.deleted++;
    } catch (error) {
      console.error(`[media-cleanup] Failed to delete media ${orphan.id}:`, error);
      result.errors++;
    }
  }

  console.log(`[media-cleanup] Completed: scanned=${result.scanned}, orphans=${result.orphansFound}, deleted=${result.deleted}, errors=${result.errors}`);

  return result;
}

/**
 * Get orphaned media stats without deleting (useful for monitoring).
 */
export async function getOrphanedMediaStats(organizationId?: string): Promise<{
  totalMedia: number;
  referencedMedia: number;
  orphanedMedia: number;
}> {
  const result = await cleanupOrphanedMedia({
    dryRun: true,
    organizationId,
    olderThanDays: 0, // Include all media for stats
  });

  return {
    totalMedia: result.scanned,
    referencedMedia: result.scanned - result.orphansFound,
    orphanedMedia: result.orphansFound,
  };
}
