import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import Link from 'next/link';
import * as React from 'react';

const bannerVariants = cva('rounded-2xl p-8 md:p-12 text-center', {
  variants: {
    variant: {
      default: 'bg-card border border-border',
      gradient:
        'bg-gradient-to-r from-[var(--brand-blue)] to-[var(--brand-indigo)] text-white shadow-lg',
      'gradient-green':
        'bg-gradient-to-r from-[var(--brand-green)] to-[var(--brand-green-dark)] text-white shadow-lg',
      dark: 'bg-muted border border-border',
      muted: 'bg-muted/30 border border-border',
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
      <h2
        className={cn(
          'text-2xl md:text-3xl font-bold',
          isGradient ? 'text-white' : 'text-foreground',
        )}
      >
        {title}
      </h2>

      {subtitle && (
        <p
          className={cn(
            'mt-3 text-lg md:text-xl',
            isGradient ? 'text-white/90' : 'text-muted-foreground',
          )}
        >
          {subtitle}
        </p>
      )}

      {children}

      {actions && actions.length > 0 && (
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          {actions.map((action, index) => {
            const buttonVariant = action.variant || (index === 0 ? 'secondary' : 'outline');
            return (
              <Button
                key={index}
                variant={buttonVariant}
                size="lg"
                className={cn(
                  isGradient && buttonVariant === 'outline' && 'border-white/50 text-white hover:bg-white/10',
                )}
                asChild
              >
                <Link href={action.href}>{action.label}</Link>
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}
