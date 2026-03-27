import type { ComponentPropsWithoutRef } from 'react';
import { InsetSurface, MutedSurface, Surface } from '@/components/ui/surface';
import { cn } from '@/lib/utils';

export function PaymentsPanel({ className, ...props }: ComponentPropsWithoutRef<'section'>) {
  return <Surface className={cn('border-border/60 shadow-none', className)} {...props} />;
}

export function PaymentsInsetPanel({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return (
    <InsetSurface
      className={cn('border-border/50 bg-background/70 shadow-none', className)}
      {...props}
    />
  );
}

export function PaymentsMutedPanel({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return <MutedSurface className={cn('border-border/50', className)} {...props} />;
}
