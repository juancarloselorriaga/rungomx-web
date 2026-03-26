import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

import {
  publicBodyTextClassName,
  publicEyebrowClassName,
  publicMutedPanelClassName,
  publicPageShellClassName,
  publicSurfaceBodyClassName,
  publicSurfaceClassName,
} from './public-form-styles';

type PublicStatusShellProps = {
  title: string;
  description: string;
  badge?: string;
  icon?: ReactNode;
  context?: ReactNode;
  support?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  align?: 'left' | 'center';
  className?: string;
  introClassName?: string;
  surfaceClassName?: string;
  bodyClassName?: string;
  iconClassName?: string;
};

export function PublicStatusShell({
  title,
  description,
  badge = 'RunGoMX',
  icon,
  context,
  support,
  actions,
  children,
  align = 'left',
  className,
  introClassName,
  surfaceClassName,
  bodyClassName,
  iconClassName,
}: PublicStatusShellProps) {
  const centered = align === 'center';

  return (
    <section className={cn(publicPageShellClassName, 'py-8 sm:py-12', className)}>
      <div className={cn('max-w-3xl', centered && 'mx-auto text-center', introClassName)}>
        <div className={cn('flex items-center gap-3', centered && 'justify-center')}>
          {icon ? (
            <div
              className={cn(
                'flex size-11 shrink-0 items-center justify-center rounded-full border border-border/45 bg-[color-mix(in_oklch,var(--background)_88%,var(--background-surface)_12%)] text-foreground',
                iconClassName,
              )}
            >
              {icon}
            </div>
          ) : null}
          {badge ? <p className={publicEyebrowClassName}>{badge}</p> : null}
        </div>

        <h1 className="mt-6 font-display text-[clamp(2.2rem,5vw,4.25rem)] font-medium leading-[0.9] tracking-[-0.045em] text-foreground">
          {title}
        </h1>

        <p className={cn('mt-4 max-w-[42rem]', publicBodyTextClassName, centered && 'mx-auto')}>
          {description}
        </p>

        {context ? (
          <div
            className={cn(
              'mt-6 border-t border-border/70 pt-4 text-sm font-medium text-foreground/80',
              centered && 'mx-auto max-w-[34rem]',
            )}
          >
            {context}
          </div>
        ) : null}
      </div>

      {support || children || actions ? (
        <div className={cn('mt-10', centered && 'mx-auto max-w-4xl')}>
          <div className={cn(publicSurfaceClassName, surfaceClassName)}>
            <div
              className={cn(publicSurfaceBodyClassName, 'space-y-5 sm:space-y-6', bodyClassName)}
            >
              {support ? (
                <div className={cn(publicMutedPanelClassName, 'p-4 sm:p-5')}>{support}</div>
              ) : null}
              {children}
              {actions ? (
                <div
                  className={cn('flex flex-col gap-3 sm:flex-row', centered && 'sm:justify-center')}
                >
                  {actions}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
