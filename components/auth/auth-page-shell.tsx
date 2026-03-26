import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

type AuthPageShellProps = {
  icon: ReactNode;
  title: string;
  description: string;
  eyebrow?: string;
  notice?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function AuthPageShell({
  icon,
  title,
  description,
  eyebrow,
  notice,
  footer,
  children,
  className,
}: AuthPageShellProps) {
  return (
    <section
      className={cn(
        'overflow-hidden rounded-[2rem] border border-border/45 bg-[color-mix(in_oklch,var(--background)_78%,var(--background-surface)_22%)] shadow-[0_32px_90px_-56px_rgba(15,23,42,0.7)]',
        className,
      )}
    >
      <div className="border-b border-border/60 bg-[color-mix(in_oklch,var(--background)_72%,var(--background-surface)_28%)] px-6 py-6 sm:px-8 sm:py-7">
        <div className="flex items-start gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-full border border-border/50 bg-background/90 text-foreground shadow-sm">
            {icon}
          </div>
          <div className="min-w-0 space-y-2">
            {eyebrow ? (
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                {eyebrow}
              </p>
            ) : null}
            <h1 className="font-display text-[clamp(1.9rem,4vw,2.9rem)] font-medium leading-[0.95] tracking-[-0.035em] text-foreground">
              {title}
            </h1>
            <p className="max-w-[34rem] text-sm leading-7 text-muted-foreground sm:text-[0.98rem]">
              {description}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-6 px-6 py-6 sm:px-8 sm:py-8">
        {notice}
        {children}
        {footer}
      </div>
    </section>
  );
}
