/**
 * Organization-scoped permission checking utilities.
 * These functions handle authorization for organization-level actions.
 */

import { and, eq, isNull } from 'drizzle-orm';

import { db } from '@/db';
import { eventEditions, eventSeries, organizationMemberships } from '@/db/schema';
import {
  hasMinimumRole,
  ORG_MEMBERSHIP_ROLES,
  type OrgMembershipRole,
} from '@/lib/events/constants';

/**
 * Organization membership with computed properties.
 */
export interface OrgMembership {
  organizationId: string;
  role: OrgMembershipRole;
  organizationName?: string;
  organizationSlug?: string;
}

/**
 * Permission capabilities for organization members.
 * Based on the permission matrix in the plan document.
 */
export interface OrgPermissions {
  canEditEventConfig: boolean;
  canPublishEvents: boolean;
  canEditRegistrationSettings: boolean;
  canViewRegistrations: boolean;
  canExportRegistrations: boolean;
  canManageMembers: boolean;
}

/**
 * Get the permissions for a given organization role.
 *
 * Permission Matrix:
 * | Role   | Event config | Publish | Registration settings | View registrations | Export | Manage members |
 * |--------|--------------|---------|----------------------|-------------------|--------|----------------|
 * | owner  | Yes          | Yes     | Yes                  | Yes               | Yes    | Yes            |
 * | admin  | Yes          | Yes     | Yes                  | Yes               | Yes    | No             |
 * | editor | Yes          | No      | Yes (except publish) | No                | No     | No             |
 * | viewer | Read-only    | No      | Read-only            | No                | No     | No             |
 */
export function getOrgPermissions(role: OrgMembershipRole): OrgPermissions {
  switch (role) {
    case 'owner':
      return {
        canEditEventConfig: true,
        canPublishEvents: true,
        canEditRegistrationSettings: true,
        canViewRegistrations: true,
        canExportRegistrations: true,
        canManageMembers: true,
      };
    case 'admin':
      return {
        canEditEventConfig: true,
        canPublishEvents: true,
        canEditRegistrationSettings: true,
        canViewRegistrations: true,
        canExportRegistrations: true,
        canManageMembers: false,
      };
    case 'editor':
      return {
        canEditEventConfig: true,
        canPublishEvents: false,
        canEditRegistrationSettings: true,
        canViewRegistrations: false,
        canExportRegistrations: false,
        canManageMembers: false,
      };
    case 'viewer':
      return {
        canEditEventConfig: false,
        canPublishEvents: false,
        canEditRegistrationSettings: false,
        canViewRegistrations: false,
        canExportRegistrations: false,
        canManageMembers: false,
      };
  }
}

/**
 * Check if a user has a specific permission in an organization.
 *
 * @param role - The user's role in the organization
 * @param permission - The permission to check
 * @returns true if the user has the permission
 */
export function hasOrgPermission(
  role: OrgMembershipRole,
  permission: keyof OrgPermissions,
): boolean {
  const permissions = getOrgPermissions(role);
  return permissions[permission];
}

/**
 * Get a user's membership in an organization.
 *
 * @param userId - The user's ID
 * @param organizationId - The organization ID
 * @returns The membership or null if not a member
 */
export async function getOrgMembership(
  userId: string,
  organizationId: string,
): Promise<OrgMembership | null> {
  const membership = await db.query.organizationMemberships.findFirst({
    where: and(
      eq(organizationMemberships.userId, userId),
      eq(organizationMemberships.organizationId, organizationId),
      isNull(organizationMemberships.deletedAt),
    ),
    with: {
      organization: true,
    },
  });

  if (!membership) {
    return null;
  }

  // Validate that the role is a valid OrgMembershipRole
  if (!ORG_MEMBERSHIP_ROLES.includes(membership.role as OrgMembershipRole)) {
    console.warn(`Invalid organization role: ${membership.role}`);
    return null;
  }

  return {
    organizationId: membership.organizationId,
    role: membership.role as OrgMembershipRole,
    organizationName: membership.organization?.name,
    organizationSlug: membership.organization?.slug,
  };
}

/**
 * Get all organization memberships for a user.
 *
 * @param userId - The user's ID
 * @returns Array of organization memberships
 */
export async function getUserOrgMemberships(userId: string): Promise<OrgMembership[]> {
  const memberships = await db.query.organizationMemberships.findMany({
    where: and(
      eq(organizationMemberships.userId, userId),
      isNull(organizationMemberships.deletedAt),
    ),
    with: {
      organization: true,
    },
  });

  return memberships
    .filter((m) => ORG_MEMBERSHIP_ROLES.includes(m.role as OrgMembershipRole))
    .map((m) => ({
      organizationId: m.organizationId,
      role: m.role as OrgMembershipRole,
      organizationName: m.organization?.name,
      organizationSlug: m.organization?.slug,
    }));
}

/**
 * Check if a user can access an event (via series → organization chain).
 *
 * @param userId - The user's ID
 * @param eventId - The event edition ID
 * @returns The membership if user has access, null otherwise
 */
export async function canUserAccessEvent(
  userId: string,
  eventId: string,
): Promise<OrgMembership | null> {
  // Get the event's organization via series
  const event = await db.query.eventEditions.findFirst({
    where: and(eq(eventEditions.id, eventId), isNull(eventEditions.deletedAt)),
    with: {
      series: true,
    },
  });

  if (!event?.series) {
    return null;
  }

  return getOrgMembership(userId, event.series.organizationId);
}

/**
 * Check if a user can access an event series.
 *
 * @param userId - The user's ID
 * @param seriesId - The event series ID
 * @returns The membership if user has access, null otherwise
 */
export async function canUserAccessSeries(
  userId: string,
  seriesId: string,
): Promise<OrgMembership | null> {
  const series = await db.query.eventSeries.findFirst({
    where: and(eq(eventSeries.id, seriesId), isNull(eventSeries.deletedAt)),
  });

  if (!series) {
    return null;
  }

  return getOrgMembership(userId, series.organizationId);
}

/**
 * Require a minimum organization role for an action.
 * Throws an error if the user doesn't have the required role.
 *
 * @param membership - The user's organization membership
 * @param requiredRole - The minimum required role
 * @throws Error if the user doesn't have the required role
 */
export function requireOrgRole(
  membership: OrgMembership | null,
  requiredRole: OrgMembershipRole,
): asserts membership is OrgMembership {
  if (!membership) {
    throw new Error('User is not a member of this organization');
  }

  if (!hasMinimumRole(membership.role, requiredRole)) {
    throw new Error(
      `Insufficient permissions. Required: ${requiredRole}, Current: ${membership.role}`,
    );
  }
}

/**
 * Require a specific organization permission for an action.
 * Throws an error if the user doesn't have the required permission.
 *
 * @param membership - The user's organization membership
 * @param permission - The required permission
 * @throws Error if the user doesn't have the required permission
 */
export function requireOrgPermission(
  membership: OrgMembership | null,
  permission: keyof OrgPermissions,
): asserts membership is OrgMembership {
  if (!membership) {
    throw new Error('User is not a member of this organization');
  }

  if (!hasOrgPermission(membership.role, permission)) {
    throw new Error(`Permission denied: ${permission}`);
  }
}
