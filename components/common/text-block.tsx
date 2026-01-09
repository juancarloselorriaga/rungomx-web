import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { Badge, type BadgeProps } from './badge';

const textBlockVariants = cva('', {
  variants: {
    align: {
      left: 'text-left',
      center: 'text-center mx-auto',
      right: 'text-right ml-auto',
    },
    size: {
      sm: 'max-w-xl',
      md: 'max-w-2xl',
      lg: 'max-w-3xl',
      full: 'max-w-none',
    },
  },
  defaultVariants: {
    align: 'left',
    size: 'full',
  },
});

const titleVariants = cva('font-bold tracking-tight', {
  variants: {
    titleSize: {
      sm: 'text-2xl md:text-3xl',
      md: 'text-3xl md:text-4xl',
      lg: 'text-4xl md:text-5xl',
      xl: 'text-5xl md:text-6xl',
    },
  },
  defaultVariants: {
    titleSize: 'md',
  },
});

export interface TextBlockProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof textBlockVariants>,
    VariantProps<typeof titleVariants> {
  eyebrow?: string;
  eyebrowVariant?: BadgeProps['variant'];
  title: string;
  titleAs?: 'h1' | 'h2' | 'h3' | 'h4';
  subtitle?: string;
  description?: string;
}

export function TextBlock({
  eyebrow,
  eyebrowVariant = 'primary',
  title,
  titleAs: TitleTag = 'h2',
  titleSize,
  subtitle,
  description,
  align,
  size,
  className,
  children,
  ...props
}: TextBlockProps) {
  return (
    <div className={cn(textBlockVariants({ align, size }), className)} {...props}>
      {eyebrow && (
        <Badge variant={eyebrowVariant} className="mb-4">
          {eyebrow}
        </Badge>
      )}

      <TitleTag className={cn(titleVariants({ titleSize }), 'text-foreground')}>{title}</TitleTag>

      {subtitle && (
        <p className="mt-4 text-lg md:text-xl font-medium text-foreground/80">{subtitle}</p>
      )}

      {description && (
        <p className="mt-4 text-base md:text-lg text-muted-foreground leading-relaxed">
          {description}
        </p>
      )}

      {children && <div className="mt-6">{children}</div>}
    </div>
  );
}
