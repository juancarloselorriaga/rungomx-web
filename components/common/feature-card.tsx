import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import type { LucideIcon } from 'lucide-react';
import * as React from 'react';

const cardVariants = cva(
  'group relative rounded-2xl p-6 md:p-8 transition-all duration-300',
  {
    variants: {
      variant: {
        default: 'bg-card border border-border hover:border-border/80 hover:shadow-md',
        elevated: 'bg-card shadow-md hover:shadow-xl border border-transparent',
        ghost: 'bg-transparent hover:bg-muted/30',
        blue: 'bg-[var(--brand-blue)]/5 border border-[var(--brand-blue)]/10 hover:border-[var(--brand-blue)]/30',
        green: 'bg-[var(--brand-green)]/5 border border-[var(--brand-green)]/10 hover:border-[var(--brand-green)]/30',
        indigo: 'bg-[var(--brand-indigo)]/5 border border-[var(--brand-indigo)]/10 hover:border-[var(--brand-indigo)]/30',
        muted: 'bg-muted/50 border border-border hover:bg-muted/70',
      },
      size: {
        sm: 'p-4 md:p-6',
        md: 'p-6 md:p-8',
        lg: 'p-8 md:p-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  },
);

const iconContainerVariants = cva(
  'inline-flex items-center justify-center rounded-xl shrink-0',
  {
    variants: {
      iconVariant: {
        default: 'bg-muted text-muted-foreground',
        primary: 'bg-primary/10 text-primary',
        blue: 'bg-[var(--brand-blue)]/10 text-[var(--brand-blue)]',
        green: 'bg-[var(--brand-green)]/10 text-[var(--brand-green)]',
        indigo: 'bg-[var(--brand-indigo)]/10 text-[var(--brand-indigo)]',
      },
      iconSize: {
        sm: 'p-2',
        md: 'p-3',
        lg: 'p-4',
      },
    },
    defaultVariants: {
      iconVariant: 'primary',
      iconSize: 'md',
    },
  },
);

export interface FeatureCardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {
  icon?: LucideIcon;
  iconVariant?: VariantProps<typeof iconContainerVariants>['iconVariant'];
  iconSize?: VariantProps<typeof iconContainerVariants>['iconSize'];
  title: string;
  description?: string;
  layout?: 'stacked' | 'inline';
}

export function FeatureCard({
  icon: Icon,
  iconVariant,
  iconSize,
  title,
  description,
  variant,
  size,
  layout = 'stacked',
  className,
  children,
  ...props
}: FeatureCardProps) {
  const inferredIconVariant =
    iconVariant ||
    (variant === 'blue' ? 'blue' : variant === 'green' ? 'green' : variant === 'indigo' ? 'indigo' : variant === 'muted' ? 'primary' : 'primary');

  const isInline = layout === 'inline';

  return (
    <div className={cn(cardVariants({ variant, size }), className)} {...props}>
      {isInline ? (
        <div className="flex items-center gap-3">
          {Icon && (
            <div className={iconContainerVariants({ iconVariant: inferredIconVariant, iconSize })}>
              <Icon className={cn(iconSize === 'sm' ? 'h-4 w-4' : iconSize === 'lg' ? 'h-6 w-6' : 'h-5 w-5')} />
            </div>
          )}
          <h3 className="text-base md:text-lg font-semibold text-foreground">{title}</h3>
        </div>
      ) : (
        <>
          {Icon && (
            <div className={cn(iconContainerVariants({ iconVariant: inferredIconVariant, iconSize }), 'mb-4')}>
              <Icon className={cn(iconSize === 'sm' ? 'h-4 w-4' : iconSize === 'lg' ? 'h-6 w-6' : 'h-5 w-5')} />
            </div>
          )}
          <h3 className="text-lg md:text-xl font-semibold text-foreground">{title}</h3>
        </>
      )}

      {description && (
        <p className={cn('text-sm md:text-base text-muted-foreground leading-relaxed', isInline ? 'mt-3' : 'mt-2')}>
          {description}
        </p>
      )}

      {children}
    </div>
  );
}
