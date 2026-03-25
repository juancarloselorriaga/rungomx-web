import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

const badgeVariants = cva(
  'inline-flex items-center gap-2.5 rounded-none bg-transparent px-0 py-0 text-[0.72rem] font-semibold uppercase tracking-[0.2em]',
  {
    variants: {
      variant: {
        default: 'text-muted-foreground',
        primary: 'text-foreground/80',
        secondary: 'text-muted-foreground',
        blue: 'text-[var(--brand-blue-dark)]',
        green: 'text-[var(--brand-green-dark)]',
        indigo: 'text-[var(--brand-indigo)] dark:text-[oklch(0.86_0.11_278.3)]',
        pro: 'text-[var(--brand-gold-dark)] dark:text-[var(--brand-gold)]',
        outline: 'text-foreground',
        ghost: 'text-muted-foreground/80',
      },
      size: {
        sm: 'gap-2 text-[0.68rem]',
        md: 'gap-2.5 text-[0.72rem]',
        lg: 'gap-3 text-[0.8rem]',
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
  const railClassName = size === 'sm' ? 'w-4' : size === 'lg' ? 'w-8' : 'w-6';

  return (
    <span className={cn(badgeVariants({ variant, size }), className)} {...props}>
      <span aria-hidden className={cn('h-px shrink-0 bg-current opacity-35', railClassName)} />
      {icon}
      {children}
    </span>
  );
}
