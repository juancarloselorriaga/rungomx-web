import { Surface } from '@/components/ui/surface';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

type SettingsSurfaceProps = {
  title: string;
  description: string;
  sectionLabel?: string;
  headerIcon?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  tone?: 'default' | 'danger';
};

export function SettingsSurface({
  title,
  description,
  sectionLabel,
  headerIcon,
  children,
  className,
  contentClassName,
  tone = 'default',
}: SettingsSurfaceProps) {
  const toneClasses = tone === 'danger' ? 'border-destructive/30' : 'border-border/60';

  const labelClasses = tone === 'danger' ? 'text-destructive' : 'text-muted-foreground';

  return (
    <Surface className={cn('space-y-0 p-0 shadow-none', toneClasses, className)}>
      <div className="border-b border-border/60 px-5 py-5 sm:px-6">
        <div className="flex items-start gap-3">
          {headerIcon ? (
            <div className="rounded-full bg-muted p-2 text-muted-foreground">{headerIcon}</div>
          ) : null}

          <div className="space-y-2">
            {sectionLabel ? (
              <p
                className={cn(
                  'text-[0.72rem] font-semibold uppercase tracking-[0.18em]',
                  labelClasses,
                )}
              >
                {sectionLabel}
              </p>
            ) : null}
            <div className="space-y-1">
              <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
              <p className="text-sm leading-6 text-muted-foreground">{description}</p>
            </div>
          </div>
        </div>
      </div>

      <div className={cn('p-5 sm:p-6', contentClassName)}>{children}</div>
    </Surface>
  );
}
