import type { FormActionResult } from '@/lib/forms/types';

export type UploadProfilePictureResult = FormActionResult<{
  imageUrl: string;
}>;

export type DeleteProfilePictureResult = FormActionResult<null>;

export type ProfilePictureActionError =
  | { ok: false; error: 'UNAUTHENTICATED' }
  | { ok: false; error: 'FORBIDDEN'; message?: string }
  | { ok: false; error: 'INVALID_INPUT'; message?: string }
  | { ok: false; error: 'SERVER_ERROR'; message?: string };
