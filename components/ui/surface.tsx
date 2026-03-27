import { cn } from '@/lib/utils';
import type { ComponentPropsWithoutRef, ElementType } from 'react';

type SurfaceProps<T extends ElementType> = {
  as?: T;
  className?: string;
} & Omit<ComponentPropsWithoutRef<T>, 'as' | 'className'>;

export function Surface<T extends ElementType = 'section'>({
  as,
  className,
  ...props
}: SurfaceProps<T>) {
  const Component = (as ?? 'section') as ElementType;

  return (
    <Component
      className={cn(
        'rounded-2xl border border-border/70 bg-[color-mix(in_oklch,var(--background)_82%,var(--background-surface)_18%)] p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-6',
        className,
      )}
      {...props}
    />
  );
}

export function InsetSurface<T extends ElementType = 'div'>({
  as,
  className,
  ...props
}: SurfaceProps<T>) {
  const Component = (as ?? 'div') as ElementType;

  return (
    <Component
      className={cn(
        'rounded-xl border border-border/60 bg-secondary dark:bg-background-surface p-4 shadow-[inset_0_1px_3px_rgba(15,23,42,0.06),inset_0_1px_0_rgba(255,255,255,0.55)] dark:shadow-[inset_0_1px_4px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.07)]',
        className,
      )}
      {...props}
    />
  );
}

export function MutedSurface<T extends ElementType = 'div'>({
  as,
  className,
  ...props
}: SurfaceProps<T>) {
  const Component = (as ?? 'div') as ElementType;

  return (
    <Component
      className={cn(
        'rounded-xl border border-border/50 bg-muted/20 px-4 py-3',
        className,
      )}
      {...props}
    />
  );
}
