import { z } from 'zod';
import { isValidPhone } from './utils';

/**
 * Zod validator for optional phone numbers in E.164 format
 * Replaces `optionalTrimmedString(20)` pattern used in profile schema
 *
 * @example
 * const schema = z.object({
 *   phone: optionalPhoneNumber,
 * });
 *
 * schema.parse({ phone: "+523317778888" }) // Valid
 * schema.parse({ phone: "" }) // Valid (optional)
 * schema.parse({ phone: undefined }) // Valid (optional)
 * schema.parse({ phone: "invalid" }) // Invalid - throws ZodError
 */
export const optionalPhoneNumber = z
  .string()
  .trim()
  .optional()
  .refine(
    (val) => {
      // Allow undefined or empty string
      if (!val) return true;
      // Validate phone number format
      return isValidPhone(val);
    },
    { message: 'Invalid phone number format' },
  );

/**
 * Zod validator for required phone numbers in E.164 format
 *
 * @example
 * const schema = z.object({
 *   phone: requiredPhoneNumber,
 * });
 *
 * schema.parse({ phone: "+523317778888" }) // Valid
 * schema.parse({ phone: "" }) // Invalid - throws ZodError
 * schema.parse({ phone: undefined }) // Invalid - throws ZodError
 */
export const requiredPhoneNumber = z
  .string()
  .trim()
  .min(1, 'Phone number is required')
  .refine((val) => isValidPhone(val), { message: 'Invalid phone number format' });
