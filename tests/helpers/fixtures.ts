import * as schema from '@/db/schema';
import { randomUUID } from 'crypto';
import type { getTestDb } from './db';

/**
 * Create a test user with default values
 */
export async function createTestUser(
  db: ReturnType<typeof getTestDb>,
  overrides: {
    email?: string;
    name?: string;
    emailVerified?: boolean;
    createdAt?: Date;
  } = {},
) {
  const now = Date.now();
  const [user] = await db
    .insert(schema.users)
    .values({
      email: overrides.email ?? `test-${now}@example.com`,
      name: overrides.name ?? `test-${now}`,
      emailVerified: overrides.emailVerified ?? false,
      createdAt: overrides.createdAt,
    })
    .returning();

  return user;
}

/**
 * Create a test role
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
 */
export async function assignUserRole(
  db: ReturnType<typeof getTestDb>,
  userId: string,
  roleId: string,
) {
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
 * Create a test account (credential or OAuth)
 */
export async function createTestAccount(
  db: ReturnType<typeof getTestDb>,
  userId: string,
  overrides: {
    providerId?: string;
    accountId?: string;
    password?: string | null;
    deletedAt?: Date | null;
  } = {},
) {
  const [account] = await db
    .insert(schema.accounts)
    .values({
      userId,
      providerId: overrides.providerId ?? 'credential',
      accountId: overrides.accountId ?? userId,
      password: overrides.password,
      deletedAt: overrides.deletedAt,
    })
    .returning();

  return account;
}

/**
 * Create a test session
 */
export async function createTestSession(
  db: ReturnType<typeof getTestDb>,
  userId: string,
  overrides: {
    token?: string;
    expiresAt?: Date;
    ipAddress?: string;
    userAgent?: string;
  } = {},
) {
  const [session] = await db
    .insert(schema.sessions)
    .values({
      userId,
      token: overrides.token ?? randomUUID(),
      expiresAt: overrides.expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000),
      ipAddress: overrides.ipAddress,
      userAgent: overrides.userAgent,
    })
    .returning();

  return session;
}

/**
 * Create a test profile
 */
export async function createTestProfile(
  db: ReturnType<typeof getTestDb>,
  userId: string,
  overrides: {
    bio?: string | null;
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
  } = {},
) {
  const [profile] = await db
    .insert(schema.profiles)
    .values({
      userId,
      bio: overrides.bio,
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
    })
    .returning();

  return profile;
}

/**
 * Create a test contact submission
 */
export async function createTestContactSubmission(
  db: ReturnType<typeof getTestDb>,
  overrides: {
    userId?: string | null;
    name?: string | null;
    email?: string | null;
    message?: string;
    origin?: string;
    metadata?: Record<string, unknown>;
  } = {},
) {
  const [submission] = await db
    .insert(schema.contactSubmissions)
    .values({
      userId: overrides.userId,
      name: overrides.name ?? 'Test Contact',
      email: overrides.email ?? 'contact@example.com',
      message: overrides.message ?? 'Test message',
      origin: overrides.origin ?? 'test',
      metadata: overrides.metadata ?? {},
    })
    .returning();

  return submission;
}

/**
 * Create a test verification record
 */
export async function createTestVerification(
  db: ReturnType<typeof getTestDb>,
  overrides: {
    identifier?: string;
    value?: string;
    expiresAt?: Date;
  } = {},
) {
  const [verification] = await db
    .insert(schema.verifications)
    .values({
      identifier: overrides.identifier ?? `test-${Date.now()}@example.com`,
      value: overrides.value ?? randomUUID(),
      expiresAt: overrides.expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000),
    })
    .returning();

  return verification;
}
