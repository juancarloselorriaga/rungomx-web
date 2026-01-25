import { customAlphabet } from 'nanoid';
import { and, eq, isNull } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';

import { db } from '@/db';
import { eventEditions } from '@/db/schema';
import type { AuthContext } from '@/lib/auth/server';
import { publicEventBySlugTag } from '@/lib/events/cache-tags';

// =============================================================================
// Types
// =============================================================================

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };

// =============================================================================
// Helpers
// =============================================================================

/**
 * Generate a unique public code for an event edition.
 * Format: 6 uppercase alphanumeric characters (e.g., "ABC123")
 */
export const generatePublicCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);

/**
 * Check if the user has permission to access the events platform.
 * External organizers require organizer dashboard permission; internal staff bypass via canManageEvents.
 *
 * @param authContext - The authenticated user context
 * @returns Error object if access denied, null if allowed
 */
export function checkEventsAccess(authContext: AuthContext): { error: string; code: string } | null {
  // Internal staff with canManageEvents can always access
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

/**
 * Revalidate the public event cache by edition ID.
 */
export async function revalidatePublicEventByEditionId(editionId: string) {
  const edition = await db.query.eventEditions.findFirst({
    where: and(eq(eventEditions.id, editionId), isNull(eventEditions.deletedAt)),
    columns: { slug: true },
    with: { series: { columns: { slug: true } } },
  });

  if (!edition?.series?.slug) return;
  revalidateTag(publicEventBySlugTag(edition.series.slug, edition.slug), { expire: 0 });
}
