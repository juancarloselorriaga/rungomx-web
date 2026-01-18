'use server';

import { eq, and, isNull } from 'drizzle-orm';
import { refresh } from 'next/cache';
import { headers } from 'next/headers';
import { z } from 'zod';

import { db } from '@/db';
import { eventEditions, eventWebsiteContent } from '@/db/schema';
import { createAuditLog, getRequestContext } from '@/lib/audit';
import { withAuthenticatedUser } from '@/lib/auth/action-wrapper';
import { canUserAccessSeries, getOrgMembership, requireOrgPermission } from '@/lib/organizations/permissions';
import type { AuthenticatedContext } from '@/lib/auth/guards';

import {
  websiteContentBlocksSchema,
  DEFAULT_WEBSITE_BLOCKS,
  type WebsiteContentBlocks,
} from './types';
import { resolveWebsiteMediaUrls } from './queries';

// =============================================================================
// Types
// =============================================================================

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string };

// =============================================================================
// Helpers
// =============================================================================

/**
 * Check if the user has permission to access the events platform.
 */
function checkEventsAccess(authContext: AuthenticatedContext): { error: string; code: string } | null {
  if (authContext.permissions.canManageEvents) {
    return null;
  }

  if (!authContext.permissions.canViewOrganizersDashboard) {
    return { error: 'You do not have permission to manage events', code: 'FORBIDDEN' };
  }

  return null;
}

// =============================================================================
// Schemas
// =============================================================================

const getWebsiteContentSchema = z.object({
  editionId: z.string().uuid(),
  locale: z.string().min(2).max(10).default('es'),
});

const updateWebsiteContentSchema = z.object({
  editionId: z.string().uuid(),
  locale: z.string().min(2).max(10).default('es'),
  blocks: websiteContentBlocksSchema,
});

// =============================================================================
// Actions
// =============================================================================

type WebsiteContentData = {
  id: string | null;
  editionId: string;
  locale: string;
  blocks: WebsiteContentBlocks;
  mediaUrls: Record<string, string>;
  createdAt: Date | null;
  updatedAt: Date | null;
};

/**
 * Get website content for an event edition
 */
export const getWebsiteContent = withAuthenticatedUser<ActionResult<WebsiteContentData>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof getWebsiteContentSchema>) => {
  // Check events access
  const accessError = checkEventsAccess(authContext);
  if (accessError) {
    return { ok: false, ...accessError };
  }

  // Validate input
  const parsed = getWebsiteContentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { editionId, locale } = parsed.data;

  // Get edition with series info
  const edition = await db.query.eventEditions.findFirst({
    where: and(eq(eventEditions.id, editionId), isNull(eventEditions.deletedAt)),
    with: { series: true },
  });

  if (!edition?.series) {
    return { ok: false, error: 'Event edition not found', code: 'NOT_FOUND' };
  }

  // Verify access to the series
  const canAccess = await canUserAccessSeries(authContext.user.id, edition.seriesId);
  if (!canAccess) {
    return { ok: false, error: 'You do not have access to this event', code: 'FORBIDDEN' };
  }

  // Get existing content or return defaults
  const content = await db.query.eventWebsiteContent.findFirst({
    where: and(
      eq(eventWebsiteContent.editionId, editionId),
      eq(eventWebsiteContent.locale, locale),
      isNull(eventWebsiteContent.deletedAt),
    ),
  });

  if (!content) {
    return {
      ok: true,
      data: {
        id: null,
        editionId,
        locale,
        blocks: DEFAULT_WEBSITE_BLOCKS,
        mediaUrls: {},
        createdAt: null,
        updatedAt: null,
      },
    };
  }

  // Parse and validate stored blocks, falling back to defaults if invalid
  let blocks: WebsiteContentBlocks;
  try {
    const parseResult = websiteContentBlocksSchema.safeParse(content.blocksJson);
    blocks = parseResult.success ? parseResult.data : DEFAULT_WEBSITE_BLOCKS;
  } catch {
    blocks = DEFAULT_WEBSITE_BLOCKS;
  }

  const mediaUrls = Object.fromEntries((await resolveWebsiteMediaUrls(blocks)).entries());

  return {
    ok: true,
    data: {
      id: content.id,
      editionId: content.editionId,
      locale: content.locale,
      blocks,
      mediaUrls,
      createdAt: content.createdAt,
      updatedAt: content.updatedAt,
    },
  };
});

/**
 * Update website content for an event edition (upsert)
 */
export const updateWebsiteContent = withAuthenticatedUser<ActionResult<{ id: string }>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof updateWebsiteContentSchema>) => {
  // Check events access
  const accessError = checkEventsAccess(authContext);
  if (accessError) {
    return { ok: false, ...accessError };
  }

  // Validate input
  const parsed = updateWebsiteContentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { editionId, locale, blocks } = parsed.data;

  // Get edition with series info
  const edition = await db.query.eventEditions.findFirst({
    where: and(eq(eventEditions.id, editionId), isNull(eventEditions.deletedAt)),
    with: { series: true },
  });

  if (!edition?.series) {
    return { ok: false, error: 'Event edition not found', code: 'NOT_FOUND' };
  }

  // Check permission
  if (!authContext.permissions.canManageEvents) {
    const membership = await getOrgMembership(authContext.user.id, edition.series.organizationId);
    try {
      requireOrgPermission(membership, 'canEditEventConfig');
    } catch {
      return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
    }
  }

  // Get existing content for audit log comparison
  const existingContent = await db.query.eventWebsiteContent.findFirst({
    where: and(
      eq(eventWebsiteContent.editionId, editionId),
      eq(eventWebsiteContent.locale, locale),
      isNull(eventWebsiteContent.deletedAt),
    ),
  });

  const requestContext = await getRequestContext(await headers());

  let contentId: string;

  if (existingContent) {
    // Update existing content
    const result = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(eventWebsiteContent)
        .set({
          blocksJson: blocks as Record<string, unknown>,
          updatedAt: new Date(),
        })
        .where(eq(eventWebsiteContent.id, existingContent.id))
        .returning({ id: eventWebsiteContent.id });

      // Audit log for update
      const auditResult = await createAuditLog({
        organizationId: edition.series.organizationId,
        actorUserId: authContext.user.id,
        action: 'website.update',
        entityType: 'event_website_content',
        entityId: updated.id,
        before: existingContent.blocksJson as Record<string, unknown>,
        after: blocks as Record<string, unknown>,
        request: requestContext,
      }, tx);

      if (!auditResult.ok) {
        throw new Error('Audit log failed');
      }

      return updated;
    });

    contentId = result.id;
  } else {
    // Create new content
    const result = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(eventWebsiteContent)
        .values({
          editionId,
          locale,
          blocksJson: blocks as Record<string, unknown>,
        })
        .returning({ id: eventWebsiteContent.id });

      // Audit log for create
      const auditResult = await createAuditLog({
        organizationId: edition.series.organizationId,
        actorUserId: authContext.user.id,
        action: 'website.update',
        entityType: 'event_website_content',
        entityId: created.id,
        before: undefined,
        after: blocks as Record<string, unknown>,
        request: requestContext,
      }, tx);

      if (!auditResult.ok) {
        throw new Error('Audit log failed');
      }

      return created;
    });

    contentId = result.id;
  }

  refresh();

  return {
    ok: true,
    data: { id: contentId },
  };
});
