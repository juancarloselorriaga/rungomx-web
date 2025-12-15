import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

const cardVariants = cva('rounded-2xl p-8 shadow-lg md:p-12', {
  variants: {
    variant: {
      default: 'bg-card ring-1 ring-border',
      'branded-blue':
        'bg-gradient-to-br from-[var(--brand-blue)] to-[var(--brand-blue-dark)] text-primary-foreground shadow-xl',
      'branded-green':
        'bg-gradient-to-br from-[var(--brand-green)] to-[var(--brand-green-dark)] text-primary-foreground shadow-xl',
      'branded-indigo':
        'bg-gradient-to-br from-[var(--brand-indigo)] to-[var(--brand-blue-dark)] text-primary-foreground shadow-xl',
      dark: 'bg-gradient-to-br from-foreground to-foreground/90 text-background ring-1 ring-background/20',
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
  const isBranded = variant?.includes('branded');
  const isDark = variant === 'dark';

  return (
    <div className={cn(cardVariants({ variant }), className)}>
      {title && (
        <h2
          className={cn(
            'mb-6 text-3xl font-bold',
            isBranded || isDark ? 'text-inherit' : 'text-foreground',
          )}
        >
          {title}
        </h2>
      )}
      <div
        className={cn(
          'space-y-4 text-lg leading-relaxed',
          isBranded || isDark ? 'opacity-90' : 'text-muted-foreground',
        )}
      >
        {children}
      </div>
    </div>
  );
}
