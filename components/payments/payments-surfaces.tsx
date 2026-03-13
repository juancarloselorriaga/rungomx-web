import type { ComponentPropsWithoutRef } from 'react';
import { InsetSurface, MutedSurface, Surface } from '@/components/ui/surface';

export function PaymentsPanel({
  className,
  ...props
}: ComponentPropsWithoutRef<'section'>) {
  return <Surface className={className} {...props} />;
}

export function PaymentsInsetPanel({
  className,
  ...props
}: ComponentPropsWithoutRef<'div'>) {
  return <InsetSurface className={className} {...props} />;
}

export function PaymentsMutedPanel({
  className,
  ...props
}: ComponentPropsWithoutRef<'div'>) {
  return <MutedSurface className={className} {...props} />;
}
