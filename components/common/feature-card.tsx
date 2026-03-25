import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import type { LucideIcon } from 'lucide-react';
import * as React from 'react';

const cardVariants = cva(
  'group relative rounded-[1.5rem] border p-6 md:p-8 transition-colors duration-200',
  {
    variants: {
      variant: {
        default:
          'bg-[color-mix(in_oklch,var(--background)_62%,var(--background-surface)_38%)] border-border/75 hover:border-border',
        elevated:
          'bg-[color-mix(in_oklch,var(--background)_54%,var(--background-surface)_46%)] border-border/70 hover:border-border',
        ghost:
          'border-transparent bg-transparent hover:border-border/60 hover:bg-[color-mix(in_oklch,var(--background)_76%,var(--background-surface)_24%)]',
        blue:
          'bg-[color-mix(in_oklch,var(--background)_86%,var(--brand-blue)_14%)] border-[color-mix(in_oklch,var(--brand-blue)_22%,var(--border))] hover:border-[color-mix(in_oklch,var(--brand-blue)_34%,var(--border))]',
        green:
          'bg-[color-mix(in_oklch,var(--background)_86%,var(--brand-green)_14%)] border-[color-mix(in_oklch,var(--brand-green)_22%,var(--border))] hover:border-[color-mix(in_oklch,var(--brand-green)_34%,var(--border))]',
        indigo:
          'bg-[color-mix(in_oklch,var(--background)_88%,var(--brand-indigo)_12%)] border-[color-mix(in_oklch,var(--brand-indigo)_22%,var(--border))] hover:border-[color-mix(in_oklch,var(--brand-indigo)_34%,var(--border))]',
        muted:
          'bg-[color-mix(in_oklch,var(--background)_56%,var(--muted)_44%)] border-border/75 hover:border-border',
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
  'inline-flex shrink-0 items-center justify-center rounded-md border bg-background/55',
  {
    variants: {
      iconVariant: {
        default: 'border-border/70 text-muted-foreground',
        primary: 'border-primary/12 bg-primary/[0.06] text-primary',
        blue: 'border-[var(--brand-blue)]/15 bg-[var(--brand-blue)]/8 text-[var(--brand-blue-dark)]',
        green:
          'border-[var(--brand-green)]/15 bg-[var(--brand-green)]/8 text-[var(--brand-green-dark)]',
        indigo: 'border-[var(--brand-indigo)]/15 bg-[var(--brand-indigo)]/8 text-[var(--brand-indigo)]',
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
          <h3 className="font-display text-lg font-medium tracking-[-0.025em] text-foreground">
            {title}
          </h3>
        </div>
      ) : (
        <>
          {Icon && (
            <div className={cn(iconContainerVariants({ iconVariant: inferredIconVariant, iconSize }), 'mb-4')}>
              <Icon className={cn(iconSize === 'sm' ? 'h-4 w-4' : iconSize === 'lg' ? 'h-6 w-6' : 'h-5 w-5')} />
            </div>
          )}
          <h3 className="font-display text-[clamp(1.45rem,3vw,2rem)] font-medium leading-tight tracking-[-0.03em] text-foreground">
            {title}
          </h3>
        </>
      )}

      {description && (
        <p
          className={cn(
            'text-sm leading-7 text-muted-foreground md:text-base',
            isInline ? 'mt-3' : 'mt-3',
          )}
        >
          {description}
        </p>
      )}

      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}
