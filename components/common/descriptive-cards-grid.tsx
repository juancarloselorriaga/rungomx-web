import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

const cardsGridVariants = cva('py-16', {
  variants: {
    variant: {
      dark: 'bg-gradient-to-br from-foreground to-foreground/90 text-background',
      light: 'bg-background text-foreground',
    },
  },
  defaultVariants: {
    variant: 'dark',
  },
});

export interface CardItem {
  title: string;
  description: string;
}

export interface DescriptiveCardsGridProps extends VariantProps<typeof cardsGridVariants> {
  title: string;
  intro: string;
  label?: string;
  items: CardItem[];
  accentColor?: string;
  className?: string;
}

export function DescriptiveCardsGrid({
  title,
  intro,
  label,
  items,
  variant,
  accentColor,
  className,
}: DescriptiveCardsGridProps) {
  const isDark = variant === 'dark';
  const titleColor = accentColor || (isDark ? 'text-[var(--brand-blue)]' : 'text-foreground');

  return (
    <section className={cn(cardsGridVariants({ variant }), className)}>
      <div className="container mx-auto max-w-4xl px-4">
        <h2 className="mb-8 text-3xl font-bold">{title}</h2>
        <p className="mb-8 text-xl leading-relaxed opacity-90">{intro}</p>

        {label && <div className="mb-4 text-lg font-semibold">{label}</div>}
        <div className="grid gap-6 sm:grid-cols-2">
          {items.map((item, index) => (
            <div
              key={index}
              className={cn(
                'rounded-lg p-6 backdrop-blur-sm',
                isDark
                  ? 'bg-background/10 ring-1 ring-background/20'
                  : 'bg-muted/50 ring-1 ring-border',
              )}
            >
              <h3 className={cn('mb-2 text-lg font-bold', titleColor)}>{item.title}</h3>
              <p className="opacity-90">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
