'use client';

import type React from 'react';
import { createContext, useContext } from 'react';
import { cn } from '@/lib/utils';
import type { UseFormReturn } from './types';

/**
 * Form context for providing form state to child components
 */
type GenericFormValues = Record<string, unknown>;

const FormContext = createContext<UseFormReturn<GenericFormValues> | null>(null);

/**
 * Hook to access form context
 */
export function useFormContext<TFieldValues extends Record<string, unknown>>() {
  const context = useContext(FormContext);
  if (!context) {
    throw new Error('useFormContext must be used within a Form component');
  }
  return context as UseFormReturn<TFieldValues>;
}

/**
 * Form component props
 */
interface FormProps<TFieldValues extends Record<string, unknown>>
  extends Omit<React.FormHTMLAttributes<HTMLFormElement>, 'onSubmit'> {
  form: UseFormReturn<TFieldValues>;
  children: React.ReactNode;
}

/**
 * Form component that provides context and handles submission
 */
export function Form<TFieldValues extends Record<string, unknown>>({
  form,
  children,
  className,
  ...props
}: FormProps<TFieldValues>) {
  return (
    <FormContext.Provider value={form as UseFormReturn<GenericFormValues>}>
      <form
        className={cn('space-y-4', className)}
        onSubmit={form.handleSubmit}
        noValidate
        {...props}
      >
        {children}
      </form>
    </FormContext.Provider>
  );
}

/**
 * Form error banner component
 */
export function FormError({ className }: { className?: string }) {
  const { error } = useFormContext();

  if (!error) return null;

  return (
    <div
      className={cn(
        'rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive',
        className
      )}
      role="alert"
    >
      {error}
    </div>
  );
}
