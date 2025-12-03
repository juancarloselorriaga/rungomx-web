'use server';

import { auth } from '@/lib/auth';
import { withAuthenticatedUser } from '@/lib/auth/action-wrapper';
import { ProfileMetadata } from '@/lib/profiles/metadata';
import { computeProfileStatus } from '@/lib/profiles/status';
import { ProfileRecord, ProfileStatus, ProfileUpsertInput } from '@/lib/profiles/types';
import { headers } from 'next/headers';
import { z } from 'zod';
import { profileUpsertSchema } from '@/lib/profiles/schema';
import { getProfileByUserId, upsertProfile } from '@/lib/profiles/repository';

type ProfileActionError =
  | { ok: false; error: 'UNAUTHENTICATED' }
  | { ok: false; error: 'INVALID_INPUT'; details?: ReturnType<typeof z.treeifyError> }
  | { ok: false; error: 'SERVER_ERROR' };

type ProfileActionSuccess = {
  ok: true;
  profile: ProfileRecord | null;
  profileStatus: ProfileStatus;
  profileMetadata: ProfileMetadata;
};

type ProfileActionResult = ProfileActionSuccess | ProfileActionError;

export const readProfile = withAuthenticatedUser<ProfileActionResult>({
  unauthenticated: () => ({ ok: false, error: 'UNAUTHENTICATED' }),
})(async ({
  user,
  isInternal,
  profileRequirements,
  profileMetadata,
}) => {
  try {
    const profile = await getProfileByUserId(user.id);
    const profileStatus = computeProfileStatus({
      profile,
      isInternal,
      requirementCategories: profileRequirements.categories,
      requiredFieldKeys: profileRequirements.fieldKeys,
    });

    return {
      ok: true,
      profile,
      profileStatus,
      profileMetadata,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, error: 'INVALID_INPUT', details: z.treeifyError(error) };
    }

    console.error('[profile] Failed to read profile', error);
    return { ok: false, error: 'SERVER_ERROR' };
  }
});

export const upsertProfileAction = withAuthenticatedUser<ProfileActionResult>({
  unauthenticated: () => ({ ok: false, error: 'UNAUTHENTICATED' }),
})(async (authContext, input: ProfileUpsertInput) => {
  try {
    const parsed = profileUpsertSchema.safeParse(input);

    if (!parsed.success) {
      return { ok: false, error: 'INVALID_INPUT', details: z.treeifyError(parsed.error) };
    }

    const profile = await upsertProfile(authContext.user.id, parsed.data);
    const profileStatus = computeProfileStatus({
      profile,
      isInternal: authContext.isInternal,
      requirementCategories: authContext.profileRequirements.categories,
      requiredFieldKeys: authContext.profileRequirements.fieldKeys,
    });

    // Force the session cache to refresh so client hooks see the updated profile status
    const h = await headers();
    await auth.api.getSession({
      headers: h,
      query: { disableCookieCache: true },
    });

    return {
      ok: true,
      profile,
      profileStatus,
      profileMetadata: authContext.profileMetadata,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, error: 'INVALID_INPUT', details: z.treeifyError(error) };
    }

    console.error('[profile] Failed to upsert profile', error);
    return { ok: false, error: 'SERVER_ERROR' };
  }
});
