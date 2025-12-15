import { createFormAction, extractFieldErrors, validateInput } from '@/lib/forms';
import { z } from 'zod';
import type { FormActionResult } from '../types';

describe('server-helpers', () => {
  describe('extractFieldErrors', () => {
    it('should extract field errors from single-field Zod error', () => {
      const schema = z.object({
        email: z.string().email('Invalid email'),
      });

      const result = schema.safeParse({ email: 'invalid' });
      expect(result.success).toBe(false);

      if (!result.success) {
        const fieldErrors = extractFieldErrors(result.error);
        expect(fieldErrors).toEqual({
          email: ['Invalid email'],
        });
      }
    });

    it('should extract multiple errors for the same field', () => {
      const schema = z.object({
        password: z
          .string()
          .min(8, 'Password must be at least 8 characters')
          .regex(/[A-Z]/, 'Password must contain uppercase letter'),
      });

      const result = schema.safeParse({ password: 'short' });
      expect(result.success).toBe(false);

      if (!result.success) {
        const fieldErrors = extractFieldErrors(result.error);
        expect(fieldErrors.password).toContain('Password must be at least 8 characters');
      }
    });

    it('should handle multiple field errors', () => {
      const schema = z.object({
        email: z.string().email('Invalid email'),
        password: z.string().min(8, 'Password too short'),
        age: z.number().min(18, 'Must be 18 or older'),
      });

      const result = schema.safeParse({
        email: 'invalid',
        password: 'short',
        age: 15,
      });
      expect(result.success).toBe(false);

      if (!result.success) {
        const fieldErrors = extractFieldErrors(result.error);
        expect(fieldErrors).toEqual({
          email: ['Invalid email'],
          password: ['Password too short'],
          age: ['Must be 18 or older'],
        });
      }
    });

    it('should handle nested path errors', () => {
      const schema = z.object({
        user: z.object({
          email: z.string().email('Invalid email'),
        }),
      });

      const result = schema.safeParse({
        user: { email: 'invalid' },
      });
      expect(result.success).toBe(false);

      if (!result.success) {
        const fieldErrors = extractFieldErrors(result.error);
        // First path element is 'user'
        expect(fieldErrors).toHaveProperty('user');
      }
    });

    it('should handle empty Zod errors', () => {
      // Create a custom Zod error with no issues
      const zodError = new z.ZodError([]);

      const fieldErrors = extractFieldErrors(zodError);
      expect(fieldErrors).toEqual({});
    });

    it('should handle errors without a path', () => {
      // Create a Zod error with an issue that has an empty path
      const zodError = new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          path: [],
          message: 'General error',
        },
      ]);

      const fieldErrors = extractFieldErrors(zodError);
      expect(fieldErrors).toEqual({});
    });

    it('should group multiple messages for the same field', () => {
      const schema = z.object({
        password: z
          .string()
          .min(8, 'Too short')
          .max(20, 'Too long')
          .regex(/[A-Z]/, 'Need uppercase')
          .regex(/[0-9]/, 'Need number'),
      });

      const result = schema.safeParse({ password: 'short' });
      expect(result.success).toBe(false);

      if (!result.success) {
        const fieldErrors = extractFieldErrors(result.error);
        expect(fieldErrors.password).toBeInstanceOf(Array);
        expect(fieldErrors.password.length).toBeGreaterThan(1);
      }
    });
  });

  describe('validateInput', () => {
    it('should return success with valid data', () => {
      const schema = z.object({
        email: z.string().email(),
        password: z.string().min(8),
      });

      const input = {
        email: 'test@example.com',
        password: 'password123',
      };

      const result = validateInput(schema, input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(input);
      }
    });

    it('should return error with invalid data', () => {
      const schema = z.object({
        email: z.string().email(),
      });

      const input = { email: 'invalid' };

      const result = validateInput(schema, input);

      expect(result.success).toBe(false);
    });

    it('should include field errors in validation failure', () => {
      const schema = z.object({
        email: z.string().email('Invalid email format'),
        password: z.string().min(8, 'Password too short'),
      });

      const input = {
        email: 'invalid',
        password: 'short',
      };

      const result = validateInput(schema, input);

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = result.error;
        expect(error.ok).toBe(false);
        if (!error.ok) {
          expect(error.error).toBe('INVALID_INPUT');
          if ('fieldErrors' in error) {
            expect(error.fieldErrors).toEqual({
              email: ['Invalid email format'],
              password: ['Password too short'],
            });
            expect(error.message).toBe('Validation failed');
          }
        }
      }
    });

    it('should return correct error structure', () => {
      const schema = z.object({
        email: z.string().email(),
      });

      const result = validateInput(schema, { email: 'invalid' });

      expect(result.success).toBe(false);
      if (!result.success) {
        const { error } = result;
        expect(error).toHaveProperty('ok', false);
        expect(error).toHaveProperty('error', 'INVALID_INPUT');
        expect(error).toHaveProperty('fieldErrors');
        expect(error).toHaveProperty('message', 'Validation failed');
      }
    });

    it('should handle complex schemas with nested objects', () => {
      const schema = z.object({
        user: z.object({
          name: z.string().min(1),
          email: z.string().email(),
        }),
        preferences: z.object({
          notifications: z.boolean(),
        }),
      });

      const validInput = {
        user: {
          name: 'John Doe',
          email: 'john@example.com',
        },
        preferences: {
          notifications: true,
        },
      };

      const result = validateInput(schema, validInput);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validInput);
      }
    });

    it('should handle schemas with arrays', () => {
      const schema = z.object({
        tags: z.array(z.string()).min(1, 'At least one tag required'),
      });

      const invalidInput = { tags: [] };
      const result = validateInput(schema, invalidInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = result.error;
        expect(error.ok).toBe(false);
        if (!error.ok) {
          expect(error.error).toBe('INVALID_INPUT');
          if ('fieldErrors' in error) {
            expect(error.fieldErrors).toHaveProperty('tags');
          }
        }
      }
    });

    it('should handle type coercion', () => {
      const schema = z.object({
        age: z.coerce.number().min(18),
      });

      const input = { age: '25' };
      const result = validateInput(schema, input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.age).toBe(25);
        expect(typeof result.data.age).toBe('number');
      }
    });
  });

  describe('createFormAction', () => {
    it('should validate input and call handler on success', async () => {
      const schema = z.object({
        name: z.string().min(1),
      });

      const handler = jest.fn().mockResolvedValue({ id: '123', name: 'John' });

      const action = createFormAction(schema, handler);
      const result = await action({ name: 'John' });

      expect(handler).toHaveBeenCalledWith({ name: 'John' });
      expect(result).toEqual({
        ok: true,
        data: { id: '123', name: 'John' },
      });
    });

    it('should return validation errors for invalid input', async () => {
      const schema = z.object({
        email: z.string().email('Invalid email'),
      });

      const handler = jest.fn();

      const action = createFormAction(schema, handler);
      const result = await action({ email: 'invalid' });

      expect(handler).not.toHaveBeenCalled();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('INVALID_INPUT');
        if ('fieldErrors' in result) {
          expect(result.fieldErrors).toEqual({
            email: ['Invalid email'],
          });
          expect(result.message).toBe('Validation failed');
        }
      }
    });

    it('should catch and handle handler exceptions', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const schema = z.object({
        name: z.string(),
      });

      const handler = jest.fn().mockRejectedValue(new Error('Database error'));

      const action = createFormAction(schema, handler);
      const result = await action({ name: 'John' });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('SERVER_ERROR');
        expect(result.message).toBe('An unexpected error occurred');
      }
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should return success result with handler data', async () => {
      const schema = z.object({
        email: z.string().email(),
        name: z.string(),
      });

      const userData = {
        id: '456',
        email: 'test@example.com',
        name: 'Test User',
        createdAt: new Date().toISOString(),
      };

      const handler = jest.fn().mockResolvedValue(userData);

      const action = createFormAction(schema, handler);
      const result = await action({
        email: 'test@example.com',
        name: 'Test User',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toEqual(userData);
      }
    });

    it('should include field errors in validation failure response', async () => {
      const schema = z.object({
        email: z.string().email('Invalid email'),
        password: z.string().min(8, 'Password too short'),
      });

      const handler = jest.fn();

      const action = createFormAction(schema, handler);
      const result = await action({
        email: 'invalid',
        password: 'short',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('INVALID_INPUT');
        if ('fieldErrors' in result) {
          expect(result.fieldErrors).toEqual({
            email: ['Invalid email'],
            password: ['Password too short'],
          });
        }
      }
    });

    it('should handle async handler functions', async () => {
      const schema = z.object({
        userId: z.string(),
      });

      const handler = jest.fn().mockImplementation(async (data) => {
        // Simulate async operation
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { userId: data.userId, status: 'processed' };
      });

      const action = createFormAction(schema, handler);
      const result = await action({ userId: '789' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toEqual({ userId: '789', status: 'processed' });
      }
    });

    it('should log errors appropriately', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const schema = z.object({ name: z.string() });
      const error = new Error('Network timeout');
      const handler = jest.fn().mockRejectedValue(error);

      const action = createFormAction(schema, handler);
      await action({ name: 'Test' });

      expect(consoleErrorSpy).toHaveBeenCalledWith('[formAction] Error:', error);

      consoleErrorSpy.mockRestore();
    });

    it('should handle empty input objects', async () => {
      const schema = z.object({
        name: z.string().optional(),
      });

      const handler = jest.fn().mockResolvedValue({ success: true });

      const action = createFormAction(schema, handler);
      const result = await action({});

      expect(result.ok).toBe(true);
      expect(handler).toHaveBeenCalledWith({});
    });

    it('should handle complex return types', async () => {
      const schema = z.object({
        query: z.string(),
      });

      interface SearchResult {
        items: Array<{ id: string; title: string }>;
        total: number;
        page: number;
      }

      const handler = jest.fn().mockResolvedValue({
        items: [
          { id: '1', title: 'Result 1' },
          { id: '2', title: 'Result 2' },
        ],
        total: 2,
        page: 1,
      } as SearchResult);

      const action = createFormAction(schema, handler);
      const result = (await action({ query: 'test' })) as FormActionResult<SearchResult>;

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.items).toHaveLength(2);
        expect(result.data.total).toBe(2);
      }
    });

    it('should validate against schema before calling handler', async () => {
      const schema = z.object({
        email: z.string().email(),
        age: z.number().min(18),
      });

      const handler = jest.fn();

      const action = createFormAction(schema, handler);
      await action({ email: 'valid@example.com', age: 15 });

      // Handler should not be called because validation failed
      expect(handler).not.toHaveBeenCalled();
    });

    it('should pass only validated data to handler', async () => {
      const schema = z.object({
        email: z.string().email(),
        name: z.string(),
      });

      const handler = jest.fn().mockResolvedValue({ success: true });

      const action = createFormAction(schema, handler);
      await action({
        email: 'test@example.com',
        name: 'Test',
        extraField: 'should be stripped',
      });

      // Handler should receive only the validated fields
      expect(handler).toHaveBeenCalledWith({
        email: 'test@example.com',
        name: 'Test',
      });
    });
  });
});
