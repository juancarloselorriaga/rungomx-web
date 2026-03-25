import { cn } from '@/lib/utils';
import * as React from 'react';

export interface LegalDocumentSectionProps
  extends Omit<React.HTMLAttributes<HTMLElement>, 'content' | 'title'> {
  title: React.ReactNode;
  intro?: React.ReactNode;
  content?: React.ReactNode;
  titleAs?: 'h2' | 'h3' | 'h4';
  bodyClassName?: string;
}

export function LegalDocumentSection({
  title,
  intro,
  content,
  titleAs: Title = 'h2',
  className,
  bodyClassName,
  children,
  ...props
}: LegalDocumentSectionProps) {
  const body = content ?? children;

  return (
    <article
      className={cn(
        'scroll-mt-24 border-t border-border/70 pt-8 md:pt-10',
        className,
      )}
      {...props}
    >
      <div className="max-w-3xl space-y-3">
        <Title className="font-display text-[clamp(1.75rem,2.8vw,2.4rem)] font-medium leading-[0.98] tracking-[-0.03em] text-foreground">
          {title}
        </Title>
        {intro ? <p className="text-base leading-7 text-muted-foreground">{intro}</p> : null}
      </div>

      {body ? (
        <div
          className={cn(
            'mt-6 max-w-3xl space-y-4 text-sm leading-7 text-muted-foreground md:text-base',
            bodyClassName,
          )}
        >
          {body}
        </div>
      ) : null}
    </article>
  );
}
