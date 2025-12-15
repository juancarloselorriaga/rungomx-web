import type React from 'react';

/**
 * Standard server action result type for forms
 */
export type FormActionResult<TData = unknown> =
  | { ok: true; data: TData }
  | {
      ok: false;
      error: 'INVALID_INPUT';
      fieldErrors?: Record<string, string[]>;
      message?: string;
    }
  | {
      ok: false;
      error: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'SERVER_ERROR' | string;
      message?: string;
    };

/**
 * Form field errors type
 */
export type FieldErrors<TFieldValues extends Record<string, unknown>> = {
  [K in keyof TFieldValues]?: string | null;
};

/**
 * Form state returned by useForm hook
 */
export interface FormState<TFieldValues extends Record<string, unknown>> {
  values: TFieldValues;
  errors: FieldErrors<TFieldValues>;
  isSubmitting: boolean;
  error: string | null;
}

/**
 * Configuration for useForm hook
 */
export interface UseFormOptions<TFieldValues extends Record<string, unknown>, TResult = unknown> {
  defaultValues: TFieldValues;
  onSubmit: (values: TFieldValues) => Promise<FormActionResult<TResult>>;
  onSuccess?: (result: TResult) => void;
  onError?: (error: string) => void;
}

/**
 * Return type for useForm hook
 */
export interface UseFormReturn<TFieldValues extends Record<string, unknown>> {
  values: TFieldValues;
  errors: FieldErrors<TFieldValues>;
  isSubmitting: boolean;
  error: string | null;
  register: <K extends keyof TFieldValues>(
    name: K,
  ) => {
    name: K;
    value: TFieldValues[K];
    onChange: (
      value:
        | TFieldValues[K]
        | React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
    ) => void;
  };
  handleSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  reset: () => void;
  setError: (field: keyof TFieldValues, message: string) => void;
  clearError: (field: keyof TFieldValues) => void;
  setFieldValue: <K extends keyof TFieldValues>(field: K, value: TFieldValues[K]) => void;
}
