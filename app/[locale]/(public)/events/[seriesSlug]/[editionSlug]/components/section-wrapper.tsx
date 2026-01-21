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

  // Scroll margin to account for mobile sticky bar (64px) + some padding
  const scrollMarginClass = 'scroll-mt-20';

  if (!collapsible) {
    return (
      <section id={id} className={cn(scrollMarginClass, className)}>
        {title && (
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
            {icon}
            {title}
          </h2>
        )}
        {children}
      </section>
    );
  }

  return (
    <section id={id} className={cn(scrollMarginClass, className)}>
      <button
        type="button"
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center justify-between py-2 text-left group"
        aria-expanded={!isCollapsed}
        aria-controls={`${id}-content`}
      >
        <h2 className="text-2xl font-bold flex items-center gap-2">
          {icon}
          {title}
        </h2>
        <ChevronDown
          className={cn(
            'h-5 w-5 text-muted-foreground transition-transform duration-200',
            isCollapsed ? '' : 'rotate-180',
          )}
        />
      </button>
      <div
        id={`${id}-content`}
        className={cn(
          'overflow-hidden transition-all duration-300 ease-in-out',
          isCollapsed ? 'max-h-0 opacity-0' : 'max-h-[5000px] opacity-100 mt-4',
        )}
      >
        {children}
      </div>
    </section>
  );
}
