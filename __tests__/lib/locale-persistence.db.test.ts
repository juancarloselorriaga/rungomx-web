jest.mock('next-intl/routing', () => ({
  defineRouting: jest.fn(() => ({
    locales: ['es', 'en'] as const,
    defaultLocale: 'es',
    localePrefix: 'as-needed',
    pathnames: {},
  })),
}));

import * as schema from '@/db/schema';
import { upsertProfile } from '@/lib/profiles/repository';
import { cleanDatabase, getTestDb } from '@/tests/helpers/db';
import { createTestProfile, createTestUser } from '@/tests/helpers/fixtures';
import { eq } from 'drizzle-orm';

describe('Locale Persistence - Database Integration', () => {
  const db = getTestDb();

  beforeEach(async () => {
    await cleanDatabase(db);
  });

  afterAll(async () => {
    await cleanDatabase(db);
  });

  describe('Profile Locale Field', () => {
    it('creates profile with locale field', async () => {
      const user = await createTestUser(db);
      const profile = await createTestProfile(db, user.id, { locale: 'en' });

      expect(profile.locale).toBe('en');
    });

    it('allows null locale for backward compatibility', async () => {
      const user = await createTestUser(db);
      const profile = await createTestProfile(db, user.id);

      expect(profile.locale).toBeNull();
    });

    it('accepts both es and en locales', async () => {
      const user1 = await createTestUser(db, { email: 'es@test.com' });
      const user2 = await createTestUser(db, { email: 'en@test.com' });

      const profileEs = await createTestProfile(db, user1.id, { locale: 'es' });
      const profileEn = await createTestProfile(db, user2.id, { locale: 'en' });

      expect(profileEs.locale).toBe('es');
      expect(profileEn.locale).toBe('en');
    });
  });

  describe('Upsert Profile with Locale', () => {
    it('updates locale via upsertProfile', async () => {
      const user = await createTestUser(db);
      await createTestProfile(db, user.id, { locale: 'es' });

      const updated = await upsertProfile(user.id, { locale: 'en' });

      expect(updated.locale).toBe('en');
    });

    it('creates profile with locale if none exists', async () => {
      const user = await createTestUser(db);

      const profile = await upsertProfile(user.id, { locale: 'es' });

      expect(profile.locale).toBe('es');
    });

    it('preserves other fields when updating only locale', async () => {
      const user = await createTestUser(db);
      await createTestProfile(db, user.id, {
        locale: 'es',
        city: 'Mexico City',
        phone: '+521234567890',
        country: 'MX',
      });

      const updated = await upsertProfile(user.id, { locale: 'en' });

      expect(updated.locale).toBe('en');
      expect(updated.city).toBe('Mexico City');
      expect(updated.phone).toBe('+521234567890');
      expect(updated.country).toBe('MX');
    });

    it('preserves locale when not included in upsert payload', async () => {
      const user = await createTestUser(db);
      await createTestProfile(db, user.id, { locale: 'en' });

      // Upsert without locale should preserve existing value
      await upsertProfile(user.id, { city: 'New City' });

      const [profile] = await db
        .select()
        .from(schema.profiles)
        .where(eq(schema.profiles.userId, user.id));

      // Locale should be unchanged when not included in upsert
      expect(profile.locale).toBe('en');
    });

    it('clears locale to NULL when explicitly set to undefined', async () => {
      const user = await createTestUser(db);
      await createTestProfile(db, user.id, { locale: 'en' });

      // Explicitly setting locale to undefined should clear it to NULL
      // This is the "Use browser default" flow
      await upsertProfile(user.id, { locale: undefined });

      const [profile] = await db
        .select()
        .from(schema.profiles)
        .where(eq(schema.profiles.userId, user.id));

      expect(profile.locale).toBeNull();
    });
  });

  describe('Direct Database Operations', () => {
    it('can query profiles by locale', async () => {
      const user1 = await createTestUser(db, { email: 'user1@test.com' });
      const user2 = await createTestUser(db, { email: 'user2@test.com' });
      const user3 = await createTestUser(db, { email: 'user3@test.com' });

      await createTestProfile(db, user1.id, { locale: 'en' });
      await createTestProfile(db, user2.id, { locale: 'en' });
      await createTestProfile(db, user3.id, { locale: 'es' });

      const englishProfiles = await db
        .select()
        .from(schema.profiles)
        .where(eq(schema.profiles.locale, 'en'));

      expect(englishProfiles).toHaveLength(2);
    });

    it('can update locale directly', async () => {
      const user = await createTestUser(db);
      await createTestProfile(db, user.id, { locale: 'es' });

      await db
        .update(schema.profiles)
        .set({ locale: 'en' })
        .where(eq(schema.profiles.userId, user.id));

      const [updated] = await db
        .select()
        .from(schema.profiles)
        .where(eq(schema.profiles.userId, user.id));

      expect(updated.locale).toBe('en');
    });
  });
});
