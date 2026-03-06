/**
 * E2E Test Data Fixtures
 * Creates test users and seed data for E2E suites
 */

import type { getTestDb } from './db';
import * as schema from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { hashPassword } from 'better-auth/crypto';
import type { Page } from '@playwright/test';

const USER_PERSISTENCE_MAX_RETRIES = 20;
const USER_PERSISTENCE_DELAY_MS = 300;

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForUserPersistence(
  db: ReturnType<typeof getTestDb>,
  userId: string,
  context: string,
) {
  for (let attempt = 1; attempt <= USER_PERSISTENCE_MAX_RETRIES; attempt += 1) {
    const [user] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (user) {
      return;
    }

    if (attempt < USER_PERSISTENCE_MAX_RETRIES) {
      await sleep(USER_PERSISTENCE_DELAY_MS);
    }
  }

  const dbHost = (() => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) return 'missing';
    try {
      return new URL(databaseUrl).host;
    } catch {
      return 'invalid';
    }
  })();

  throw new Error(
    `[E2E fixtures] user ${userId} not visible after ${USER_PERSISTENCE_MAX_RETRIES} attempts` +
      ` during ${context}. NODE_ENV=${process.env.NODE_ENV ?? 'undefined'} DATABASE_HOST=${dbHost}`,
  );
}

async function waitForCredentialAccountPersistence(
  db: ReturnType<typeof getTestDb>,
  userId: string,
  context: string,
) {
  for (let attempt = 1; attempt <= USER_PERSISTENCE_MAX_RETRIES; attempt += 1) {
    const [user] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    const [account] = await db
      .select({ id: schema.accounts.id })
      .from(schema.accounts)
      .where(
        and(
          eq(schema.accounts.userId, userId),
          eq(schema.accounts.providerId, 'credential'),
          eq(schema.accounts.accountId, userId),
        ),
      )
      .limit(1);

    if (user && account) {
      return;
    }

    if (attempt < USER_PERSISTENCE_MAX_RETRIES) {
      await sleep(USER_PERSISTENCE_DELAY_MS);
    }
  }

  throw new Error(
    `[E2E fixtures] auth records for user ${userId} not visible after ${USER_PERSISTENCE_MAX_RETRIES} attempts during ${context}`,
  );
}

/**
 * Create a new test user through the real sign-up flow.
 * This keeps Better Auth user/account records aligned with runtime expectations.
 *
 * @param page - Playwright page instance
 * @param prefix - Unique prefix for email/name (e.g., 'org-auth-', 'athlete-reg-')
 * @param overrides - Optional overrides for name/password
 * @returns User credentials (email, password, name)
 */
