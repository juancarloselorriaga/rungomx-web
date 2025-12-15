/**
 * Utility functions for contact submission processing
 */

/**
 * Normalizes metadata object by filtering out undefined values
 * Returns empty object if input is not a valid object
 *
 * @param metadata - Unknown metadata input
 * @returns Normalized metadata object
 */
export function normalizeMetadata(metadata?: unknown): Record<string, unknown> {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(metadata as Record<string, unknown>).filter(([, value]) => value !== undefined),
  );
}

/**
 * Safely stringifies metadata for display/logging
 * Returns empty string if stringification fails
 *
 * @param metadata - Metadata object to stringify
 * @returns JSON string or empty string on error
 */
export function stringifyMetadata(metadata: Record<string, unknown>): string {
  try {
    return JSON.stringify(metadata, null, 2);
  } catch {
    return '';
  }
}

/**
 * Formats a Date object as ISO string
 * Falls back to current date if input is invalid
 *
 * @param date - Date to format
 * @returns ISO date string
 */
export function formatDate(date: Date | unknown): string {
  return date instanceof Date ? date.toISOString() : new Date().toISOString();
}
