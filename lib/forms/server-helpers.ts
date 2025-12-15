import { z } from 'zod';
import type { FormActionResult } from './types';

/**
 * Extracts field-specific errors from Zod validation error
 */
export function extractFieldErrors(error: z.ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};

  error.issues.forEach((issue) => {
    const field = issue.path[0]?.toString();
    if (field) {
      if (!fieldErrors[field]) {
        fieldErrors[field] = [];
      }
      fieldErrors[field].push(issue.message);
    }
  });

  return fieldErrors;
}

/**
 * Helper to validate input with Zod schema and return standardized error
 */
export function validateInput<T>(
  schema: z.ZodSchema<T>,
  input: unknown,
): { success: true; data: T } | { success: false; error: FormActionResult<never> } {
  const result = schema.safeParse(input);

  if (!result.success) {
    return {
      success: false,
      error: {
        ok: false,
        error: 'INVALID_INPUT',
        fieldErrors: extractFieldErrors(result.error),
        message: 'Validation failed',
      },
    };
  }

  return { success: true, data: result.data };
}

/**
 * Wraps a server action to provide consistent error handling
 *
 * Example usage:
 * ```typescript
 * export const myAction = createFormAction(
 *   mySchema,
 *   async (validatedData) => {
 *     // Your action logic
 *     return { id: '123', name: 'Result' };
 *   }
 * );
 * ```
 */
export function createFormAction<TInput, TOutput>(
  schema: z.ZodSchema<TInput>,
  handler: (data: TInput) => Promise<TOutput>,
) {
  return async (input: unknown): Promise<FormActionResult<TOutput>> => {
    try {
      // Validate input
      const validation = validateInput(schema, input);
      if (!validation.success) {
        return validation.error;
      }

      // Execute handler
      const result = await handler(validation.data);

      return {
        ok: true,
        data: result,
      };
    } catch (error) {
      console.error('[formAction] Error:', error);
      return {
        ok: false,
        error: 'SERVER_ERROR',
        message: 'An unexpected error occurred',
      };
    }
  };
}
