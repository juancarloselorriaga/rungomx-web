import { Skeleton } from '@/components/ui/skeleton';
import { InsetSurface, MutedSurface, Surface } from '@/components/ui/surface';
import { cn } from '@/lib/utils';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

type LoadingShellProps = ComponentPropsWithoutRef<'div'> & {
  loadingAriaLabel?: string;
};

export function LoadingShell({
  loadingAriaLabel,
  className,
  children,
  ...props
}: LoadingShellProps) {
  return (
    <div
      className={cn('space-y-6', className)}
      role={loadingAriaLabel ? 'status' : undefined}
      aria-live={loadingAriaLabel ? 'polite' : undefined}
      aria-label={loadingAriaLabel}
      {...props}
    >
      {children}
    </div>
  );
}

type LoadingTextBlockProps = {
  lines?: readonly string[];
  className?: string;
  lineClassName?: string;
};

export function LoadingTextBlock({
  lines = ['w-28', 'w-72'],
  className,
  lineClassName = 'h-4',
}: LoadingTextBlockProps) {
  return (
    <div className={cn('space-y-2', className)}>
      {lines.map((widthClassName, index) => (
        <Skeleton
          key={`${widthClassName}-${index}`}
          className={cn(lineClassName, widthClassName)}
        />
      ))}
    </div>
  );
}

type DashboardPageIntroSkeletonProps = {
  showEyebrow?: boolean;
  showActions?: boolean;
  showAside?: boolean;
  asideItems?: number;
  className?: string;
  descriptionWidths?: readonly string[];
  actionWidthClassName?: string;
};

export function DashboardPageIntroSkeleton({
  showEyebrow = true,
  showActions = true,
  showAside = true,
  asideItems = 2,
  className,
  descriptionWidths = ['w-full', 'w-11/12'],
  actionWidthClassName = 'h-10 w-full sm:w-40',
}: DashboardPageIntroSkeletonProps) {
  return (
    <Surface
      className={cn(
        'overflow-hidden border-border/60 bg-[color-mix(in_oklch,var(--background)_82%,var(--background-surface)_18%)] p-6 sm:p-8',
        className,
      )}
    >
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-4">
          {showEyebrow ? <Skeleton className="h-3 w-24" /> : null}

          <div className="space-y-2">
            <Skeleton className="h-10 w-56 max-w-full" />
            <LoadingTextBlock lines={descriptionWidths} />
          </div>

          {showActions ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <Skeleton className={actionWidthClassName} />
            </div>
          ) : null}
        </div>

        {showAside ? (
          <div className="w-full max-w-sm shrink-0 lg:w-[20rem]">
            <InsetSurface className="border-border/60 bg-background/80 p-5">
              <div className="space-y-3">
                <Skeleton className="h-3 w-28" />

                <div className="space-y-2">
                  <Skeleton className="h-5 w-40 max-w-full" />
                  <Skeleton className="h-4 w-44 max-w-full" />
                </div>

                {asideItems > 0 ? (
                  <div className="grid gap-3 border-t border-border/50 pt-3 sm:grid-cols-2 lg:grid-cols-1">
                    {Array.from({ length: asideItems }).map((_, index) => (
                      <div key={`intro-meta-skeleton-${index}`} className="space-y-2">
                        <Skeleton className="h-3 w-20" />
                        <Skeleton className="h-4 w-28" />
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </InsetSurface>
          </div>
        ) : null}
      </div>
    </Surface>
  );
}

type LoadingSurfaceProps = {
  variant?: 'primary' | 'inset' | 'muted';
  className?: string;
  children: ReactNode;
};

export function LoadingSurface({ variant = 'primary', className, children }: LoadingSurfaceProps) {
  const classes = cn(
    variant === 'primary' ? 'space-y-5' : variant === 'inset' ? 'space-y-4' : 'space-y-3',
    className,
  );

  if (variant === 'inset') {
    return <InsetSurface className={classes}>{children}</InsetSurface>;
  }

  if (variant === 'muted') {
    return <MutedSurface className={classes}>{children}</MutedSurface>;
  }

  return <Surface className={classes}>{children}</Surface>;
}

type LoadingStatGridProps = {
  count?: number;
  columnsClassName?: string;
  itemClassName?: string;
  compact?: boolean;
};

export function LoadingStatGrid({
  count = 4,
  columnsClassName = 'sm:grid-cols-2 xl:grid-cols-4',
  itemClassName,
  compact = false,
}: LoadingStatGridProps) {
  return (
    <div className={cn('grid gap-3', columnsClassName)}>
      {Array.from({ length: count }).map((_, index) => (
        <InsetSurface
          key={`loading-stat-${index}`}
          className={cn('border-border/55 bg-background/80', itemClassName)}
        >
          {compact ? (
            <div className="space-y-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-6 w-20" />
            </div>
          ) : (
            <div className="space-y-3">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-3 w-32" />
            </div>
          )}
        </InsetSurface>
      ))}
    </div>
  );
}