export async function signUpTestUser(
  page: Page,
  prefix: string,
  overrides?: {
    name?: string;
    password?: string;
  },
): Promise<{ id: string; email: string; password: string; name: string }> {
  // Kept for backward compatibility with existing call sites.
  void page;

  const timestamp = Date.now();
  const email = `${prefix}${timestamp}@test.example.com`;
  const name = overrides?.name ?? `${prefix}${timestamp}`;
  const password = overrides?.password ?? `TestE2E!${timestamp}Pass`;

  const userId = randomUUID();

  // Use Better Auth's own hash implementation to avoid format drift.
  const hashedPassword = await hashPassword(password);

  const { getTestDb } = await import('./db');
  const db = getTestDb();

  await db.transaction(async (tx) => {
    await tx.insert(schema.users).values({
      id: userId,
      name,
      email,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Better Auth seeds credential accounts with accountId=userId.
    await tx.insert(schema.accounts).values({
      id: randomUUID(),
      userId,
      accountId: userId,
      providerId: 'credential',
      password: hashedPassword,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  await waitForCredentialAccountPersistence(db, userId, 'signUpTestUser');

  return { id: userId, email, password, name };
}

/**
 * Set user's email as verified (bypass email confirmation)
 * Call this after signUpTestUser() to allow immediate sign-in
 *
 * @param db - Database instance from getTestDb()
 * @param email - User's email address
 */
export async function setUserVerified(
  db: ReturnType<typeof getTestDb>,
  email: string,
): Promise<void> {
  await db
    .update(schema.users)
    .set({ emailVerified: true })
    .where(eq(schema.users.email, email));
}

/**
 * Get user from database by email address
 * Retries a few times to handle timing issues with DB writes
 *
 * @param db - Database instance from getTestDb()
 * @param email - User's email address
 * @returns User object or undefined if not found
 */
export async function getUserByEmail(
  db: ReturnType<typeof getTestDb>,
  email: string,
) {
  // Retry up to 10 times with 500ms delay (5 seconds total)
  for (let i = 0; i < 10; i++) {
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);

    if (user) {
      return user;
    }

    // Wait before retrying
    if (i < 9) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  return undefined;
}

/**
 * Create a test profile for a user
 * Call this after user creation to complete user setup
 *
 * @param db - Database instance from getTestDb()
 * @param userId - User's ID
 * @param overrides - Optional profile fields
 * @returns Created profile
 */
export async function createTestProfile(
  db: ReturnType<typeof getTestDb>,
  userId: string,
  overrides: {
    bio?: string | null;
    dateOfBirth?: Date | null;
    gender?: string | null;
    phone?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
    country?: string;
    locale?: string | null;
    emergencyContactName?: string | null;
    emergencyContactPhone?: string | null;
    medicalConditions?: string | null;
    bloodType?: string | null;
    shirtSize?: string | null;
  } = {},
) {
  await waitForUserPersistence(db, userId, 'createTestProfile');

  const [profile] = await db
    .insert(schema.profiles)
    .values({
      userId,
      bio: overrides.bio,
      dateOfBirth: overrides.dateOfBirth,
      gender: overrides.gender,
      phone: overrides.phone,
      city: overrides.city,
      state: overrides.state,
      postalCode: overrides.postalCode,
      country: overrides.country ?? 'MX',
      locale: overrides.locale,
      emergencyContactName: overrides.emergencyContactName,
      emergencyContactPhone: overrides.emergencyContactPhone,
      medicalConditions: overrides.medicalConditions,
      bloodType: overrides.bloodType,
      shirtSize: overrides.shirtSize,
    })
    .returning();

  return profile;
}

/**
 * Create a test role
 *
 * @param db - Database instance from getTestDb()
 * @param overrides - Optional role fields
 * @returns Created role
 */
export async function createTestRole(
  db: ReturnType<typeof getTestDb>,
  overrides: {
    name?: string;
    description?: string;
  } = {},
) {
  const [role] = await db
    .insert(schema.roles)
    .values({
      name: overrides.name ?? `role-${Date.now()}`,
      description: overrides.description ?? 'Test role',
    })
    .returning();

  return role;
}

/**
 * Assign a role to a user
 *
 * @param db - Database instance from getTestDb()
 * @param userId - User's ID
 * @param roleId - Role's ID
 * @returns Created user-role relationship
 */
export async function assignUserRole(
  db: ReturnType<typeof getTestDb>,
  userId: string,
  roleId: string,
) {
  await waitForUserPersistence(db, userId, 'assignUserRole');

  const [userRole] = await db
    .insert(schema.userRoles)
    .values({
      userId,
      roleId,
    })
    .returning();

  return userRole;
}

/**
 * Assign external role to a user (e.g., 'organizer', 'athlete', 'volunteer')
 * This prevents the role selection modal from appearing
 *
 * @param db - Database instance from getTestDb()
 * @param userId - User's ID
 * @param roleName - Role name (e.g., 'organizer', 'athlete', 'volunteer')
 * @returns Created user-role relationship
 */
export async function assignExternalRole(
  db: ReturnType<typeof getTestDb>,
  userId: string,
  roleName: 'organizer' | 'athlete' | 'volunteer',
) {
  await waitForUserPersistence(db, userId, 'assignExternalRole');

  // First, check if the role already exists
  let role = await db.query.roles.findFirst({
    where: eq(schema.roles.name, roleName),
  });

  // If the role doesn't exist, create it
  if (!role) {
    const [newRole] = await db
      .insert(schema.roles)
      .values({
        name: roleName,
        description: `External ${roleName} role`,
      })
      .onConflictDoNothing()
      .returning();

    role =
      newRole ??
      (await db.query.roles.findFirst({
        where: eq(schema.roles.name, roleName),
      }));
  }

  if (!role) {
    throw new Error(`Failed to ensure role exists: ${roleName}`);
  }

  // Assign the role to the user
  const [userRole] = await db
    .insert(schema.userRoles)
    .values({
      userId,
      roleId: role.id,
    })
    .returning();

  return userRole;
}

/**
 * Create a test organization
 *
 * @param db - Database instance from getTestDb()
 * @param userId - Owner user's ID (added as membership with 'owner' role)
 * @param overrides - Optional organization fields
 * @returns Created organization
 */
export async function createTestOrganization(
  db: ReturnType<typeof getTestDb>,
  userId: string,
  overrides: {
    name?: string;
    slug?: string;
  } = {},
) {
  await waitForUserPersistence(db, userId, 'createTestOrganization');

  const timestamp = Date.now();
  const [organization] = await db
    .insert(schema.organizations)
    .values({
      name: overrides.name ?? `Test Org ${timestamp}`,
      slug: overrides.slug ?? `test-org-${timestamp}`,
    })
    .returning();

  // Add owner membership
  await db.insert(schema.organizationMemberships).values({
    organizationId: organization.id,
    userId,
    role: 'owner',
  });

  return organization;
}

/**
 * Create a test event series
 *
 * @param db - Database instance from getTestDb()
 * @param organizationId - Organization's ID
 * @param overrides - Optional event series fields
 * @returns Created event series
 */
export async function createTestEventSeries(
  db: ReturnType<typeof getTestDb>,
  organizationId: string,
  overrides: {
    name?: string;
    slug?: string;
    sportType?: string;
    status?: 'active' | 'archived';
  } = {},
) {
  const timestamp = Date.now();
  const [series] = await db
    .insert(schema.eventSeries)
    .values({
      name: overrides.name ?? `Test Event ${timestamp}`,
      slug: overrides.slug ?? `test-event-${timestamp}`,
      sportType: overrides.sportType ?? 'trail_running',
      status: overrides.status ?? 'active',
      organizationId,
    })
    .returning();

  return series;
}

/**
 * Create a test event edition
 *
 * @param db - Database instance from getTestDb()
 * @param seriesId - Event series ID
 * @param overrides - Optional event edition fields
 * @returns Created event edition
 */
export async function createTestEventEdition(
  db: ReturnType<typeof getTestDb>,
  seriesId: string,
  overrides: {
    editionLabel?: string;
    slug?: string;
    publicCode?: string;
    visibility?: 'draft' | 'published' | 'unlisted' | 'archived';
    startsAt?: Date | null;
    endsAt?: Date | null;
    timezone?: string;
    registrationOpensAt?: Date | null;
    registrationClosesAt?: Date | null;
    isRegistrationPaused?: boolean;
    locationDisplay?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    country?: string | null;
    latitude?: string | null;
    longitude?: string | null;
    description?: string | null;
  } = {},
) {
  const timestamp = Date.now();
  const [edition] = await db
    .insert(schema.eventEditions)
    .values({
      editionLabel: overrides.editionLabel ?? `${timestamp}`,
      slug: overrides.slug ?? `edition-${timestamp}`,
      publicCode: overrides.publicCode ?? `TEST${timestamp.toString().slice(-8)}`,
      visibility: overrides.visibility ?? 'draft',
      startsAt: overrides.startsAt,
      endsAt: overrides.endsAt,
      timezone: overrides.timezone ?? 'America/Mexico_City',
      registrationOpensAt: overrides.registrationOpensAt,
      registrationClosesAt: overrides.registrationClosesAt,
      isRegistrationPaused: overrides.isRegistrationPaused ?? false,
      locationDisplay: overrides.locationDisplay,
      address: overrides.address,
      city: overrides.city,
      state: overrides.state,
      country: overrides.country ?? 'MX',
      latitude: overrides.latitude,
      longitude: overrides.longitude,
      description: overrides.description,
      seriesId,
    })
    .returning();

  return edition;
}

/**
 * Create a test event distance
 *
 * @param db - Database instance from getTestDb()
 * @param editionId - Event edition ID
 * @param overrides - Optional distance fields
 * @returns Created event distance
 */
export async function createTestDistance(
  db: ReturnType<typeof getTestDb>,
  editionId: string,
  overrides: {
    label?: string;
    distanceValue?: string;
    distanceUnit?: 'km' | 'mi';
    kind?: 'distance' | 'timed';
    terrain?: 'road' | 'trail' | 'mixed';
    capacity?: number | null;
    isVirtual?: boolean;
    sortOrder?: number;
  } = {},
) {
  const [distance] = await db
    .insert(schema.eventDistances)
    .values({
      label: overrides.label ?? '10K',
      distanceValue: overrides.distanceValue ?? '10',
      distanceUnit: overrides.distanceUnit ?? 'km',
      kind: overrides.kind ?? 'distance',
      terrain: overrides.terrain ?? 'road',
      capacity: overrides.capacity,
      isVirtual: overrides.isVirtual ?? false,
      sortOrder: overrides.sortOrder ?? 0,
      editionId,
    })
    .returning();

  return distance;
}

/**
 * Create a test pricing tier for a distance
 *
 * @param db - Database instance from getTestDb()
 * @param distanceId - Distance ID
 * @param overrides - Optional pricing tier fields
 * @returns Created pricing tier
 */
export async function createTestPricingTier(
  db: ReturnType<typeof getTestDb>,
  distanceId: string,
  overrides: {
    label?: string | null;
    priceCents?: number;
    currency?: string;
    startsAt?: Date | null;
    endsAt?: Date | null;
    sortOrder?: number;
  } = {},
) {
  const [tier] = await db
    .insert(schema.pricingTiers)
    .values({
      label: overrides.label ?? 'Early Bird',
      priceCents: overrides.priceCents ?? 50000, // MX$500.00
      currency: overrides.currency ?? 'MXN',
      startsAt: overrides.startsAt,
      endsAt: overrides.endsAt,
      sortOrder: overrides.sortOrder ?? 0,
      distanceId,
    })
    .returning();

  return tier;
}

/**
 * Delete all registrations for a user
 * Useful for cleaning up incomplete registrations between tests
 *
 * @param db - Database instance from getTestDb()
 * @param userId - User's ID
 */
export async function deleteUserRegistrations(
  db: ReturnType<typeof getTestDb>,
  userId: string,
) {
  // First delete child records (registrants, waiver_acceptances)
  // These have cascade delete from registrations, but being explicit
  const userRegistrations = await db
    .select({ id: schema.registrations.id })
    .from(schema.registrations)
    .where(eq(schema.registrations.buyerUserId, userId));

  for (const reg of userRegistrations) {
    await db
      .delete(schema.waiverAcceptances)
      .where(eq(schema.waiverAcceptances.registrationId, reg.id));
    await db
      .delete(schema.registrants)
      .where(eq(schema.registrants.registrationId, reg.id));
  }

  // Delete registrations
  await db
    .delete(schema.registrations)
    .where(eq(schema.registrations.buyerUserId, userId));
}
