import { act, renderHook, waitFor } from '@testing-library/react';
import type { FormActionResult } from '../types';
import { useForm } from '../use-form';

describe('useForm', () => {
  describe('Initialization', () => {
    it('should initialize with default values', () => {
      const defaultValues = { email: 'test@example.com', password: 'secret' };
      const { result } = renderHook(() =>
        useForm({
          defaultValues,
          onSubmit: jest.fn(),
        }),
      );

      expect(result.current.values).toEqual(defaultValues);
    });

    it('should initialize with empty errors state', () => {
      const { result } = renderHook(() =>
        useForm({
          defaultValues: { email: '' },
          onSubmit: jest.fn(),
        }),
      );

      expect(result.current.errors).toEqual({});
    });

    it('should not be submitting initially', () => {
      const { result } = renderHook(() =>
        useForm({
          defaultValues: { email: '' },
          onSubmit: jest.fn(),
        }),
      );

      expect(result.current.isSubmitting).toBe(false);
    });

    it('should have no form-level error initially', () => {
      const { result } = renderHook(() =>
        useForm({
          defaultValues: { email: '' },
          onSubmit: jest.fn(),
        }),
      );

      expect(result.current.error).toBeNull();
    });
  });

  describe('Field Registration (register)', () => {
    it('should register a field and return correct props', () => {
      const { result } = renderHook(() =>
        useForm({
          defaultValues: { email: 'test@example.com' },
          onSubmit: jest.fn(),
        }),
      );

      const fieldProps = result.current.register('email');

      expect(fieldProps.name).toBe('email');
      expect(fieldProps.value).toBe('test@example.com');
      expect(typeof fieldProps.onChange).toBe('function');
    });

    it('should handle direct value changes', () => {
      const { result } = renderHook(() =>
        useForm({
          defaultValues: { email: '' },
          onSubmit: jest.fn(),
        }),
      );

      const fieldProps = result.current.register('email');

      act(() => {
        fieldProps.onChange('new@example.com');
      });

      expect(result.current.values.email).toBe('new@example.com');
    });

    it('should handle React synthetic events from input', () => {
      const { result } = renderHook(() =>
        useForm({
          defaultValues: { email: '' },
          onSubmit: jest.fn(),
        }),
      );

      const fieldProps = result.current.register('email');

      act(() => {
        fieldProps.onChange({
          target: { value: 'event@example.com' },
        } as React.ChangeEvent<HTMLInputElement>);
      });

      expect(result.current.values.email).toBe('event@example.com');
    });

    it('should handle React synthetic events from textarea', () => {
      const { result } = renderHook(() =>
        useForm({
          defaultValues: { message: '' },
          onSubmit: jest.fn(),
        }),
      );

      const fieldProps = result.current.register('message');

      act(() => {
        fieldProps.onChange({
          target: { value: 'Hello world' },
        } as React.ChangeEvent<HTMLTextAreaElement>);
      });

      expect(result.current.values.message).toBe('Hello world');
    });

    it('should handle React synthetic events from select', () => {
      const { result } = renderHook(() =>
        useForm({
          defaultValues: { country: '' },
          onSubmit: jest.fn(),
        }),
      );

      const fieldProps = result.current.register('country');

      act(() => {
        fieldProps.onChange({
          target: { value: 'US' },
        } as React.ChangeEvent<HTMLSelectElement>);
      });

      expect(result.current.values.country).toBe('US');
    });

    it('should clear field error when value changes', () => {
      const { result } = renderHook(() =>
        useForm({
          defaultValues: { email: '' },
          onSubmit: jest.fn(),
        }),
      );

      // Set an error first
      act(() => {
        result.current.setError('email', 'Invalid email');
      });

      expect(result.current.errors.email).toBe('Invalid email');

      // Change the field value
      const fieldProps = result.current.register('email');
      act(() => {
        fieldProps.onChange('new@example.com');
      });

      expect(result.current.errors.email).toBeNull();
    });

    it('should update form values without affecting other fields', () => {
      const { result } = renderHook(() =>
        useForm({
          defaultValues: { email: 'test@example.com', password: 'secret' },
          onSubmit: jest.fn(),
        }),
      );

      const emailProps = result.current.register('email');

      act(() => {
        emailProps.onChange('new@example.com');
      });

      expect(result.current.values.email).toBe('new@example.com');
      expect(result.current.values.password).toBe('secret');
    });
  });

  describe('Form Submission (handleSubmit)', () => {
    it('should prevent default form behavior', () => {
      const { result } = renderHook(() =>
        useForm({
          defaultValues: { email: '' },
          onSubmit: jest.fn().mockResolvedValue({ ok: true, data: {} }),
        }),
      );

      const mockEvent = {
        preventDefault: jest.fn(),
      } as unknown as React.FormEvent<HTMLFormElement>;

      act(() => {
        result.current.handleSubmit(mockEvent);
      });

      expect(mockEvent.preventDefault).toHaveBeenCalled();
    });

    it('should clear all errors before submission', async () => {
      const onSubmit = jest.fn().mockResolvedValue({ ok: true, data: {} });
      const { result } = renderHook(() =>
        useForm({
          defaultValues: { email: '' },
          onSubmit,
        }),
      );

      // Set some errors first
      act(() => {
        result.current.setError('email', 'Invalid email');
      });

      expect(result.current.errors.email).toBe('Invalid email');

      const mockEvent = {
        preventDefault: jest.fn(),
      } as unknown as React.FormEvent<HTMLFormElement>;

      act(() => {
        result.current.handleSubmit(mockEvent);
      });

      await waitFor(() => {
        expect(result.current.errors).toEqual({});
      });
    });

    it('should call onSubmit with current values', async () => {
      const onSubmit = jest.fn().mockResolvedValue({ ok: true, data: {} });
      const defaultValues = { email: 'test@example.com', password: 'secret' };
      const { result } = renderHook(() =>
        useForm({
          defaultValues,
          onSubmit,
        }),
      );

      const mockEvent = {
        preventDefault: jest.fn(),
      } as unknown as React.FormEvent<HTMLFormElement>;

      act(() => {
        result.current.handleSubmit(mockEvent);
      });

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(defaultValues);
      });
    });

    it('should handle successful submissions and call onSuccess', async () => {
      const successData = { id: '123', message: 'Success' };
      const onSubmit = jest.fn().mockResolvedValue({ ok: true, data: successData });
      const onSuccess = jest.fn();

      const { result } = renderHook(() =>
        useForm({
          defaultValues: { email: '' },
          onSubmit,
          onSuccess,
        }),
      );

      const mockEvent = {
        preventDefault: jest.fn(),
      } as unknown as React.FormEvent<HTMLFormElement>;

      act(() => {
        result.current.handleSubmit(mockEvent);
      });

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledWith(successData);
      });
    });

    it('should handle validation errors with INVALID_INPUT error type', async () => {
      const fieldErrors = { email: ['Invalid email format'] };
      const onSubmit = jest.fn().mockResolvedValue({
        ok: false,
        error: 'INVALID_INPUT',
        fieldErrors,
        message: 'Validation failed',
      } as FormActionResult<never>);

      const { result } = renderHook(() =>
        useForm({
          defaultValues: { email: 'invalid' },
          onSubmit,
        }),
      );

      const mockEvent = {
        preventDefault: jest.fn(),
      } as unknown as React.FormEvent<HTMLFormElement>;

      act(() => {
        result.current.handleSubmit(mockEvent);
      });

      await waitFor(() => {
        expect(result.current.errors.email).toBe('Invalid email format');
        expect(result.current.error).toBe('Validation failed');
      });
    });

    it('should map multiple field errors correctly to form state', async () => {
      const fieldErrors = {
        email: ['Invalid email format'],
        password: ['Password too short', 'Password must contain uppercase'],
      };
      const onSubmit = jest.fn().mockResolvedValue({
        ok: false,
        error: 'INVALID_INPUT',
        fieldErrors,
        message: 'Validation failed',
      } as FormActionResult<never>);

      const { result } = renderHook(() =>
        useForm({
          defaultValues: { email: 'invalid', password: '123' },
          onSubmit,
        }),
      );

      const mockEvent = {
        preventDefault: jest.fn(),
      } as unknown as React.FormEvent<HTMLFormElement>;

      act(() => {
        result.current.handleSubmit(mockEvent);
      });

      await waitFor(() => {
        expect(result.current.errors.email).toBe('Invalid email format');
        // Should take first error message for each field
        expect(result.current.errors.password).toBe('Password too short');
      });
    });

    it('should only map field errors that exist in form values', async () => {
      const fieldErrors = {
        email: ['Invalid email format'],
        unknownField: ['Some error'],
      };
      const onSubmit = jest.fn().mockResolvedValue({
        ok: false,
        error: 'INVALID_INPUT',
        fieldErrors,
        message: 'Validation failed',
      } as FormActionResult<never>);

      const { result } = renderHook(() =>
        useForm({
          defaultValues: { email: 'invalid' },
          onSubmit,
        }),
      );

      const mockEvent = {
        preventDefault: jest.fn(),
      } as unknown as React.FormEvent<HTMLFormElement>;

      act(() => {
        result.current.handleSubmit(mockEvent);
      });

      await waitFor(() => {
        expect(result.current.errors.email).toBe('Invalid email format');
        expect(result.current.errors).not.toHaveProperty('unknownField');
      });
    });

    it('should handle generic server errors', async () => {
      const onSubmit = jest.fn().mockResolvedValue({
        ok: false,
        error: 'SERVER_ERROR',
        message: 'Database connection failed',
      } as FormActionResult<never>);

      const { result } = renderHook(() =>
        useForm({
          defaultValues: { email: '' },
          onSubmit,
        }),
      );

      const mockEvent = {
        preventDefault: jest.fn(),
      } as unknown as React.FormEvent<HTMLFormElement>;

      act(() => {
        result.current.handleSubmit(mockEvent);
      });

      await waitFor(() => {
        expect(result.current.error).toBe('Database connection failed');
      });
    });

    it('should use default error message when message is not provided', async () => {
      const onSubmit = jest.fn().mockResolvedValue({
        ok: false,
        error: 'SERVER_ERROR',
      } as FormActionResult<never>);

      const { result } = renderHook(() =>
        useForm({
          defaultValues: { email: '' },
          onSubmit,
        }),
      );

      const mockEvent = {
        preventDefault: jest.fn(),
      } as unknown as React.FormEvent<HTMLFormElement>;

      act(() => {
        result.current.handleSubmit(mockEvent);
      });

      await waitFor(() => {
        expect(result.current.error).toBe('An error occurred');
      });
    });

    it('should call onError callback on failure', async () => {
      const onSubmit = jest.fn().mockResolvedValue({
        ok: false,
        error: 'SERVER_ERROR',
        message: 'Something went wrong',
      } as FormActionResult<never>);
      const onError = jest.fn();

      const { result } = renderHook(() =>
        useForm({
          defaultValues: { email: '' },
          onSubmit,
          onError,
        }),
      );

      const mockEvent = {
        preventDefault: jest.fn(),
      } as unknown as React.FormEvent<HTMLFormElement>;

      act(() => {
        result.current.handleSubmit(mockEvent);
      });

      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith('Something went wrong');
      });
    });

    it('should catch exceptions and call onError', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const onSubmit = jest.fn().mockRejectedValue(new Error('Network error'));
      const onError = jest.fn();

      const { result } = renderHook(() =>
        useForm({
          defaultValues: { email: '' },
          onSubmit,
          onError,
        }),
      );

      const mockEvent = {
        preventDefault: jest.fn(),
      } as unknown as React.FormEvent<HTMLFormElement>;

      act(() => {
        result.current.handleSubmit(mockEvent);
      });

      await waitFor(() => {
        expect(result.current.error).toBe('An unexpected error occurred');
        expect(onError).toHaveBeenCalledWith('An unexpected error occurred');
        expect(consoleErrorSpy).toHaveBeenCalled();
      });

      consoleErrorSpy.mockRestore();
    });

    it('should set form-level error message on failure', async () => {
      const onSubmit = jest.fn().mockResolvedValue({
        ok: false,
        error: 'UNAUTHENTICATED',
        message: 'Please log in',
      } as FormActionResult<never>);

      const { result } = renderHook(() =>
        useForm({
          defaultValues: { email: '' },
          onSubmit,
        }),
      );

      const mockEvent = {
        preventDefault: jest.fn(),
      } as unknown as React.FormEvent<HTMLFormElement>;

      act(() => {
        result.current.handleSubmit(mockEvent);
      });

      await waitFor(() => {
        expect(result.current.error).toBe('Please log in');
      });
    });
  });

  describe('Error Management', () => {
    it('should set specific field error with setError', () => {
      const { result } = renderHook(() =>
        useForm({
          defaultValues: { email: '', password: '' },
          onSubmit: jest.fn(),
        }),
      );

      act(() => {
        result.current.setError('email', 'Email is required');
      });

      expect(result.current.errors.email).toBe('Email is required');
    });

    it('should clear specific field error with clearError', () => {
      const { result } = renderHook(() =>
        useForm({
          defaultValues: { email: '' },
          onSubmit: jest.fn(),
        }),
      );

      act(() => {
        result.current.setError('email', 'Invalid email');
      });

      expect(result.current.errors.email).toBe('Invalid email');

      act(() => {
        result.current.clearError('email');
      });

      expect(result.current.errors.email).toBeNull();
    });

    it('should not clear other field errors when clearing one', () => {
      const { result } = renderHook(() =>
        useForm({
          defaultValues: { email: '', password: '' },
          onSubmit: jest.fn(),
        }),
      );

      act(() => {
        result.current.setError('email', 'Invalid email');
        result.current.setError('password', 'Password too short');
      });

      act(() => {
        result.current.clearError('email');
      });

      expect(result.current.errors.email).toBeNull();
      expect(result.current.errors.password).toBe('Password too short');
    });

    it('should update existing field error', () => {
      const { result } = renderHook(() =>
        useForm({
          defaultValues: { email: '' },
          onSubmit: jest.fn(),
        }),
      );

      act(() => {
        result.current.setError('email', 'First error');
      });

      expect(result.current.errors.email).toBe('First error');

      act(() => {
        result.current.setError('email', 'Second error');
      });

      expect(result.current.errors.email).toBe('Second error');
    });
  });

  describe('Value Management', () => {
    it('should update specific field value with setFieldValue', () => {
      const { result } = renderHook(() =>
        useForm({
          defaultValues: { email: 'old@example.com', password: 'secret' },
          onSubmit: jest.fn(),
        }),
      );

      act(() => {
        result.current.setFieldValue('email', 'new@example.com');
      });

      expect(result.current.values.email).toBe('new@example.com');
      expect(result.current.values.password).toBe('secret');
    });

    it('should maintain other field values when updating one', () => {
      const { result } = renderHook(() =>
        useForm({
          defaultValues: { email: 'test@example.com', password: 'secret', name: 'John' },
          onSubmit: jest.fn(),
        }),
      );

      act(() => {
        result.current.setFieldValue('password', 'newsecret');
      });

      expect(result.current.values.email).toBe('test@example.com');
      expect(result.current.values.password).toBe('newsecret');
      expect(result.current.values.name).toBe('John');
    });

    it('should handle different value types', () => {
      const { result } = renderHook(() =>
        useForm({
          defaultValues: { count: 0, enabled: false, tags: [] as string[] },
          onSubmit: jest.fn(),
        }),
      );

      act(() => {
        result.current.setFieldValue('count', 42);
        result.current.setFieldValue('enabled', true);
        result.current.setFieldValue('tags', ['tag1', 'tag2']);
      });

      expect(result.current.values.count).toBe(42);
      expect(result.current.values.enabled).toBe(true);
      expect(result.current.values.tags).toEqual(['tag1', 'tag2']);
    });
  });

  describe('Form Reset', () => {
    it('should reset to default values', () => {
      const defaultValues = { email: 'default@example.com', password: 'default' };
      const { result } = renderHook(() =>
        useForm({
          defaultValues,
          onSubmit: jest.fn(),
        }),
      );

      // Change values
      act(() => {
        result.current.setFieldValue('email', 'changed@example.com');
        result.current.setFieldValue('password', 'changed');
      });

      expect(result.current.values.email).toBe('changed@example.com');

      // Reset
      act(() => {
        result.current.reset();
      });

      expect(result.current.values).toEqual(defaultValues);
    });

    it('should clear all field errors on reset', () => {
      const { result } = renderHook(() =>
        useForm({
          defaultValues: { email: '', password: '' },
          onSubmit: jest.fn(),
        }),
      );

      // Set errors
      act(() => {
        result.current.setError('email', 'Invalid email');
        result.current.setError('password', 'Password too short');
      });

      expect(result.current.errors.email).toBe('Invalid email');

      // Reset
      act(() => {
        result.current.reset();
      });

      expect(result.current.errors).toEqual({});
    });

    it('should clear form-level error on reset', () => {
      const { result } = renderHook(() =>
        useForm({
          defaultValues: { email: '' },
          onSubmit: jest.fn().mockResolvedValue({
            ok: false,
            error: 'SERVER_ERROR',
            message: 'Something went wrong',
          }),
        }),
      );

      const mockEvent = {
        preventDefault: jest.fn(),
      } as unknown as React.FormEvent<HTMLFormElement>;

      // Trigger error
      act(() => {
        result.current.handleSubmit(mockEvent);
      });

      // Wait for error to be set, then reset
      waitFor(() => {
        expect(result.current.error).toBe('Something went wrong');
      }).then(() => {
        act(() => {
          result.current.reset();
        });

        expect(result.current.error).toBeNull();
      });
    });
  });
});
