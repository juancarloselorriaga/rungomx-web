/**
 * Contact Submissions Module
 *
 * Provides functionality for handling contact form submissions including:
 * - Input validation via Zod schemas
 * - Database persistence
 * - Email notifications to support team
 *
 * @example
 * ```ts
 * import { createContactSubmission, notifySupportOfSubmission } from '@/lib/contact-submissions';
 *
 * const submission = await createContactSubmission({
 *   name: 'John Doe',
 *   email: 'john@example.com',
 *   message: 'Hello!',
 *   origin: 'contact-form'
 * });
 *
 * await notifySupportOfSubmission(submission, 'en');
 * ```
 */

// Schema and validation
export { contactSubmissionSchema } from './schema';

// Types
export type { ContactSubmissionInput, ContactSubmissionRecord } from './types';

// Database operations
export { createContactSubmission } from './repository';

// Email notifications
export { notifySupportOfSubmission } from './email';

// Utility functions (not exported by default - import directly if needed)
// import { normalizeMetadata, stringifyMetadata, formatDate } from '@/lib/contact-submissions/utils';
