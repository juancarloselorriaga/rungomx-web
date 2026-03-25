'use client';

import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';
import { useState, type ReactNode } from 'react';

type SectionWrapperProps = {
  id: string;
  title?: string;
  icon?: ReactNode;
  children: ReactNode;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  className?: string;
};

function SectionHeading({ title, icon }: Pick<SectionWrapperProps, 'title' | 'icon'>) {
  if (!title) return null;

  return (
    <div className="mb-6 border-t border-border/70 pt-5 md:mb-7 md:pt-6">
      <div className="flex items-center gap-3 text-muted-foreground">
        {icon ? <span className="shrink-0 opacity-80">{icon}</span> : null}
        <h2 className="font-display text-[clamp(1.85rem,3vw,2.6rem)] font-medium leading-[0.98] tracking-[-0.03em] text-foreground">
          {title}
        </h2>
      </div>
    </div>
  );
}

export function SectionWrapper({
  id,
  title,
  icon,
  children,
  collapsible = false,
  defaultCollapsed = false,
  className,
}: SectionWrapperProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const baseClassName = cn('scroll-mt-24', className);

  if (!collapsible) {
    return (
      <section id={id} className={baseClassName}>
        {title ? <SectionHeading title={title} icon={icon} /> : null}
        <div className={cn(!title && 'border-t border-border/70 pt-5 md:pt-6')}>{children}</div>
      </section>
    );
  }

  return (
    <section id={id} className={baseClassName}>
      <div className="border-t border-border/70 pt-5 md:pt-6">
        <button
          type="button"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="group flex w-full items-center justify-between gap-4 text-left"
          aria-expanded={!isCollapsed}
          aria-controls={`${id}-content`}
        >
          <div className="flex items-center gap-3 text-muted-foreground">
            {icon ? <span className="shrink-0 opacity-80">{icon}</span> : null}
            <h2 className="font-display text-[clamp(1.85rem,3vw,2.6rem)] font-medium leading-[0.98] tracking-[-0.03em] text-foreground">
              {title}
            </h2>
          </div>
          <ChevronDown
            className={cn(
              'h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200',
              isCollapsed ? '' : 'rotate-180',
            )}
          />
        </button>
      </div>
      <div
        id={`${id}-content`}
        className={cn(
          'overflow-hidden transition-all duration-300 ease-in-out',
          isCollapsed ? 'max-h-0 opacity-0' : 'mt-6 max-h-[5000px] opacity-100',
        )}
      >
        {children}
      </div>
    </section>
  );
}
