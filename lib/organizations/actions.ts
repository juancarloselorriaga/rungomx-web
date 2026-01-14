'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { headers } from 'next/headers';
import { z } from 'zod';

import { db } from '@/db';
import { organizationMemberships, organizations } from '@/db/schema';
import { createAuditLog, getRequestContext } from '@/lib/audit';
import { withAuthenticatedUser } from '@/lib/auth/action-wrapper';
import type { AuthContext } from '@/lib/auth/server';
import type { OrgMembershipRole } from '@/lib/events/constants';
import { ORG_MEMBERSHIP_ROLES } from '@/lib/events/constants';
import { isEventsEnabled } from '@/lib/features/flags';

import { getOrgMembership, requireOrgPermission } from './permissions';
import { lookupUserByEmail as lookupUserByEmailQuery } from './queries';

// =============================================================================
// Schemas
// =============================================================================

const createOrganizationSchema = z.object({
  name: z.string().min(2).max(255),
  slug: z
    .string()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
});

const updateOrganizationSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(2).max(255).optional(),
  slug: z
    .string()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens')
    .optional(),
});

const addOrgMemberSchema = z.object({
  organizationId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.enum(ORG_MEMBERSHIP_ROLES),
});

const updateOrgMemberSchema = z.object({
  organizationId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.enum(ORG_MEMBERSHIP_ROLES),
});

const removeOrgMemberSchema = z.object({
  organizationId: z.string().uuid(),
  userId: z.string().uuid(),
});

const lookupUserByEmailSchema = z.object({
  organizationId: z.string().uuid(),
  email: z.string().email(),
});

// =============================================================================
// Types
// =============================================================================

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };

type OrganizationData = {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
};

// =============================================================================
// Helpers
// =============================================================================

/**
 * Phase 0 gate: Check if user can access events platform functionality.
 * Organizers need feature flag enabled, internal staff with canManageEvents bypass.
 */
function checkEventsAccess(authContext: AuthContext): { error: string; code: string } | null {
  const canAccess =
    (isEventsEnabled() && authContext.permissions.canViewOrganizersDashboard) ||
    authContext.permissions.canManageEvents;

  if (!canAccess) {
    return { error: 'Access denied', code: 'FORBIDDEN' };
  }

  return null;
}

// =============================================================================
// Actions
// =============================================================================

/**
 * Create a new organization.
 * The creating user automatically becomes the owner.
 */
export const createOrganization = withAuthenticatedUser<ActionResult<OrganizationData>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof createOrganizationSchema>) => {
  // Phase 0 gate: require feature flag + organizer permission OR internal staff with canManageEvents
  const accessError = checkEventsAccess(authContext);
  if (accessError) return { ok: false, ...accessError };

  // Validate input
  const validated = createOrganizationSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { name, slug } = validated.data;

  // Check if slug is already taken
  const existing = await db.query.organizations.findFirst({
    where: and(eq(organizations.slug, slug), isNull(organizations.deletedAt)),
  });

  if (existing) {
    return { ok: false, error: 'Organization slug is already taken', code: 'SLUG_TAKEN' };
  }

  // Create organization, membership, and audit log in a transaction (Phase 0 requirement)
  const requestContext = await getRequestContext(await headers());
  const result = await db.transaction(async (tx) => {
    // Create organization
    const [org] = await tx
      .insert(organizations)
      .values({
        name,
        slug,
      })
      .returning();

    // Add creator as owner
    await tx.insert(organizationMemberships).values({
      organizationId: org.id,
      userId: authContext.user.id,
      role: 'owner' as OrgMembershipRole,
    });

    // Write audit log in same transaction (ensures atomicity)
    const auditResult = await createAuditLog(
      {
        organizationId: org.id,
        actorUserId: authContext.user.id,
        action: 'org.create',
        entityType: 'organization',
        entityId: org.id,
        after: { name: org.name, slug: org.slug },
        request: requestContext,
      },
      tx,
    );

    if (!auditResult.ok) {
      throw new Error('Failed to create audit log');
    }

    return org;
  });

  return {
    ok: true,
    data: {
      id: result.id,
      name: result.name,
      slug: result.slug,
      createdAt: result.createdAt,
    },
  };
});

/**
 * Update an organization's details.
 * Requires admin or owner role.
 */
