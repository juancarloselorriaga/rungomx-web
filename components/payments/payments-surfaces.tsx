import { cn } from '@/lib/utils';
import type { ComponentPropsWithoutRef } from 'react';

export function PaymentsPanel({
  className,
  ...props
}: ComponentPropsWithoutRef<'section'>) {
  return (
    <section
      className={cn(
        'rounded-2xl border border-border/70 bg-card/90 p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-6',
        className,
      )}
      {...props}
    />
  );
}

export function PaymentsInsetPanel({
  className,
  ...props
}: ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border/60 bg-background/70 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]',
        className,
      )}
      {...props}
    />
  );
}

export function PaymentsMutedPanel({
  className,
  ...props
}: ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border/50 bg-muted/20 px-4 py-3',
        className,
      )}
      {...props}
    />
  );
}
