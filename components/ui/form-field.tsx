import { FieldLabel } from './field-label';
import { FieldError } from './field-error';
import { cn } from '@/lib/utils';

interface FormFieldProps {
  label: React.ReactNode;
  required?: boolean;
  error?: string | null;
  children: React.ReactNode;
  className?: string;
}

export function FormField({ label, required, error, children, className }: FormFieldProps) {
  return (
    <label className={cn('space-y-1 text-sm', className)}>
      <FieldLabel required={required} error={!!error}>
        {label}
      </FieldLabel>
      {children}
      <FieldError error={error} />
    </label>
  );
}

export { FieldLabel, FieldError };
