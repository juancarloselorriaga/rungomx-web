'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition, type ReactNode } from 'react';

export type AdminPaymentsWorkspaceId =
  | 'overview'
  | 'risk'
  | 'operations'
  | 'investigation';

type AdminPaymentsNavItem = {
  id: AdminPaymentsWorkspaceId;
  label: string;
  description: string;
};

type AdminPaymentsWorkspaceShellProps = {
  title: string;
  description: string;
  workspaceLabel: string;
  activeItemId: AdminPaymentsWorkspaceId;
  items: AdminPaymentsNavItem[];
  toolbar?: ReactNode;
};

export function AdminPaymentsWorkspaceShell({
  title,
  description,
  workspaceLabel,
  activeItemId,
  items,
  toolbar,
}: AdminPaymentsWorkspaceShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function handleSelect(nextWorkspace: AdminPaymentsWorkspaceId): void {
    const next = new URLSearchParams(searchParams?.toString());
    next.set('workspace', nextWorkspace);
    startTransition(() => {
      router.replace(`${pathname}?${next.toString()}`);
    });
  }

  return (
    <section className="rounded-3xl border bg-card/70 p-5 shadow-sm sm:p-6" aria-busy={isPending}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/80">
            {workspaceLabel}
          </p>
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
            <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">
              {description}
            </p>
          </div>
        </div>

        {toolbar ? <div className="w-full xl:w-auto">{toolbar}</div> : null}
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => {
          const isActive = item.id === activeItemId;

          return (
            <Button
              key={item.id}
              type="button"
              variant={isActive ? 'default' : 'outline'}
              disabled={isPending}
              onClick={() => handleSelect(item.id)}
              className={cn(
                'h-auto min-h-28 justify-start rounded-2xl px-4 py-4 text-left shadow-none',
                isPending ? 'opacity-80' : '',
                isActive
                  ? 'border-primary/40 bg-primary/10 text-foreground hover:bg-primary/12'
                  : 'bg-background/80 hover:border-primary/30 hover:bg-card',
              )}
            >
              <div className="space-y-1.5">
                <p className="text-sm font-semibold">{item.label}</p>
                <p
                  className={cn(
                    'text-xs leading-5',
                    isActive ? 'text-muted-foreground' : 'text-muted-foreground',
                  )}
                >
                  {item.description}
                </p>
              </div>
            </Button>
          );
        })}
      </div>
    </section>
  );
}
