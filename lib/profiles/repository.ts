import { db } from '@/db';
import { profiles } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { profileUpsertSchema } from './schema';
import type { ProfileInsert, ProfileRecord, ProfileUpsertInput } from './types';

const NULLABLE_FIELDS = new Set(['latitude', 'longitude', 'locationDisplay', 'locale']);

function buildProfileValues(
  userId: string,
  input: ProfileUpsertInput,
): {
  insert: ProfileInsert;
  update: Partial<ProfileInsert>;
} {
  const parsed = profileUpsertSchema.parse(input);

  const insert: ProfileInsert = { userId };
  const update: Partial<ProfileInsert> = { updatedAt: new Date() };

  Object.entries(parsed).forEach(([key, value]) => {
    if (value === undefined) {
      if (NULLABLE_FIELDS.has(key)) {
        (update as Record<string, unknown>)[key] = null;
      }
      return;
    }
    (insert as Record<string, unknown>)[key] = value;
    (update as Record<string, unknown>)[key] = value;
  });

  if (parsed.gender !== 'self_described') {
    update.genderDescription = null;
  }

  return { insert, update };
}

export async function getProfileByUserId(userId: string): Promise<ProfileRecord | null> {
  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.userId, userId),
  });

  return profile ?? null;
}

export async function upsertProfile(
  userId: string,
  input: ProfileUpsertInput,
): Promise<ProfileRecord> {
  const { insert, update } = buildProfileValues(userId, input);

  const [profile] = await db
    .insert(profiles)
    .values(insert)
    .onConflictDoUpdate({
      target: profiles.userId,
      set: update,
    })
    .returning();

  return profile;
}
