import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

const cardVariants = cva('rounded-[1.75rem] p-7 md:p-9', {
  variants: {
    variant: {
      default:
        'bg-[color-mix(in_oklch,var(--background)_58%,var(--background-surface)_42%)] border border-border/75',
      'branded-blue':
        'bg-[color-mix(in_oklch,var(--background)_82%,var(--brand-blue)_18%)] border border-[color-mix(in_oklch,var(--brand-blue)_22%,var(--border))] text-foreground',
      'branded-green':
        'bg-[color-mix(in_oklch,var(--background)_82%,var(--brand-green)_18%)] border border-[color-mix(in_oklch,var(--brand-green)_22%,var(--border))] text-foreground',
      'branded-indigo':
        'bg-[color-mix(in_oklch,var(--background)_84%,var(--brand-indigo)_16%)] border border-[color-mix(in_oklch,var(--brand-indigo)_22%,var(--border))] text-foreground',
      'solid-blue':
        'bg-[color-mix(in_oklch,var(--brand-blue)_78%,var(--background)_22%)] border border-[color-mix(in_oklch,var(--brand-blue)_38%,var(--border))] text-white',
      'solid-green':
        'bg-[color-mix(in_oklch,var(--brand-green)_78%,var(--background)_22%)] border border-[color-mix(in_oklch,var(--brand-green)_38%,var(--border))] text-white',
      dark: 'bg-muted/45 border border-border/80 text-foreground',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

export interface ContentCardProps extends VariantProps<typeof cardVariants> {
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export function ContentCard({ title, children, variant, className }: ContentCardProps) {
  const isSolid = variant?.startsWith('solid-');

  return (
    <div className={cn(cardVariants({ variant }), className)}>
      {title && (
        <h2
          className={cn(
            'font-display mb-6 text-[clamp(1.55rem,3.4vw,2.4rem)] font-medium leading-tight tracking-[-0.03em]',
            isSolid ? 'text-inherit' : 'text-foreground',
          )}
        >
          {title}
        </h2>
      )}
        <div
          className={cn(
            'space-y-4 text-[0.98rem] leading-7 md:text-[1.05rem]',
            isSolid ? 'text-white/90' : 'text-muted-foreground',
          )}
        >
        {children}
      </div>
    </div>
  );
}
