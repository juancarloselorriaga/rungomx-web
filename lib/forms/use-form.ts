'use client';

import type React from 'react';
import { useCallback, useRef, useState, useTransition } from 'react';
import type { FieldErrors, UseFormOptions, UseFormReturn } from './types';

export function useForm<TFieldValues extends Record<string, unknown>, TResult = unknown>(
  options: UseFormOptions<TFieldValues, TResult>,
): UseFormReturn<TFieldValues> {
  const { defaultValues, onSubmit, onSuccess, onError } = options;

  const [values, setValues] = useState<TFieldValues>(defaultValues);
  const [errors, setErrors] = useState<FieldErrors<TFieldValues>>({});
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, startTransition] = useTransition();

  // Store default values for reset
  const defaultValuesRef = useRef(defaultValues);

  /**
   * Register a field for form management
   * Returns props to spread on input components
   */
  const register = useCallback(
    <K extends keyof TFieldValues>(name: K) => ({
      name,
      value: values[name],
      onChange: (
        value:
          | TFieldValues[K]
          | React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
      ) => {
        const nextValue =
          value && typeof value === 'object' && 'target' in value
            ? (value.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value
            : value;
        setValues((prev) => ({ ...prev, [name]: nextValue as TFieldValues[K] }));

        // Clear field error when value changes
        if (errors[name]) {
          setErrors((prev) => ({ ...prev, [name]: null }));
        }
      },
    }),
    [values, errors],
  );

  /**
   * Handle form submission
   */
  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);
      setErrors({});

      startTransition(async () => {
        try {
          const result = await onSubmit(values);

          if (!result.ok) {
            if (result.error === 'INVALID_INPUT' && 'fieldErrors' in result && result.fieldErrors) {
              // Map server field errors to form errors
              const newErrors: FieldErrors<TFieldValues> = {};

              Object.entries(result.fieldErrors).forEach(([field, messages]) => {
                if (field in values) {
                  // Take first error message for each field
                  newErrors[field as keyof TFieldValues] = (messages as string[])[0] || null;
                }
              });

              setErrors(newErrors);
            }

            // Set form-level error message
            const errorMessage = result.message || 'An error occurred';
            setError(errorMessage);

            if (onError) {
              onError(errorMessage);
            }

            return;
          }

          // Success
          if (onSuccess) {
            onSuccess(result.data);
          }
        } catch (err) {
          console.error('[useForm] Submission error:', err);
          const errorMessage = 'An unexpected error occurred';
          setError(errorMessage);

          if (onError) {
            onError(errorMessage);
          }
        }
      });
    },
    [values, onSubmit, onSuccess, onError],
  );

  /**
   * Reset form to default values
   */
  const reset = useCallback(() => {
    setValues(defaultValuesRef.current);
    setErrors({});
    setError(null);
  }, []);

  /**
   * Manually set a field error
   */
  const setFieldError = useCallback((field: keyof TFieldValues, message: string) => {
    setErrors((prev) => ({ ...prev, [field]: message }));
  }, []);

  /**
   * Clear a specific field error
   */
  const clearError = useCallback((field: keyof TFieldValues) => {
    setErrors((prev) => ({ ...prev, [field]: null }));
  }, []);

  /**
   * Manually set a field value
   */
  const setFieldValue = useCallback(
    <K extends keyof TFieldValues>(field: K, value: TFieldValues[K]) => {
      setValues((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  return {
    values,
    errors,
    isSubmitting,
    error,
    register,
    handleSubmit,
    reset,
    setError: setFieldError,
    clearError,
    setFieldValue,
  };
}
