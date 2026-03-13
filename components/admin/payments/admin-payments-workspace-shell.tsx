'use client';

import {
  PaymentsEyebrow,
  PaymentsSectionDescription,
} from '@/components/payments/payments-typography';
import { PaymentsMutedPanel, PaymentsPanel } from '@/components/payments/payments-surfaces';
import { Button } from '@/components/ui/button';
import { type AdminPaymentsWorkspaceId } from '@/lib/payments/admin/workspaces';
import { cn } from '@/lib/utils';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition, type ReactNode } from 'react';

export type { AdminPaymentsWorkspaceId } from '@/lib/payments/admin/workspaces';

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
  const activeItem = items.find((item) => item.id === activeItemId) ?? items[0];

  function handleSelect(nextWorkspace: AdminPaymentsWorkspaceId): void {
    const next = new URLSearchParams(searchParams?.toString());
    next.set('workspace', nextWorkspace);
    startTransition(() => {
      router.replace(`${pathname}?${next.toString()}`);
    });
  }

  return (
    <PaymentsPanel
      className="p-3 sm:rounded-3xl sm:p-5 lg:p-6"
      aria-busy={isPending}
      data-testid="admin-payments-workspace-shell"
    >
      <div className="flex flex-col gap-3.5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2 sm:space-y-3">
          <PaymentsEyebrow>{workspaceLabel}</PaymentsEyebrow>
          <div className="space-y-1.5">
            <h1
              className="max-w-4xl text-xl font-bold tracking-tight text-balance sm:text-3xl"
              data-testid="admin-payments-workspace-title"
            >
              {title}
            </h1>
            <PaymentsSectionDescription className="max-w-2xl text-sm leading-5 sm:leading-6">
              {description}
            </PaymentsSectionDescription>
          </div>

          {activeItem ? (
            <PaymentsMutedPanel
              className="flex items-center gap-2 px-3 py-2.5 text-sm sm:flex-row sm:flex-wrap sm:gap-x-3 sm:gap-y-1"
              data-testid="admin-payments-workspace-active-summary"
            >
              <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary sm:px-3">
                {activeItem.label}
              </span>
              <p className="min-w-0 text-xs leading-5 text-muted-foreground sm:text-sm">
                {activeItem.description}
              </p>
            </PaymentsMutedPanel>
          ) : null}
        </div>

        {toolbar ? (
          <div className="w-full lg:max-w-[24rem] lg:flex-none" data-testid="admin-payments-workspace-toolbar">
            {toolbar}
          </div>
        ) : null}
      </div>

      <div className="mt-3 sm:mt-4">
        <div
          className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
          role="tablist"
          aria-label={workspaceLabel}
          data-testid="admin-payments-workspace-tablist"
        >
        {items.map((item) => {
          const isActive = item.id === activeItemId;

          return (
            <Button
              key={item.id}
              type="button"
              variant={isActive ? 'default' : 'outline'}
              disabled={isPending}
              onClick={() => handleSelect(item.id)}
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              className={cn(
                'h-auto shrink-0 rounded-full px-3 py-2 text-center text-sm font-medium shadow-none sm:px-4 sm:py-2.5 sm:text-left',
                isPending ? 'opacity-80' : '',
                isActive
                  ? 'border-primary/40 bg-primary/10 text-foreground hover:bg-primary/12'
                  : 'bg-background/80 text-muted-foreground hover:border-primary/30 hover:text-foreground hover:bg-card',
              )}
              data-testid={`admin-payments-workspace-tab-${item.id}`}
            >
              {item.label}
            </Button>
          );
        })}
        </div>
      </div>
    </PaymentsPanel>
  );
}
