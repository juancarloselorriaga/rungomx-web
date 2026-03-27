import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        'rounded-md border border-border/35 bg-[color-mix(in_oklch,var(--background)_74%,var(--background-surface)_26%)] animate-pulse',
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
