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
        'scroll-mt-24 rounded-3xl border border-border bg-card/80 p-6 shadow-sm md:p-8',
        className,
      )}
      {...props}
    >
      <div className="space-y-3">
        <Title className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
          {title}
        </Title>
        {intro ? <p className="text-base leading-7 text-muted-foreground">{intro}</p> : null}
      </div>

      {body ? (
        <div
          className={cn(
            'mt-6 space-y-4 text-sm leading-7 text-muted-foreground md:text-base',
            bodyClassName,
          )}
        >
          {body}
        </div>
      ) : null}
    </article>
  );
}