export const updateOrganization = withAuthenticatedUser<ActionResult<OrganizationData>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof updateOrganizationSchema>) => {
  // Phase 0 gate: require feature flag + organizer permission OR internal staff with canManageEvents
  const accessError = checkEventsAccess(authContext);
  if (accessError) return { ok: false, ...accessError };

  const validated = updateOrganizationSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { organizationId, name, slug } = validated.data;

  // Check membership and permissions
  const membership = await getOrgMembership(authContext.user.id, organizationId);
  try {
    requireOrgPermission(membership, 'canEditEventConfig');
  } catch {
    return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
  }

  // Get current state for audit
  const current = await db.query.organizations.findFirst({
    where: and(eq(organizations.id, organizationId), isNull(organizations.deletedAt)),
  });

  if (!current) {
    return { ok: false, error: 'Organization not found', code: 'NOT_FOUND' };
  }

  // Check slug uniqueness if changing
  if (slug && slug !== current.slug) {
    const existing = await db.query.organizations.findFirst({
      where: and(eq(organizations.slug, slug), isNull(organizations.deletedAt)),
    });
    if (existing) {
      return { ok: false, error: 'Organization slug is already taken', code: 'SLUG_TAKEN' };
    }
  }

  // Update organization and audit log in a transaction (Phase 0 requirement)
  const requestContext = await getRequestContext(await headers());
  const updated = await db.transaction(async (tx) => {
    const [updatedOrg] = await tx
      .update(organizations)
      .set({
        ...(name && { name }),
        ...(slug && { slug }),
      })
      .where(eq(organizations.id, organizationId))
      .returning();

    // Write audit log in same transaction (ensures atomicity)
    const auditResult = await createAuditLog(
      {
        organizationId,
        actorUserId: authContext.user.id,
        action: 'org.update',
        entityType: 'organization',
        entityId: organizationId,
        before: { name: current.name, slug: current.slug },
        after: { name: updatedOrg.name, slug: updatedOrg.slug },
        request: requestContext,
      },
      tx,
    );

    if (!auditResult.ok) {
      throw new Error('Failed to create audit log');
    }

    return updatedOrg;
  });

  return {
    ok: true,
    data: {
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      createdAt: updated.createdAt,
    },
  };
});

/**
 * Add a member to an organization.
 * Requires owner role.
 */
export const addOrgMember = withAuthenticatedUser<ActionResult<{ membershipId: string }>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof addOrgMemberSchema>) => {
  // Phase 0 gate: require feature flag + organizer permission OR internal staff with canManageEvents
  const accessError = checkEventsAccess(authContext);
  if (accessError) return { ok: false, ...accessError };

  const validated = addOrgMemberSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { organizationId, userId, role } = validated.data;

  // Check membership and permissions
  const membership = await getOrgMembership(authContext.user.id, organizationId);
  if (!authContext.permissions.canManageEvents) {
    try {
      requireOrgPermission(membership, 'canManageMembers');
    } catch {
      return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
    }
  }

  // Check if user is already a member
  const existing = await db.query.organizationMemberships.findFirst({
    where: and(
      eq(organizationMemberships.organizationId, organizationId),
      eq(organizationMemberships.userId, userId),
      isNull(organizationMemberships.deletedAt),
    ),
  });

  if (existing) {
    return { ok: false, error: 'User is already a member', code: 'ALREADY_MEMBER' };
  }

  // Add membership and audit log in a transaction (Phase 0 requirement)
  const requestContext = await getRequestContext(await headers());
  const newMembership = await db.transaction(async (tx) => {
    const [membership] = await tx
      .insert(organizationMemberships)
      .values({
        organizationId,
        userId,
        role,
      })
      .returning();

    // Write audit log in same transaction (ensures atomicity)
    const auditResult = await createAuditLog(
      {
        organizationId,
        actorUserId: authContext.user.id,
        action: 'org.member.add',
        entityType: 'organization_membership',
        entityId: membership.id,
        after: { userId, role },
        request: requestContext,
      },
      tx,
    );

    if (!auditResult.ok) {
      throw new Error('Failed to create audit log');
    }

    return membership;
  });

  return { ok: true, data: { membershipId: newMembership.id } };
});

/**
 * Update a member's role in an organization.
 * Requires owner role.
 */
export const updateOrgMember = withAuthenticatedUser<ActionResult>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof updateOrgMemberSchema>) => {
  // Phase 0 gate: require feature flag + organizer permission OR internal staff with canManageEvents
  const accessError = checkEventsAccess(authContext);
  if (accessError) return { ok: false, ...accessError };

  const validated = updateOrgMemberSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { organizationId, userId, role } = validated.data;

  // Check membership and permissions
  const membership = await getOrgMembership(authContext.user.id, organizationId);
  if (!authContext.permissions.canManageEvents) {
    try {
      requireOrgPermission(membership, 'canManageMembers');
    } catch {
      return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
    }
  }

  // Get current membership
  const current = await db.query.organizationMemberships.findFirst({
    where: and(
      eq(organizationMemberships.organizationId, organizationId),
      eq(organizationMemberships.userId, userId),
      isNull(organizationMemberships.deletedAt),
    ),
  });

  if (!current) {
    return { ok: false, error: 'Membership not found', code: 'NOT_FOUND' };
  }

  // Prevent demoting the last owner
  if (current.role === 'owner' && role !== 'owner') {
    const ownerCount = await db.query.organizationMemberships.findMany({
      where: and(
        eq(organizationMemberships.organizationId, organizationId),
        eq(organizationMemberships.role, 'owner'),
        isNull(organizationMemberships.deletedAt),
      ),
    });
    if (ownerCount.length === 1) {
      return { ok: false, error: 'Cannot demote the last owner', code: 'LAST_OWNER' };
    }
  }

  // Update membership and audit log in a transaction (Phase 0 requirement)
  const requestContext = await getRequestContext(await headers());
  await db.transaction(async (tx) => {
    await tx
      .update(organizationMemberships)
      .set({ role })
      .where(eq(organizationMemberships.id, current.id));

    // Write audit log in same transaction (ensures atomicity)
    const auditResult = await createAuditLog(
      {
        organizationId,
        actorUserId: authContext.user.id,
        action: 'org.member.update',
        entityType: 'organization_membership',
        entityId: current.id,
        before: { userId, role: current.role },
        after: { userId, role },
        request: requestContext,
      },
      tx,
    );

    if (!auditResult.ok) {
      throw new Error('Failed to create audit log');
    }
  });

  return { ok: true, data: undefined };
});

