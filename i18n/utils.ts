import { routing, type AppLocale } from './routing';
import { messagesSchema, type Messages } from './types';

/**
 * Type guard to check if a value is a valid locale
 * @param value - The value to check
 * @returns True if the value is a valid AppLocale
 */
export const isValidLocale = (value: string): value is AppLocale =>
  routing.locales.includes(value as AppLocale);

type ParsedIssue = { path: PropertyKey[]; message: string };

const formatZodIssues = (issues: ParsedIssue[]) =>
  issues
    .map((issue) => {
      const path = issue.path.map(String).join('.') || '<root>';
      return `${path}: ${issue.message}`;
    })
    .join('; ');

/**
 * Validate a messages object against the schema, providing actionable errors.
 */
export function validateMessages(locale: string, raw: unknown): Messages {
  const result = messagesSchema.safeParse(raw);

  if (!result.success) {
    const formattedIssues = formatZodIssues(result.error.issues);
    throw new Error(`Invalid messages for locale "${locale}": ${formattedIssues}`);
  }

  return result.data;
}

/**
 * Load and validate locale messages at runtime.
 */
export async function loadMessages(locale: AppLocale): Promise<Messages> {
  const rawMessages = (await import(`@/messages/${locale}.json`)).default;
  return validateMessages(locale, rawMessages);
}
