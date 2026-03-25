import { cn } from '@/lib/utils';
import { Link } from '@/i18n/navigation';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { Badge, type BadgeProps } from './badge';
import { Button } from '@/components/ui/button';

const heroVariants = cva('relative overflow-hidden border-y border-border/60', {
  variants: {
    variant: {
      default: 'bg-background',
      gradient: 'bg-[color-mix(in_oklch,var(--background)_82%,var(--background-surface)_18%)]',
      'gradient-blue': 'bg-[color-mix(in_oklch,var(--background)_89%,var(--brand-blue)_11%)]',
      'gradient-green': 'bg-[color-mix(in_oklch,var(--background)_89%,var(--brand-green)_11%)]',
      dark: 'bg-foreground text-background',
    },
    padding: {
      sm: 'py-12 md:py-16',
      md: 'py-16 md:py-24',
      lg: 'py-24 md:py-32',
      xl: 'py-32 md:py-40',
    },
    align: {
      left: 'text-left',
      center: 'text-center',
    },
  },
  defaultVariants: {
    variant: 'gradient',
    padding: 'lg',
    align: 'left',
  },
});

const titleVariants = cva('font-display font-medium tracking-[-0.04em] text-balance', {
  variants: {
    titleSize: {
      md: 'text-[clamp(2.4rem,5vw,3.5rem)] leading-[0.97]',
      lg: 'text-[clamp(3rem,6vw,4.8rem)] leading-[0.94]',
      xl: 'text-[clamp(3.65rem,7vw,6rem)] leading-[0.9]',
    },
  },
  defaultVariants: {
    titleSize: 'lg',
  },
});

export interface HeroAction {
  label: string;
  href: string;
  variant?: 'default' | 'secondary' | 'outline' | 'ghost';
}

type LocalizedLinkHref = React.ComponentProps<typeof Link>['href'];

export interface HeroProps
  extends React.HTMLAttributes<HTMLElement>,
    VariantProps<typeof heroVariants>,
    VariantProps<typeof titleVariants> {
  badge?: string;
  badgeVariant?: BadgeProps['variant'];
  title: string;
  description?: string;
  actions?: HeroAction[];
}

export function Hero({
  badge,
  badgeVariant = 'primary',
  title,
  titleSize,
  description,
  actions,
  variant,
  padding,
  align,
  className,
  children,
  ...props
}: HeroProps) {
  const resolvedAlign = align ?? 'left';
  const isCenter = resolvedAlign === 'center';
  const isDark = variant === 'dark';

  return (
    <section className={cn(heroVariants({ variant, padding, align: resolvedAlign }), className)} {...props}>
      <div className="relative container mx-auto px-4 sm:px-6 lg:px-8">
        <div className={cn('max-w-5xl', isCenter && 'mx-auto')}>
          <div className={cn(!isCenter && 'border-l border-border/70 pl-5 md:pl-8')}>
            {badge && (
              <Badge variant={badgeVariant} className="mb-6">
                {badge}
              </Badge>
            )}

            <h1
              className={cn(titleVariants({ titleSize }), isDark ? 'text-inherit' : 'text-foreground')}
            >
              {title}
            </h1>

            {description && (
              <p
                className={cn(
                  'mt-6 max-w-[42rem] text-lg leading-8 md:text-xl',
                  isDark ? 'opacity-80' : 'text-muted-foreground',
                  isCenter && 'mx-auto',
                )}
              >
                {description}
              </p>
            )}

            {actions && actions.length > 0 && (
              <div
                className={cn(
                  'mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap',
                  isCenter && 'justify-center',
                )}
              >
                {actions.map((action, index) => (
                  <Button
                    key={index}
                    variant={action.variant || (index === 0 ? 'default' : 'outline')}
                    size="lg"
                    asChild
                  >
                    <Link href={action.href as LocalizedLinkHref}>{action.label}</Link>
                  </Button>
                ))}
              </div>
            )}

            {children && <div className="mt-12">{children}</div>}
          </div>
        </div>
      </div>
    </section>
  );
}
