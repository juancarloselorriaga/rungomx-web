import { InsetSurface, Surface } from '@/components/ui/surface';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

type DashboardPageIntroProps = {
  title: string;
  description: string;
  eyebrow?: string;
  actions?: ReactNode;
  aside?: ReactNode;
  className?: string;
  contentClassName?: string;
  headingClassName?: string;
  descriptionClassName?: string;
};

type DashboardPageIntroMetaProps = {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  items?: ReadonlyArray<{
    label: string;
    value: ReactNode;
  }>;
  className?: string;
};

export function DashboardPageIntro({
  title,
  description,
  eyebrow,
  actions,
  aside,
  className,
  contentClassName,
  headingClassName,
  descriptionClassName,
}: DashboardPageIntroProps) {
  return (
    <Surface
      className={cn(
        'overflow-hidden border-border/60 bg-[color-mix(in_oklch,var(--background)_82%,var(--background-surface)_18%)] p-6 sm:p-8',
        className,
      )}
    >
      <div
        className={cn(
          'flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between',
          contentClassName,
        )}
      >
        <div className="min-w-0 space-y-3">
          {eyebrow ? (
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/80">
              {eyebrow}
            </p>
          ) : null}

          <div className="space-y-2">
            <h1
              className={cn(
                'text-3xl font-semibold tracking-tight text-foreground sm:text-4xl',
                headingClassName,
              )}
            >
              {title}
            </h1>
            <p
              className={cn(
                'max-w-2xl text-sm text-muted-foreground sm:text-base',
                descriptionClassName,
              )}
            >
              {description}
            </p>
          </div>

          {actions ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              {actions}
            </div>
          ) : null}
        </div>

        {aside ? <div className="w-full max-w-sm shrink-0 lg:w-[20rem]">{aside}</div> : null}
      </div>
    </Surface>
  );
}

export function DashboardPageIntroMeta({
  eyebrow,
  title,
  subtitle,
  items = [],
  className,
}: DashboardPageIntroMetaProps) {
  return (
    <InsetSurface className={cn('border-border/60 bg-background/80 p-5', className)}>
      <div className="space-y-3">
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {eyebrow}
          </p>
        ) : null}

        <div className="space-y-1">
          <div className="text-sm font-medium text-foreground">{title}</div>
          {subtitle ? <div className="text-sm text-muted-foreground">{subtitle}</div> : null}
        </div>

        {items.length > 0 ? (
          <dl className="grid gap-3 border-t border-border/50 pt-3 sm:grid-cols-2 lg:grid-cols-1">
            {items.map((item) => (
              <div key={item.label} className="space-y-1">
                <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {item.label}
                </dt>
                <dd className="break-words text-sm font-medium text-foreground">{item.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </InsetSurface>
  );
}
