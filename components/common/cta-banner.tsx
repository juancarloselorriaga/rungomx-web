import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

const bannerVariants = cva('rounded-[1.5rem] p-8 md:p-10', {
  variants: {
    variant: {
      default:
        'border border-border/45 bg-[color-mix(in_oklch,var(--background)_72%,var(--background-surface)_28%)]',
      gradient:
        'bg-[color-mix(in_oklch,var(--background)_92%,var(--brand-blue)_8%)] text-foreground',
      'gradient-green':
        'bg-[color-mix(in_oklch,var(--background)_92%,var(--brand-green)_8%)] text-foreground',
      dark: 'border border-border/55 bg-muted',
      muted:
        'rounded-none border-t border-border/70 bg-transparent px-0 py-8 text-foreground md:py-10',
    },
  },
  defaultVariants: {
    variant: 'gradient',
  },
});

export interface CtaAction {
  label: string;
  href: string;
  variant?: 'default' | 'secondary' | 'outline' | 'ghost';
}

type LocalizedLinkHref = React.ComponentProps<typeof Link>['href'];

export interface CtaBannerProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof bannerVariants> {
  title: string;
  subtitle?: string;
  actions?: CtaAction[];
}

export function CtaBanner({
  title,
  subtitle,
  actions,
  variant,
  className,
  children,
  ...props
}: CtaBannerProps) {
  const isGradient = variant === 'gradient' || variant === 'gradient-green';

  return (
    <div className={cn(bannerVariants({ variant }), className)} {...props}>
      <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-[42rem]">
          <h2 className="font-display text-[clamp(2rem,4vw,3.25rem)] font-medium leading-[0.95] tracking-[-0.04em] text-foreground">
            {title}
          </h2>

          {subtitle && (
            <p
              className={cn(
                'mt-4 text-base leading-8 md:text-lg',
                isGradient ? 'text-foreground/80' : 'text-muted-foreground',
              )}
            >
              {subtitle}
            </p>
          )}

          {children && <div className="mt-6">{children}</div>}
        </div>

        {actions && actions.length > 0 && (
          <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
            {actions.map((action, index) => {
              const buttonVariant = action.variant || (index === 0 ? 'default' : 'outline');
              return (
                <Button
                  key={index}
                  variant={buttonVariant}
                  size="lg"
                  className={cn(
                    isGradient &&
                      buttonVariant === 'outline' &&
                      'border-foreground/12 bg-transparent text-foreground hover:bg-foreground/4',
                  )}
                  asChild
                >
                  <Link href={action.href as LocalizedLinkHref}>{action.label}</Link>
                </Button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