/**
 * Remove a member from an organization.
 * Requires owner role. Cannot remove the last owner.
 */
export const removeOrgMember = withAuthenticatedUser<ActionResult>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof removeOrgMemberSchema>) => {
  // Phase 0 gate: require feature flag + organizer permission OR internal staff with canManageEvents
  const accessError = checkEventsAccess(authContext);
  if (accessError) return { ok: false, ...accessError };

  const validated = removeOrgMemberSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { organizationId, userId } = validated.data;

  // Check membership and permissions
  const membership = await getOrgMembership(authContext.user.id, organizationId);
  if (!authContext.permissions.canManageEvents) {
    try {
      requireOrgPermission(membership, 'canManageMembers');
    } catch {
      return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
    }
  }

  // Get current membership
  const current = await db.query.organizationMemberships.findFirst({
    where: and(
      eq(organizationMemberships.organizationId, organizationId),
      eq(organizationMemberships.userId, userId),
      isNull(organizationMemberships.deletedAt),
    ),
  });

  if (!current) {
    return { ok: false, error: 'Membership not found', code: 'NOT_FOUND' };
  }

  // Prevent removing the last owner
  if (current.role === 'owner') {
    const ownerCount = await db.query.organizationMemberships.findMany({
      where: and(
        eq(organizationMemberships.organizationId, organizationId),
        eq(organizationMemberships.role, 'owner'),
        isNull(organizationMemberships.deletedAt),
      ),
    });
    if (ownerCount.length === 1) {
      return { ok: false, error: 'Cannot remove the last owner', code: 'LAST_OWNER' };
    }
  }

  // Soft delete membership and audit log in a transaction (Phase 0 requirement)
  const requestContext = await getRequestContext(await headers());
  await db.transaction(async (tx) => {
    await tx
      .update(organizationMemberships)
      .set({ deletedAt: new Date() })
      .where(eq(organizationMemberships.id, current.id));

    // Write audit log in same transaction (ensures atomicity)
    const auditResult = await createAuditLog(
      {
        organizationId,
        actorUserId: authContext.user.id,
        action: 'org.member.remove',
        entityType: 'organization_membership',
        entityId: current.id,
        before: { userId, role: current.role },
        request: requestContext,
      },
      tx,
    );

    if (!auditResult.ok) {
      throw new Error('Failed to create audit log');
    }
  });

  return { ok: true, data: undefined };
});

/**
 * Check if an organization slug is available.
 */
export const checkOrgSlugAvailability = withAuthenticatedUser<ActionResult<{ available: boolean }>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, slug: string) => {
  // Phase 0 gate: require feature flag + organizer permission OR internal staff with canManageEvents
  const accessError = checkEventsAccess(authContext);
  if (accessError) return { ok: false, ...accessError };

  const existing = await db.query.organizations.findFirst({
    where: and(eq(organizations.slug, slug), isNull(organizations.deletedAt)),
  });

  return { ok: true, data: { available: !existing } };
});

/**
 * Lookup a user by email for membership management.
 * Requires owner role (or internal staff with canManageEvents).
 */
export const lookupUserByEmail = withAuthenticatedUser<
  ActionResult<{ userId: string; name: string; email: string }>
>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: z.infer<typeof lookupUserByEmailSchema>) => {
  // Phase 0 gate: require feature flag + organizer permission OR internal staff with canManageEvents
  const accessError = checkEventsAccess(authContext);
  if (accessError) return { ok: false, ...accessError };

  const validated = lookupUserByEmailSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { organizationId, email } = validated.data;

  const membership = await getOrgMembership(authContext.user.id, organizationId);
  if (!authContext.permissions.canManageEvents) {
    try {
      requireOrgPermission(membership, 'canManageMembers');
    } catch {
      return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
    }
  }

  const user = await lookupUserByEmailQuery(email);
  if (!user) {
    return { ok: false, error: 'User not found', code: 'NOT_FOUND' };
  }

  return { ok: true, data: { userId: user.id, name: user.name, email: user.email } };
});
