import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { Badge, type BadgeProps } from './badge';

const textBlockVariants = cva('flex flex-col', {
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

const titleVariants = cva('font-display font-medium tracking-[-0.035em] text-balance', {
  variants: {
    titleSize: {
      sm: 'text-[clamp(1.9rem,4vw,2.4rem)] leading-[1.02]',
      md: 'text-[clamp(2.3rem,5vw,3.35rem)] leading-[0.98]',
      lg: 'text-[clamp(2.8rem,6vw,4.35rem)] leading-[0.95]',
      xl: 'text-[clamp(3.35rem,7vw,5.4rem)] leading-[0.92]',
    },
  },
  defaultVariants: {
    titleSize: 'md',
  },
});

export interface TextBlockProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof textBlockVariants>,
    VariantProps<typeof titleVariants> {
  eyebrow?: string;
  eyebrowVariant?: BadgeProps['variant'];
  title: string;
  titleAs?: 'h1' | 'h2' | 'h3' | 'h4';
  subtitle?: string;
  description?: string;
  motion?: 'none' | 'settle';
}

export function TextBlock({
  eyebrow,
  eyebrowVariant = 'primary',
  title,
  titleAs: TitleTag = 'h2',
  titleSize,
  subtitle,
  description,
  motion = 'settle',
  align,
  size,
  className,
  children,
  ...props
}: TextBlockProps) {
  const centered = align === 'center';
  const rightAligned = align === 'right';

  return (
    <div
      data-motion={motion === 'none' ? undefined : motion}
      className={cn(textBlockVariants({ align, size }), className)}
      {...props}
    >
      {eyebrow && (
        <Badge
          variant={eyebrowVariant}
          className="mb-5"
          data-motion-item
          style={{ '--motion-index': 0 } as React.CSSProperties}
        >
          {eyebrow}
        </Badge>
      )}

      <TitleTag
        data-motion-item
        style={{ '--motion-index': eyebrow ? 1 : 0 } as React.CSSProperties}
        className={cn(titleVariants({ titleSize }), 'text-foreground')}
      >
        {title}
      </TitleTag>

      {subtitle && (
        <p
          data-motion-item
          style={{ '--motion-index': eyebrow ? 2 : 1 } as React.CSSProperties}
          className={cn(
            'mt-4 max-w-[48rem] text-lg font-medium leading-8 text-foreground/80 md:text-xl',
            centered && 'mx-auto',
            rightAligned && 'ml-auto',
          )}
        >
          {subtitle}
        </p>
      )}

      {description && (
        <p
          data-motion-item
          style={{ '--motion-index': eyebrow ? 3 : 2 } as React.CSSProperties}
          className={cn(
            'mt-5 max-w-[65ch] text-base leading-8 text-muted-foreground md:text-lg',
            centered && 'mx-auto',
            rightAligned && 'ml-auto',
          )}
        >
          {description}
        </p>
      )}

      {children && (
        <div
          data-motion-item
          style={{ '--motion-index': eyebrow ? 4 : 3 } as React.CSSProperties}
          className="mt-8"
        >
          {children}
        </div>
      )}
    </div>
  );
}
