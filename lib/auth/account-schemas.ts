import { z } from 'zod';

const trimmedString = (max: number, min = 1) =>
  z
    .string()
    .trim()
    .min(min, 'REQUIRED')
    .max(max, 'TOO_LONG');

export const accountNameUpdateSchema = z.object({
  name: trimmedString(255),
});

export const passwordChangeSchema = z.object({
  currentPassword: trimmedString(128),
  newPassword: trimmedString(128, 8),
  revokeOtherSessions: z.boolean().optional(),
});

export type AccountNameUpdateInput = z.infer<typeof accountNameUpdateSchema>;
export type PasswordChangeInput = z.infer<typeof passwordChangeSchema>;
