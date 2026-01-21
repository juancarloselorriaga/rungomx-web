import { cn } from '@/lib/utils';

interface FieldLabelProps {
  children: React.ReactNode;
  required?: boolean;
  error?: boolean;
  actions?: React.ReactNode;
}

export function FieldLabel({ children, required, error, actions }: FieldLabelProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span
        className={cn(
          'inline-flex items-center gap-1 font-medium align-middle',
          error ? 'text-destructive' : 'text-foreground',
        )}
      >
        {children}
        {required ? (
          <span
            className="text-sm font-semibold leading-none text-destructive align-middle"
            aria-label="required"
          >
            *
          </span>
        ) : null}
      </span>
      {actions ? <span className="shrink-0">{actions}</span> : null}
    </div>
  );
}
