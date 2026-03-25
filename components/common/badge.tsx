import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]',
  {
    variants: {
      variant: {
        default: 'bg-muted text-muted-foreground',
        primary: 'bg-primary/10 text-primary',
        secondary: 'bg-secondary text-secondary-foreground',
        blue: 'bg-[var(--brand-blue)]/10 text-[var(--brand-blue)]',
        green: 'bg-[var(--brand-green)]/10 text-[var(--brand-green)]',
        indigo:
          'bg-[var(--brand-indigo)]/15 text-[var(--brand-indigo)] dark:bg-[var(--brand-indigo)]/35 dark:text-[oklch(0.86_0.11_278.3)]',
        pro: 'bg-[var(--brand-gold)]/15 text-[var(--brand-gold-dark)] dark:text-[var(--brand-gold)]',
        outline: 'border border-border bg-transparent text-foreground',
        ghost: 'bg-transparent text-muted-foreground',
      },
      size: {
        sm: 'px-2 py-0.5 text-[10px]',
        md: 'px-3 py-1 text-xs',
        lg: 'px-4 py-1.5 text-sm',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  icon?: React.ReactNode;
}

export function Badge({ children, variant, size, icon, className, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, size }), className)} {...props}>
      {icon}
      {children}
    </span>
  );
}
