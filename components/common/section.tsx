import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

const sectionVariants = cva('relative w-full', {
  variants: {
    variant: {
      default: 'bg-background',
      muted: 'bg-muted/30',
      dark: 'bg-card border-y border-border',
      gradient: 'bg-gradient-to-b from-background to-muted/30',
      'gradient-brand':
        'bg-gradient-to-r from-[var(--brand-blue)] to-[var(--brand-indigo)] text-primary-foreground',
      'gradient-green':
        'bg-gradient-to-br from-[var(--brand-green)]/90 to-[var(--brand-green-dark)] text-primary-foreground',
    },
    padding: {
      none: '',
      sm: 'py-8 md:py-12',
      md: 'py-12 md:py-16',
      lg: 'py-16 md:py-24',
      xl: 'py-24 md:py-32',
    },
  },
  defaultVariants: {
    variant: 'default',
    padding: 'md',
  },
});

const containerVariants = cva('container mx-auto px-4 sm:px-6 lg:px-8', {
  variants: {
    size: {
      sm: 'max-w-2xl',
      md: 'max-w-4xl',
      lg: 'max-w-6xl',
      xl: 'max-w-7xl',
      full: 'max-w-none',
    },
  },
  defaultVariants: {
    size: 'lg',
  },
});

export interface SectionProps
  extends React.HTMLAttributes<HTMLElement>,
    VariantProps<typeof sectionVariants>,
    VariantProps<typeof containerVariants> {
  as?: 'section' | 'div' | 'article' | 'aside';
  containerClassName?: string;
  noContainer?: boolean;
}

export function Section({
  children,
  variant,
  padding,
  size,
  className,
  containerClassName,
  noContainer = false,
  as: Component = 'section',
  ...props
}: SectionProps) {
  return (
    <Component className={cn(sectionVariants({ variant, padding }), className)} {...props}>
      {noContainer ? (
        children
      ) : (
        <div className={cn(containerVariants({ size }), containerClassName)}>{children}</div>
      )}
    </Component>
  );
}
