import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import Link from 'next/link';
import * as React from 'react';

import { Badge, type BadgeProps } from './badge';
import { Button } from '@/components/ui/button';

const heroVariants = cva('relative overflow-hidden', {
  variants: {
    variant: {
      default: 'bg-background',
      gradient: 'bg-background',
      'gradient-blue': 'bg-background',
      'gradient-green': 'bg-background',
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
    align: 'center',
  },
});

const titleVariants = cva('font-bold tracking-tight', {
  variants: {
    titleSize: {
      md: 'text-3xl md:text-4xl lg:text-5xl',
      lg: 'text-4xl md:text-5xl lg:text-6xl',
      xl: 'text-5xl md:text-6xl lg:text-7xl',
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
  const isCenter = align === 'center' || align === undefined;
  const isDark = variant === 'dark';
  const hasGradientGlow = variant === 'gradient-blue' || variant === 'gradient-green';

  return (
    <section className={cn(heroVariants({ variant, padding, align }), className)} {...props}>
      {/* Subtle gradient glow effect */}
      {hasGradientGlow && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
          <div
            className={cn(
              'absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] rounded-full blur-3xl opacity-20',
              variant === 'gradient-blue' && 'bg-gradient-to-br from-[var(--brand-blue)] to-[var(--brand-indigo)]',
              variant === 'gradient-green' && 'bg-gradient-to-br from-[var(--brand-green)] to-[var(--brand-blue)]',
            )}
          />
        </div>
      )}

      <div className="relative container mx-auto px-4 sm:px-6 lg:px-8">
        <div className={cn('max-w-4xl', isCenter && 'mx-auto')}>
          {badge && (
            <Badge variant={badgeVariant} className="mb-6">
              {badge}
            </Badge>
          )}

          <h1 className={cn(titleVariants({ titleSize }), isDark ? 'text-inherit' : 'text-foreground')}>
            {title}
          </h1>

          {description && (
            <p
              className={cn(
                'mt-6 text-lg md:text-xl leading-relaxed',
                isDark ? 'opacity-80' : 'text-muted-foreground',
                isCenter && 'max-w-2xl mx-auto',
              )}
            >
              {description}
            </p>
          )}

          {actions && actions.length > 0 && (
            <div
              className={cn(
                'mt-8 flex flex-wrap gap-4',
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
                  <Link href={action.href}>{action.label}</Link>
                </Button>
              ))}
            </div>
          )}

          {children}
        </div>
      </div>
    </section>
  );
}
