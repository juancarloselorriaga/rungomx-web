'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

type InvestigationToolId = 'lookup' | 'trace';

type InvestigationToolItem = {
  id: InvestigationToolId;
  title: string;
  description: string;
  status: string;
};

type AdminInvestigationToolSwitcherProps = {
  items: InvestigationToolItem[];
  activeTool: InvestigationToolId;
};

export function AdminInvestigationToolSwitcher({
  items,
  activeTool,
}: AdminInvestigationToolSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function handleSelect(tool: InvestigationToolId): void {
    const next = new URLSearchParams(searchParams?.toString());
    next.set('workspace', 'investigation');
    next.set('investigationTool', tool);
    startTransition(() => {
      router.replace(`${pathname}?${next.toString()}`);
    });
  }

  return (
    <div className="mt-5 grid gap-3 lg:grid-cols-2" aria-busy={isPending}>
      {items.map((tool) => {
        const isActive = tool.id === activeTool;

        return (
          <Button
            key={tool.id}
            type="button"
            variant={isActive ? 'default' : 'outline'}
            disabled={isPending}
            aria-pressed={isActive}
            onClick={() => handleSelect(tool.id)}
            className={cn(
              'h-auto justify-start rounded-2xl px-4 py-4 text-left shadow-sm',
              isActive
                ? 'border-primary/40 bg-primary/10 text-foreground shadow-[inset_0_0_0_1px_rgba(244,114,182,0.18)] hover:bg-primary/12'
                : 'bg-background/50 hover:border-primary/30 hover:bg-card',
              isPending ? 'opacity-80' : '',
            )}
          >
            <div className="space-y-1">
              <p className="text-sm font-semibold">{tool.title}</p>
              <p className={cn('text-sm', isActive ? 'text-foreground/80' : 'text-muted-foreground')}>
                {tool.description}
              </p>
              <p
                className={cn(
                  'pt-2 text-xs uppercase tracking-[0.18em]',
                  isActive ? 'text-primary/90' : 'text-muted-foreground',
                )}
              >
                {tool.status}
              </p>
            </div>
          </Button>
        );
      })}
    </div>
  );
}

type AdminInvestigationOpenTraceButtonProps = {
  label: string;
  caseQuery: string;
  evidenceTraceId: string;
};

export function AdminInvestigationOpenTraceButton({
  label,
  caseQuery,
  evidenceTraceId,
}: AdminInvestigationOpenTraceButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function handleClick(): void {
    const next = new URLSearchParams(searchParams?.toString());
    next.set('workspace', 'investigation');
    next.set('investigationTool', 'trace');
    if (caseQuery.trim()) {
      next.set('caseQuery', caseQuery);
    }
    next.set('evidenceTraceId', evidenceTraceId);
    startTransition(() => {
      router.replace(`${pathname}?${next.toString()}`);
    });
  }

  return (
    <Button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="rounded-xl"
      variant="outline"
    >
      {label}
    </Button>
  );
}
