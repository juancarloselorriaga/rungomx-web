import { contactSubmissions } from '@/db/schema';
import { z } from 'zod';
import { contactSubmissionSchema } from './schema';

/**
 * Input type for creating a contact submission
 * Inferred from the validation schema
 */
export type ContactSubmissionInput = z.infer<typeof contactSubmissionSchema>;

/**
 * Database record type for contact submissions
 * Inferred from the Drizzle schema
 */
export type ContactSubmissionRecord = typeof contactSubmissions.$inferSelect;
