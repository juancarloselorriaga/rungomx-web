/**
 * Database integration tests for cleanupExpiredUnverifiedUsers
 *
 * Tests the cron job logic that hard-deletes expired unverified users.
 */
import * as schema from '@/db/schema';
import { cleanupExpiredUnverifiedUsers } from '@/lib/auth/cleanup-unverified-users';
import { eq, inArray } from 'drizzle-orm';
import { cleanDatabase, getTestDb } from '@/tests/helpers/db';
import {
  assignUserRole,
  createTestAccount,
  createTestContactSubmission,
  createTestProfile,
  createTestRole,
  createTestSession,
  createTestUser,
  createTestVerification,
} from '@/tests/helpers/fixtures';

describe('cleanupExpiredUnverifiedUsers - Database Integration', () => {
  const db = getTestDb();

  beforeEach(async () => {
    await cleanDatabase(db);
  });

  afterAll(async () => {
    await cleanDatabase(db);
  });

  it('deletes unverified users older than cutoff', async () => {
    const now = new Date();
    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago
    const oldDate = new Date(now.getTime() - 48 * 60 * 60 * 1000); // 48 hours ago
    const recentDate = new Date(now.getTime() - 12 * 60 * 60 * 1000); // 12 hours ago

    // Old unverified users (should be deleted)
    const oldUser1 = await createTestUser(db, {
      email: `old1-${Date.now()}@example.com`,
      emailVerified: false,
      createdAt: oldDate,
    });
    const oldUser2 = await createTestUser(db, {
      email: `old2-${Date.now()}@example.com`,
      emailVerified: false,
      createdAt: oldDate,
    });

    // Recent unverified user (should NOT be deleted)
    const recentUser = await createTestUser(db, {
      email: `recent-${Date.now()}@example.com`,
      emailVerified: false,
      createdAt: recentDate,
    });

    const result = await cleanupExpiredUnverifiedUsers(cutoff);

    expect(result.candidates).toBe(2);
    expect(result.deleted).toBe(2);

    // Verify old users are deleted
    const remainingUsers = await db
      .select()
      .from(schema.users)
      .where(inArray(schema.users.id, [oldUser1.id, oldUser2.id, recentUser.id]));

    expect(remainingUsers).toHaveLength(1);
    expect(remainingUsers[0].id).toBe(recentUser.id);
  });

  it('does not delete verified users regardless of age', async () => {
    const now = new Date();
    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oldDate = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    // Old verified user (should NOT be deleted)
    const verifiedUser = await createTestUser(db, {
      email: `verified-${Date.now()}@example.com`,
      emailVerified: true,
      createdAt: oldDate,
    });

    // Old unverified user (should be deleted)
    const unverifiedUser = await createTestUser(db, {
      email: `unverified-${Date.now()}@example.com`,
      emailVerified: false,
      createdAt: oldDate,
    });

    const result = await cleanupExpiredUnverifiedUsers(cutoff);

    expect(result.candidates).toBe(1);
    expect(result.deleted).toBe(1);

    // Verify only unverified user is deleted
    const remainingUsers = await db
      .select()
      .from(schema.users)
      .where(inArray(schema.users.id, [verifiedUser.id, unverifiedUser.id]));

    expect(remainingUsers).toHaveLength(1);
    expect(remainingUsers[0].id).toBe(verifiedUser.id);
  });

  it('hard-deletes related records (sessions, accounts, profiles, userRoles)', async () => {
    const now = new Date();
    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oldDate = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    const user = await createTestUser(db, {
      email: `withdata-${Date.now()}@example.com`,
      emailVerified: false,
      createdAt: oldDate,
    });

    await createTestSession(db, user.id);
    await createTestAccount(db, user.id, { providerId: 'credential' });
    await createTestProfile(db, user.id, { bio: 'Test bio' });
    const role = await createTestRole(db, { name: `member-${Date.now()}` });
    await assignUserRole(db, user.id, role.id);

    await cleanupExpiredUnverifiedUsers(cutoff);

    // Verify all related records are deleted
    const sessions = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.userId, user.id));
    expect(sessions).toHaveLength(0);

    const accounts = await db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.userId, user.id));
    expect(accounts).toHaveLength(0);

    const profiles = await db
      .select()
      .from(schema.profiles)
      .where(eq(schema.profiles.userId, user.id));
    expect(profiles).toHaveLength(0);

    const userRoles = await db
      .select()
      .from(schema.userRoles)
      .where(eq(schema.userRoles.userId, user.id));
    expect(userRoles).toHaveLength(0);
  });

  it('unlinks contact submissions (sets userId to null)', async () => {
    const now = new Date();
    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oldDate = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    const user = await createTestUser(db, {
      email: `contact-${Date.now()}@example.com`,
      emailVerified: false,
      createdAt: oldDate,
    });

    const submission = await createTestContactSubmission(db, {
      userId: user.id,
      name: 'John',
      email: 'john@example.com',
      message: 'Hello',
    });

    await cleanupExpiredUnverifiedUsers(cutoff);

    // Contact submission should still exist but userId should be null
    const [updatedSubmission] = await db
      .select()
      .from(schema.contactSubmissions)
      .where(eq(schema.contactSubmissions.id, submission.id));

    expect(updatedSubmission).toBeDefined();
    expect(updatedSubmission.userId).toBeNull();
    // Original content is preserved (not anonymized like in soft-delete)
    expect(updatedSubmission.name).toBe('John');
    expect(updatedSubmission.message).toBe('Hello');
  });

  it('deletes verification tokens by email', async () => {
    const now = new Date();
    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oldDate = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    const email = `verify-me-${Date.now()}@example.com`;
    await createTestUser(db, {
      email,
      emailVerified: false,
      createdAt: oldDate,
    });

    await createTestVerification(db, {
      identifier: email,
      value: 'verification-token',
    });

    await cleanupExpiredUnverifiedUsers(cutoff);

    const verifications = await db
      .select()
      .from(schema.verifications)
      .where(eq(schema.verifications.identifier, email));

    expect(verifications).toHaveLength(0);
  });

  it('returns correct counts in result', async () => {
    const now = new Date();
    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oldDate = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    await createTestUser(db, {
      email: `count1-${Date.now()}@example.com`,
      emailVerified: false,
      createdAt: oldDate,
    });
    await createTestUser(db, {
      email: `count2-${Date.now()}@example.com`,
      emailVerified: false,
      createdAt: oldDate,
    });
    await createTestUser(db, {
      email: `count3-${Date.now()}@example.com`,
      emailVerified: false,
      createdAt: oldDate,
    });

    const result = await cleanupExpiredUnverifiedUsers(cutoff);

    expect(result.cutoff).toEqual(cutoff);
    expect(result.candidates).toBe(3);
    expect(result.deleted).toBe(3);
  });

  it('returns zero counts when no candidates exist', async () => {
    const now = new Date();
    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const recentDate = new Date(now.getTime() - 12 * 60 * 60 * 1000);

    // Only recent unverified user (not a candidate)
    await createTestUser(db, {
      email: `recent-only-${Date.now()}@example.com`,
      emailVerified: false,
      createdAt: recentDate,
    });

    // Only verified user (not a candidate)
    await createTestUser(db, {
      email: `verified-only-${Date.now()}@example.com`,
      emailVerified: true,
    });

    const result = await cleanupExpiredUnverifiedUsers(cutoff);

    expect(result.candidates).toBe(0);
    expect(result.deleted).toBe(0);
  });
});
