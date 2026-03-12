import { cn } from '@/lib/utils';
import type { HTMLAttributes, ReactNode } from 'react';

type TextProps = {
  children: ReactNode;
  className?: string;
};

export function PaymentsEyebrow({ children, className }: TextProps) {
  return (
    <p
      className={cn(
        'text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80',
        className,
      )}
    >
      {children}
    </p>
  );
}

export function PaymentsSectionTitle({
  children,
  className,
  compact = false,
}: TextProps & { compact?: boolean }) {
  return (
    <h2
      className={cn(
        compact ? 'text-lg sm:text-xl' : 'text-2xl sm:text-[1.65rem]',
        'font-semibold tracking-tight text-foreground text-balance',
        className,
      )}
    >
      {children}
    </h2>
  );
}

export function PaymentsSectionDescription({ children, className }: TextProps) {
  return <p className={cn('max-w-3xl text-sm leading-6 text-muted-foreground', className)}>{children}</p>;
}

export function PaymentsMetricLabel({ children, className }: TextProps) {
  return (
    <p
      className={cn(
        'text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground',
        className,
      )}
    >
      {children}
    </p>
  );
}

export function PaymentsMetricValue({
  children,
  className,
  compact = false,
}: TextProps & { compact?: boolean }) {
  return (
    <p
      className={cn(
        compact ? 'text-xl sm:text-2xl' : 'text-2xl sm:text-[1.75rem]',
        'font-semibold tracking-tight tabular-nums text-foreground',
        className,
      )}
    >
      {children}
    </p>
  );
}

export function PaymentsMetadataText({ children, className }: TextProps) {
  return <p className={cn('text-sm leading-6 text-muted-foreground', className)}>{children}</p>;
}

export function PaymentsMetaLabel({ children, className }: TextProps) {
  return (
    <dt
      className={cn(
        'text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground',
        className,
      )}
    >
      {children}
    </dt>
  );
}

export function PaymentsMonoValue({
  children,
  className,
  as: Component = 'dd',
}: TextProps & { as?: 'dd' | 'p' | 'span' }) {
  return (
    <Component className={cn('font-mono text-xs leading-5 text-foreground/85 break-all', className)}>
      {children}
    </Component>
  );
}

export function PaymentsTimestamp({
  children,
  className,
  ...props
}: TextProps & HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn('text-sm tabular-nums text-muted-foreground', className)} {...props}>
      {children}
    </p>
  );
}
