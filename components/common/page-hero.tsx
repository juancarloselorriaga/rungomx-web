import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

const heroVariants = cva('relative overflow-hidden py-20 text-primary-foreground', {
  variants: {
    variant: {
      blue: 'bg-gradient-to-br from-[var(--brand-blue)] via-[var(--brand-blue-dark)] to-[var(--brand-indigo)]',
      green:
        'bg-gradient-to-br from-[var(--brand-green)] via-[var(--brand-green-dark)] to-[var(--brand-blue)]',
      indigo:
        'bg-gradient-to-br from-[var(--brand-indigo)] via-[var(--brand-blue-dark)] to-[var(--brand-blue)]',
      gradient: 'bg-gradient-to-br from-[var(--brand-blue)] to-[var(--brand-green)]',
    },
  },
  defaultVariants: {
    variant: 'blue',
  },
});

export interface PageHeroProps extends VariantProps<typeof heroVariants> {
  title: string;
  description: string;
  className?: string;
}

export function PageHero({ title, description, variant, className }: PageHeroProps) {
  return (
    <section className={cn(heroVariants({ variant }), className)}>
      <div className="container relative mx-auto max-w-4xl px-4">
        <h1 className="mb-6 text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl">{title}</h1>
        <p className="text-xl leading-relaxed opacity-90 md:text-2xl">{description}</p>
      </div>
    </section>
  );
}
