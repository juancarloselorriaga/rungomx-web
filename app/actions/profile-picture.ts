'use server';

import { del } from '@vercel/blob';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';

import { db } from '@/db';
import { users } from '@/db/schema';
import { auth } from '@/lib/auth';
import { withAuthenticatedUser } from '@/lib/auth/action-wrapper';
import type { DeleteProfilePictureResult, UploadProfilePictureResult } from '@/lib/profile-picture/types';

/**
 * Update the user's profile picture URL in the database.
 * Called after a successful client-side upload via Vercel Blob.
 *
 * Note: The actual upload happens via the /api/profile-picture route.
 * This action is used to confirm the update and refresh the session.
 */
export const confirmProfilePictureUpload = withAuthenticatedUser<UploadProfilePictureResult>({
  unauthenticated: () => ({ ok: false, error: 'UNAUTHENTICATED' }),
  forbidden: () => ({ ok: false, error: 'FORBIDDEN', message: 'Profile pictures are not available for internal users' }),
})(async (ctx, imageUrl: string) => {
  try {
    if (ctx.isInternal) {
      return {
        ok: false,
        error: 'FORBIDDEN',
        message: 'Profile pictures are not available for internal users',
      };
    }

    // Verify the URL looks like a valid Vercel Blob URL
    if (!imageUrl.includes('vercel-storage.com') && !imageUrl.includes('blob.vercel-storage.com')) {
      return {
        ok: false,
        error: 'INVALID_INPUT',
        message: 'Invalid image URL',
      };
    }

    // Update the user's image URL
    await db.update(users).set({ image: imageUrl }).where(eq(users.id, ctx.user.id));

    // Force the session cache to refresh so client hooks see the updated image
    const h = await headers();
    await auth.api.getSession({
      headers: h,
      query: { disableCookieCache: true },
    });

    return {
      ok: true,
      data: { imageUrl },
    };
  } catch (error) {
    console.error('[profile-picture] Failed to confirm upload:', error);
    return {
      ok: false,
      error: 'SERVER_ERROR',
      message: 'Failed to update profile picture',
    };
  }
});

/**
 * Delete the user's profile picture from Vercel Blob and clear the database field.
 */
export const deleteProfilePictureAction = withAuthenticatedUser<DeleteProfilePictureResult>({
  unauthenticated: () => ({ ok: false, error: 'UNAUTHENTICATED' }),
  forbidden: () => ({ ok: false, error: 'FORBIDDEN', message: 'Profile pictures are not available for internal users' }),
})(async (ctx) => {
  try {
    if (ctx.isInternal) {
      return {
        ok: false,
        error: 'FORBIDDEN',
        message: 'Profile pictures are not available for internal users',
      };
    }

    const currentImageUrl = ctx.user.image;

    // Delete from Vercel Blob if exists
    if (currentImageUrl) {
      try {
        await del(currentImageUrl);
      } catch (error) {
        // Log but don't fail - the blob might already be deleted
        console.warn('[profile-picture] Failed to delete blob:', error);
      }
    }

    // Clear the image URL in database
    await db.update(users).set({ image: null }).where(eq(users.id, ctx.user.id));

    // Force the session cache to refresh
    const h = await headers();
    await auth.api.getSession({
      headers: h,
      query: { disableCookieCache: true },
    });

    return {
      ok: true,
      data: null,
    };
  } catch (error) {
    console.error('[profile-picture] Failed to delete:', error);
    return {
      ok: false,
      error: 'SERVER_ERROR',
      message: 'Failed to delete profile picture',
    };
  }
});

/**
 * Delete existing profile picture before uploading a new one.
 * This should be called before starting a new upload to clean up the old blob.
 */
export const deleteExistingPictureAction = withAuthenticatedUser<DeleteProfilePictureResult>({
  unauthenticated: () => ({ ok: false, error: 'UNAUTHENTICATED' }),
  forbidden: () => ({ ok: false, error: 'FORBIDDEN' }),
})(async (ctx) => {
  try {
    if (ctx.isInternal) {
      return {
        ok: false,
        error: 'FORBIDDEN',
        message: 'Profile pictures are not available for internal users',
      };
    }

    const currentImageUrl = ctx.user.image;

    // Delete from Vercel Blob if exists
    if (currentImageUrl) {
      try {
        await del(currentImageUrl);
      } catch (error) {
        // Log but don't fail - the blob might already be deleted
        console.warn('[profile-picture] Failed to delete existing blob:', error);
      }
    }

    return {
      ok: true,
      data: null,
    };
  } catch (error) {
    console.error('[profile-picture] Failed to delete existing:', error);
    return {
      ok: false,
      error: 'SERVER_ERROR',
      message: 'Failed to delete existing picture',
    };
  }
});
