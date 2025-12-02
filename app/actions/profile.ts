'use server';

import { auth } from '@/lib/auth';
import { requireAuthenticatedUser } from '@/lib/auth/guards';
import {
  computeProfileStatus,
  getProfileByUserId,
  profileUpsertSchema,
  upsertProfile,
  type ProfileMetadata,
  type ProfileRecord,
  type ProfileStatus,
  type ProfileUpsertInput,
} from '@/lib/profiles';
import { headers } from 'next/headers';
import { z } from 'zod';

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

export async function readProfile(): Promise<ProfileActionSuccess | ProfileActionError> {
  try {
    const { user, isInternal, profileRequirements, profileMetadata } = await requireAuthenticatedUser();
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

    if ((error as { code?: string })?.code === 'UNAUTHENTICATED') {
      return { ok: false, error: 'UNAUTHENTICATED' };
    }

    console.error('[profile] Failed to read profile', error);
    return { ok: false, error: 'SERVER_ERROR' };
  }
}

export async function upsertProfileAction(
  input: ProfileUpsertInput
): Promise<ProfileActionSuccess | ProfileActionError> {
  try {
    const authContext = await requireAuthenticatedUser();
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

    if ((error as { code?: string })?.code === 'UNAUTHENTICATED') {
      return { ok: false, error: 'UNAUTHENTICATED' };
    }

    console.error('[profile] Failed to upsert profile', error);
    return { ok: false, error: 'SERVER_ERROR' };
  }
}
