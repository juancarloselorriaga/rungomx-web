import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

const inputVariants = cva(
  [
    'flex w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground shadow-sm',
    'outline-none ring-0 transition',
    'disabled:cursor-not-allowed disabled:opacity-50',
    'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30',
    'aria-invalid:border-destructive aria-invalid:focus-visible:border-destructive',
  ].join(' '),
  {
    variants: {
      size: {
        // Mobile-first: enforce >=44px tap targets; preserve existing desktop sizing via `sm:*`.
        default: 'min-h-11 sm:min-h-10',
        sm: 'min-h-11 sm:min-h-9',
        lg: 'min-h-12 sm:min-h-11',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  },
);

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'> & VariantProps<typeof inputVariants>>(
  ({ className, size, type, ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        className={cn(inputVariants({ size }), className)}
        {...props}
      />
    );
  },
);

Input.displayName = 'Input';

export { Input, inputVariants };
