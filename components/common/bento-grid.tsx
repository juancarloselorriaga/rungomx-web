import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

const gridVariants = cva('grid gap-4 md:gap-6', {
  variants: {
    columns: {
      1: 'grid-cols-1',
      2: 'grid-cols-1 md:grid-cols-2',
      3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
      4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
      auto: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    },
  },
  defaultVariants: {
    columns: 'auto',
  },
});

export interface BentoGridProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof gridVariants> {}

export function BentoGrid({ columns, className, children, ...props }: BentoGridProps) {
  return (
    <div className={cn(gridVariants({ columns }), className)} {...props}>
      {children}
    </div>
  );
}

const itemVariants = cva('rounded-2xl', {
  variants: {
    span: {
      1: '',
      2: 'md:col-span-2',
      3: 'md:col-span-2 lg:col-span-3',
      full: 'col-span-full',
    },
    rowSpan: {
      1: '',
      2: 'md:row-span-2',
    },
  },
  defaultVariants: {
    span: 1,
    rowSpan: 1,
  },
});

export interface BentoGridItemProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof itemVariants> {}

export function BentoGridItem({ span, rowSpan, className, children, ...props }: BentoGridItemProps) {
  return (
    <div className={cn(itemVariants({ span, rowSpan }), className)} {...props}>
      {children}
    </div>
  );
}
