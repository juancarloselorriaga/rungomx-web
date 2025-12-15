import { db } from '@/db';
import { contactSubmissions } from '@/db/schema';
import { contactSubmissionSchema } from './schema';
import type { ContactSubmissionInput, ContactSubmissionRecord } from './types';
import { normalizeMetadata } from './utils';

/**
 * Database repository for contact submissions
 * Handles all database operations related to contact submissions
 */

/**
 * Creates a new contact submission in the database
 *
 * @param input - Contact submission data to create
 * @returns Created contact submission record
 * @throws {ZodError} If input validation fails
 */
export async function createContactSubmission(
  input: ContactSubmissionInput,
): Promise<ContactSubmissionRecord> {
  const parsed = contactSubmissionSchema.parse(input);

  const [submission] = await db
    .insert(contactSubmissions)
    .values({
      name: parsed.name,
      email: parsed.email,
      message: parsed.message,
      origin: parsed.origin,
      userId: parsed.userId ?? null,
      metadata: normalizeMetadata(parsed.metadata),
    })
    .returning();

  return submission;
}
