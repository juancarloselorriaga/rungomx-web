import { z } from 'zod';

/**
 * Schema for validating contact submission data
 *
 * Fields:
 * - name: Optional user name (1-255 chars, trimmed)
 * - email: Optional email (trimmed, validated, max 255 chars)
 * - message: Required message (1-5000 chars, trimmed)
 * - origin: Source of submission (1-100 chars, defaults to 'unknown')
 * - userId: Optional UUID for authenticated users
 * - metadata: Optional additional data
 * - honeypot: Anti-spam field (must be empty)
 */
export const contactSubmissionSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  email: z.preprocess(
    (val) => (typeof val === 'string' ? val.trim() : val),
    z.email().max(255).optional(),
  ),
  message: z.string().trim().min(1).max(5000),
  origin: z.string().trim().min(1).max(100).default('unknown'),
  userId: z.uuid().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  honeypot: z.string().max(0).optional(),
});
