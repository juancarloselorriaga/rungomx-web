import { and, asc, eq, ilike, isNull } from 'drizzle-orm';

import { db } from '@/db';
import { organizationMemberships, organizations, users } from '@/db/schema';
import type { OrgMembershipRole } from '@/lib/events/constants';
import { ORG_MEMBERSHIP_ROLES } from '@/lib/events/constants';

export type UserOrganization = {
  id: string;
  name: string;
  slug: string;
  role: OrgMembershipRole;
  createdAt: Date;
};

export type OrganizationSummary = {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
};

export type OrganizationMember = {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: OrgMembershipRole;
};

export type OrganizationWithMembers = OrganizationSummary & {
  members: OrganizationMember[];
};

/**
 * Get all organizations a user is a member of.
 */
export async function getUserOrganizations(userId: string): Promise<UserOrganization[]> {
  const memberships = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      role: organizationMemberships.role,
      createdAt: organizations.createdAt,
    })
    .from(organizationMemberships)
    .innerJoin(organizations, eq(organizationMemberships.organizationId, organizations.id))
    .where(
      and(
        eq(organizationMemberships.userId, userId),
        isNull(organizationMemberships.deletedAt),
        isNull(organizations.deletedAt),
      ),
    )
    .orderBy(asc(organizations.name));

  return memberships
    .filter((m) => ORG_MEMBERSHIP_ROLES.includes(m.role as OrgMembershipRole))
    .map((m) => ({
      id: m.id,
      name: m.name,
      slug: m.slug,
      role: m.role as OrgMembershipRole,
      createdAt: m.createdAt,
    }));
}

/**
 * Get all organizations (staff/support listing).
 */
export async function getAllOrganizations(): Promise<OrganizationSummary[]> {
  const rows = await db.query.organizations.findMany({
    where: isNull(organizations.deletedAt),
    orderBy: [asc(organizations.name)],
  });

  return rows.map((org) => ({
    id: org.id,
    name: org.name,
    slug: org.slug,
    createdAt: org.createdAt,
  }));
}

/**
 * Get organization details by ID.
 */
export async function getOrganizationSummary(
  organizationId: string,
): Promise<OrganizationSummary | null> {
  const org = await db.query.organizations.findFirst({
    where: and(eq(organizations.id, organizationId), isNull(organizations.deletedAt)),
  });

  if (!org) return null;

  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    createdAt: org.createdAt,
  };
}

/**
 * Get members of an organization.
 */
export async function getOrganizationMembers(
  organizationId: string,
): Promise<OrganizationMember[]> {
  const members = await db
    .select({
      membershipId: organizationMemberships.id,
      userId: users.id,
      name: users.name,
      email: users.email,
      role: organizationMemberships.role,
    })
    .from(organizationMemberships)
    .innerJoin(users, eq(organizationMemberships.userId, users.id))
    .where(
      and(
        eq(organizationMemberships.organizationId, organizationId),
        isNull(organizationMemberships.deletedAt),
        isNull(users.deletedAt),
      ),
    )
    .orderBy(asc(users.name), asc(users.email));

  return members
    .filter((m) => ORG_MEMBERSHIP_ROLES.includes(m.role as OrgMembershipRole))
    .map((m) => ({
      membershipId: m.membershipId,
      userId: m.userId,
      name: m.name,
      email: m.email,
      role: m.role as OrgMembershipRole,
    }));
}

/**
 * Get organization with its members.
 */
export async function getOrganizationWithMembers(
  organizationId: string,
): Promise<OrganizationWithMembers | null> {
  const org = await getOrganizationSummary(organizationId);
  if (!org) return null;

  const members = await getOrganizationMembers(organizationId);

  return { ...org, members };
}

/**
 * Lookup a user by email address.
 */
export async function lookupUserByEmail(email: string): Promise<{
  id: string;
  name: string;
  email: string;
} | null> {
  const trimmed = email.trim();
  if (!trimmed) return null;

  const user = await db.query.users.findFirst({
    where: and(ilike(users.email, trimmed), isNull(users.deletedAt)),
  });

  if (!user) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
  };
}
