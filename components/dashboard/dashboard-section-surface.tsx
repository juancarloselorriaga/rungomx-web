import { Surface } from '@/components/ui/surface';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

type DashboardSectionSurfaceProps = {
  title: string;
  description?: string;
  eyebrow?: string;
  headerIcon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  tone?: 'default' | 'warning' | 'danger';
};

const toneClasses = {
  default: 'border-border/60',
  warning: 'border-amber-200/60',
  danger: 'border-destructive/30',
} as const;

const eyebrowClasses = {
  default: 'text-muted-foreground',
  warning: 'text-amber-700 dark:text-amber-400',
  danger: 'text-destructive',
} as const;

export function DashboardSectionSurface({
  title,
  description,
  eyebrow,
  headerIcon,
  actions,
  children,
  className,
  contentClassName,
  tone = 'default',
}: DashboardSectionSurfaceProps) {
  return (
    <Surface className={cn('space-y-0 p-0 shadow-none', toneClasses[tone], className)}>
      <div className="border-b border-border/60 px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            {headerIcon ? (
              <div className="rounded-full bg-muted p-2 text-muted-foreground">{headerIcon}</div>
            ) : null}

            <div className="space-y-2">
              {eyebrow ? (
                <p
                  className={cn(
                    'text-[0.72rem] font-semibold uppercase tracking-[0.18em]',
                    eyebrowClasses[tone],
                  )}
                >
                  {eyebrow}
                </p>
              ) : null}

              <div className="space-y-1">
                <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
                {description ? (
                  <p className="text-sm leading-6 text-muted-foreground">{description}</p>
                ) : null}
              </div>
            </div>
          </div>

          {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
        </div>
      </div>

      <div className={cn('p-5 sm:p-6', contentClassName)}>{children}</div>
    </Surface>
  );
}
