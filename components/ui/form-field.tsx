import { cn } from '@/lib/utils';
import { FieldError } from './field-error';
import { FieldLabel } from './field-label';

interface FormFieldProps {
  label: React.ReactNode;
  required?: boolean;
  error?: string | null;
  labelActions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function FormField({ label, required, error, labelActions, children, className }: FormFieldProps) {
  return (
    <label className={cn('block space-y-2 text-sm', className)}>
      <FieldLabel required={required} error={!!error} actions={labelActions}>
        {label}
      </FieldLabel>
      {children}
      <FieldError error={error} />
    </label>
  );
}

export { FieldLabel, FieldError };
