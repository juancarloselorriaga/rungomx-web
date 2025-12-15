import { cn } from '@/lib/utils';
import * as React from 'react';

export interface HighlightedListSectionProps {
  title: string;
  intro: string;
  calloutText?: string;
  items: string[];
  highlightedText: string;
  highlightedVariant?: 'blue' | 'green' | 'indigo';
  className?: string;
}

const highlightVariants = {
  blue: 'bg-[var(--brand-blue)]',
  green: 'bg-[var(--brand-green)]',
  indigo: 'bg-[var(--brand-indigo)]',
};

export function HighlightedListSection({
  title,
  intro,
  calloutText,
  items,
  highlightedText,
  highlightedVariant = 'blue',
  className,
}: HighlightedListSectionProps) {
  return (
    <div className={cn('w-full', className)}>
      <h2 className="mb-8 text-3xl font-bold text-foreground">{title}</h2>
      <div className="mb-8 text-lg leading-relaxed text-muted-foreground">
        <p className="mb-4">{intro}</p>
        {calloutText && <p className="font-medium text-foreground">{calloutText}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {items.map((item, index) => (
          <div
            key={index}
            className="flex items-start space-x-3 rounded-lg bg-card p-4 shadow-sm ring-1 ring-border"
          >
            <div className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-destructive" />
            <p className="text-muted-foreground">{item}</p>
          </div>
        ))}
      </div>

      <div className={cn('mt-8 rounded-xl p-6 text-center', highlightVariants[highlightedVariant])}>
        <p className="text-xl font-semibold text-primary-foreground">{highlightedText}</p>
      </div>
    </div>
  );
}
