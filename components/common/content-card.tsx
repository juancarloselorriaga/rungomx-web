import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

const cardVariants = cva('rounded-2xl p-8 md:p-10', {
  variants: {
    variant: {
      default: 'bg-card border border-border',
      'branded-blue':
        'bg-[var(--brand-blue)]/10 border border-[var(--brand-blue)]/20 text-foreground',
      'branded-green':
        'bg-[var(--brand-green)]/10 border border-[var(--brand-green)]/20 text-foreground',
      'branded-indigo':
        'bg-[var(--brand-indigo)]/10 border border-[var(--brand-indigo)]/20 text-foreground',
      'solid-blue':
        'bg-gradient-to-br from-[var(--brand-blue)] to-[var(--brand-blue-dark)] text-white shadow-lg',
      'solid-green':
        'bg-gradient-to-br from-[var(--brand-green)] to-[var(--brand-green-dark)] text-white shadow-lg',
      dark: 'bg-muted/50 border border-border text-foreground',
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
            'mb-6 text-2xl md:text-3xl font-bold',
            isSolid ? 'text-inherit' : 'text-foreground',
          )}
        >
          {title}
        </h2>
      )}
      <div
        className={cn(
          'space-y-4 text-base md:text-lg leading-relaxed',
          isSolid ? 'text-white/90' : 'text-muted-foreground',
        )}
      >
        {children}
      </div>
    </div>
  );
}
