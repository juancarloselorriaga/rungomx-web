/**
 * Database integration tests for deleteUser
 *
 * These tests run against a real test database to verify the GDPR-compliant
 * deletion flow works correctly across all related tables.
 */
import * as schema from '@/db/schema';
import { deleteUser } from '@/lib/users/delete-user';
import { eq } from 'drizzle-orm';
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

describe('deleteUser - Database Integration', () => {
  const db = getTestDb();

  beforeEach(async () => {
    await cleanDatabase(db);
  });

  afterAll(async () => {
    await cleanDatabase(db);
  });

  describe('Successful Deletion', () => {
    it('soft-deletes user and anonymizes fields correctly', async () => {
      const user = await createTestUser(db, {
        email: 'person@example.com',
        name: 'John Doe',
      });

      const result = await deleteUser({
        targetUserId: user.id,
        deletedByUserId: user.id,
      });

      expect(result).toEqual({
        ok: true,
        deletedUser: { email: 'person@example.com', name: 'John Doe', locale: null },
      });

      const [deletedUser] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, user.id));

      expect(deletedUser.deletedAt).not.toBeNull();
      expect(deletedUser.deletedByUserId).toBe(user.id);
      expect(deletedUser.email).toBe(`deleted+${user.id}@example.invalid`);
      expect(deletedUser.name).toBe('Deleted user');
      expect(deletedUser.image).toBeNull();
      expect(deletedUser.emailVerified).toBe(false);
    });

    it('deletes all sessions for the user (hard delete)', async () => {
      const user = await createTestUser(db);
      await createTestSession(db, user.id, { token: 'session-1' });
      await createTestSession(db, user.id, { token: 'session-2' });

      await deleteUser({ targetUserId: user.id, deletedByUserId: user.id });

      const sessions = await db
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.userId, user.id));

      expect(sessions).toHaveLength(0);
    });

    it('deletes all accounts for the user (hard delete)', async () => {
      const user = await createTestUser(db);
      await createTestAccount(db, user.id, { providerId: 'credential', password: 'hashed-pw' });

      await deleteUser({ targetUserId: user.id, deletedByUserId: user.id });

      const accounts = await db
        .select()
        .from(schema.accounts)
        .where(eq(schema.accounts.userId, user.id));

      expect(accounts).toHaveLength(0);
    });

    it('soft-deletes userRoles with timestamp', async () => {
      const user = await createTestUser(db);
      const role = await createTestRole(db, { name: `admin-${Date.now()}` });
      await assignUserRole(db, user.id, role.id);

      await deleteUser({ targetUserId: user.id, deletedByUserId: user.id });

      const userRoles = await db
        .select()
        .from(schema.userRoles)
        .where(eq(schema.userRoles.userId, user.id));

      expect(userRoles).toHaveLength(1);
      expect(userRoles[0].deletedAt).not.toBeNull();
    });

    it('anonymizes profile data but preserves country default', async () => {
      const user = await createTestUser(db);
      await createTestProfile(db, user.id, {
        bio: 'My bio',
        phone: '+1234567890',
        city: 'Mexico City',
        state: 'CDMX',
        medicalConditions: 'Diabetes',
        bloodType: 'A+',
        emergencyContactName: 'Jane Doe',
        emergencyContactPhone: '+0987654321',
      });

      await deleteUser({ targetUserId: user.id, deletedByUserId: user.id });

      const [profile] = await db
        .select()
        .from(schema.profiles)
        .where(eq(schema.profiles.userId, user.id));

      expect(profile.deletedAt).not.toBeNull();
      expect(profile.bio).toBeNull();
      expect(profile.phone).toBeNull();
      expect(profile.city).toBeNull();
      expect(profile.state).toBeNull();
      expect(profile.medicalConditions).toBeNull();
      expect(profile.bloodType).toBeNull();
      expect(profile.emergencyContactName).toBeNull();
      expect(profile.emergencyContactPhone).toBeNull();
      expect(profile.country).toBe('MX');
    });

    it('returns profile locale for notification emails before wiping', async () => {
      const user = await createTestUser(db, {
        email: 'english-user@example.com',
        name: 'English User',
      });
      await createTestProfile(db, user.id, { locale: 'en' });

      const result = await deleteUser({
        targetUserId: user.id,
        deletedByUserId: user.id,
      });

      expect(result).toEqual({
        ok: true,
        deletedUser: {
          email: 'english-user@example.com',
          name: 'English User',
          locale: 'en',
        },
      });
    });

    it('anonymizes contact submissions linked to user', async () => {
      const user = await createTestUser(db);
      const submission = await createTestContactSubmission(db, {
        userId: user.id,
        name: 'John Doe',
        email: 'john@example.com',
        message: 'Hello, this is my message',
        metadata: { source: 'contact-form' },
      });

      await deleteUser({ targetUserId: user.id, deletedByUserId: user.id });

      const [redacted] = await db
        .select()
        .from(schema.contactSubmissions)
        .where(eq(schema.contactSubmissions.id, submission.id));

      expect(redacted.userId).toBeNull();
      expect(redacted.name).toBeNull();
      expect(redacted.email).toBeNull();
      expect(redacted.message).toBe('[redacted]');
      expect(redacted.metadata).toEqual({});
    });

    it('deletes verification tokens for user email', async () => {
      const email = `verify-${Date.now()}@example.com`;
      const user = await createTestUser(db, { email });
      await createTestVerification(db, { identifier: email, value: 'verification-code' });

      await deleteUser({ targetUserId: user.id, deletedByUserId: user.id });

      const verifications = await db
        .select()
        .from(schema.verifications)
        .where(eq(schema.verifications.identifier, email));

      expect(verifications).toHaveLength(0);
    });

    it('handles user with no related records gracefully', async () => {
      const user = await createTestUser(db);

      const result = await deleteUser({ targetUserId: user.id, deletedByUserId: user.id });

      expect(result.ok).toBe(true);

      const [deletedUser] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, user.id));

      expect(deletedUser.deletedAt).not.toBeNull();
    });

    it('correctly tracks who deleted the user (deletedByUserId)', async () => {
      const admin = await createTestUser(db, { email: `admin-${Date.now()}@example.com` });
      const target = await createTestUser(db, { email: `target-${Date.now()}@example.com` });

      await deleteUser({ targetUserId: target.id, deletedByUserId: admin.id });

      const [deletedUser] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, target.id));

      expect(deletedUser.deletedByUserId).toBe(admin.id);
    });
  });

  describe('Idempotency and Edge Cases', () => {
    it('returns NOT_FOUND for already soft-deleted user', async () => {
      const user = await createTestUser(db);

      const firstDelete = await deleteUser({ targetUserId: user.id, deletedByUserId: user.id });
      expect(firstDelete.ok).toBe(true);

      const secondDelete = await deleteUser({ targetUserId: user.id, deletedByUserId: user.id });
      expect(secondDelete).toEqual({ ok: false, error: 'NOT_FOUND' });
    });

    it('returns NOT_FOUND for non-existent user', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';

      const result = await deleteUser({
        targetUserId: nonExistentId,
        deletedByUserId: nonExistentId,
      });

      expect(result).toEqual({ ok: false, error: 'NOT_FOUND' });
    });
  });

  describe('Referential Integrity', () => {
    it('soft-deleted user sessions are invalidated', async () => {
      const user = await createTestUser(db);
      const session = await createTestSession(db, user.id);

      await deleteUser({ targetUserId: user.id, deletedByUserId: user.id });

      const validSessions = await db
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.token, session.token));

      expect(validSessions).toHaveLength(0);
    });
  });
});
