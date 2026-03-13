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
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2.5 sm:space-y-3">
          <PaymentsEyebrow>{workspaceLabel}</PaymentsEyebrow>
          <div className="space-y-1.5">
            <h1
              className="text-xl font-bold tracking-tight sm:text-3xl"
              data-testid="admin-payments-workspace-title"
            >
              {title}
            </h1>
            <PaymentsSectionDescription>{description}</PaymentsSectionDescription>
          </div>

          {activeItem ? (
            <PaymentsMutedPanel className="flex flex-col gap-1.5 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-1">
              <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                {activeItem.label}
              </span>
              <p className="hidden min-w-0 text-xs text-muted-foreground sm:block sm:text-sm">
                {activeItem.description}
              </p>
            </PaymentsMutedPanel>
          ) : null}
        </div>

        {toolbar ? <div className="w-full lg:max-w-[24rem] lg:flex-none">{toolbar}</div> : null}
      </div>

      <div className="mt-3 sm:mt-4">
        <div className="grid grid-cols-2 gap-2 sm:flex sm:min-w-0 sm:flex-wrap">
        {items.map((item) => {
          const isActive = item.id === activeItemId;

          return (
            <Button
              key={item.id}
              type="button"
              variant={isActive ? 'default' : 'outline'}
              disabled={isPending}
              onClick={() => handleSelect(item.id)}
              aria-pressed={isActive}
              className={cn(
                'h-auto w-full rounded-full px-3 py-2 text-center text-sm font-medium shadow-none sm:w-auto sm:px-4 sm:py-2.5 sm:text-left',
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
