'use client';

import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { Lock } from 'lucide-react';
import type { ComponentProps } from 'react';

type ProLockedCardProps = {
  title: string;
  description: string;
  ctaLabel: string;
  href?: ComponentProps<typeof Link>['href'];
  className?: string;
};

export function ProLockedCard({
  title,
  description,
  ctaLabel,
  href = '/settings/billing',
  className,
}: ProLockedCardProps) {
  return (
    <div className={cn('rounded-lg border border-border/60 bg-muted/30 p-4 shadow-sm', className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Lock className="size-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm" className="shrink-0">
          <Link href={href}>{ctaLabel}</Link>
        </Button>
      </div>
    </div>
  );
}
