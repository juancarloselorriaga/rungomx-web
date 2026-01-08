import { z } from 'zod';

import { ALLOWED_IMAGE_TYPES, MAX_FILE_SIZE, MAX_FILE_SIZE_MB } from './constants';

export const profilePictureFileSchema = z.object({
  type: z.string().refine((type) => ALLOWED_IMAGE_TYPES.includes(type as (typeof ALLOWED_IMAGE_TYPES)[number]), {
    message: 'Invalid file type. Allowed: JPEG, PNG, WebP, GIF',
  }),
  size: z.number().max(MAX_FILE_SIZE, {
    message: `File size must be less than ${MAX_FILE_SIZE_MB}MB`,
  }),
});

export function validateImageFile(file: File): { valid: boolean; error?: string } {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
    return { valid: false, error: 'Invalid file type. Allowed: JPEG, PNG, WebP, GIF' };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `File size must be less than ${MAX_FILE_SIZE_MB}MB` };
  }
  return { valid: true };
}
