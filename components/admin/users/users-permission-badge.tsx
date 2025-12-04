'use client';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { ShieldCheck } from 'lucide-react';

type UsersPermissionBadgeProps = {
  label: string;
  enabled: boolean;
};

export function UsersPermissionBadge({ label, enabled }: UsersPermissionBadgeProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium',
              enabled
                ? 'border border-primary/30 bg-primary/10 text-primary'
                : 'border border-border/60 bg-muted text-muted-foreground'
            )}
          >
            <ShieldCheck className="size-3.5" />
            {label}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p className="max-w-xs text-xs">
            {label} {enabled ? 'is enabled for this user.' : 'is not available for this user.'}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
