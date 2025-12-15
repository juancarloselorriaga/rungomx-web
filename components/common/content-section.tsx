import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

const sectionVariants = cva('py-16', {
  variants: {
    variant: {
      default: 'bg-background',
      muted: 'bg-muted/50',
      dark: 'bg-gradient-to-br from-foreground to-foreground/90 text-background',
      gradient: 'bg-gradient-to-b from-background to-muted/30',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

const containerVariants = cva('container mx-auto px-4', {
  variants: {
    containerSize: {
      sm: 'max-w-2xl',
      md: 'max-w-4xl',
      lg: 'max-w-6xl',
      xl: 'max-w-7xl',
    },
  },
  defaultVariants: {
    containerSize: 'md',
  },
});

export interface ContentSectionProps
  extends VariantProps<typeof sectionVariants>, VariantProps<typeof containerVariants> {
  children: React.ReactNode;
  className?: string;
  as?: 'section' | 'div';
}

export function ContentSection({
  children,
  variant,
  containerSize,
  className,
  as: Component = 'section',
}: ContentSectionProps) {
  return (
    <Component className={cn(sectionVariants({ variant }), className)}>
      <div className={cn(containerVariants({ containerSize }))}>{children}</div>
    </Component>
  );
}
