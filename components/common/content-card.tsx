import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

const cardVariants = cva('rounded-[1.5rem] p-7 md:p-9', {
  variants: {
    variant: {
      default:
        'bg-[color-mix(in_oklch,var(--background)_72%,var(--background-surface)_28%)] border border-border/45',
      'branded-blue':
        'bg-[color-mix(in_oklch,var(--background)_88%,var(--brand-blue)_12%)] border border-[color-mix(in_oklch,var(--brand-blue)_14%,var(--border))] text-foreground',
      'branded-green':
        'bg-[color-mix(in_oklch,var(--background)_88%,var(--brand-green)_12%)] border border-[color-mix(in_oklch,var(--brand-green)_14%,var(--border))] text-foreground',
      'branded-indigo':
        'bg-[color-mix(in_oklch,var(--background)_90%,var(--brand-indigo)_10%)] border border-[color-mix(in_oklch,var(--brand-indigo)_14%,var(--border))] text-foreground',
      'solid-blue':
        'bg-[color-mix(in_oklch,var(--brand-blue)_82%,var(--background)_18%)] border border-[color-mix(in_oklch,var(--brand-blue)_24%,var(--border))] text-white',
      'solid-green':
        'bg-[color-mix(in_oklch,var(--brand-green)_82%,var(--background)_18%)] border border-[color-mix(in_oklch,var(--brand-green)_24%,var(--border))] text-white',
      dark: 'bg-muted/35 border border-border/55 text-foreground',
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
