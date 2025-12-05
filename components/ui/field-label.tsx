import { cn } from '@/lib/utils';

interface FieldLabelProps {
  children: React.ReactNode;
  required?: boolean;
  error?: boolean;
}

export function FieldLabel({ children, required, error }: FieldLabelProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className={cn('font-medium', error ? 'text-destructive' : 'text-foreground')}>
        {children}
        {required ? (
          <span className="ml-0.5 text-base font-bold text-destructive" aria-label="required">
            *
          </span>
        ) : null}
      </span>
    </div>
  );
}
