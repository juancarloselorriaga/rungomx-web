'use client';

import type { ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

import { useAssistantWorkspaceQueryState } from './event-assistant-workspace-state';

type EventAssistantMobileWorkspaceProps = {
  triggerLabel: string;
  triggerHint: string;
  children: ReactNode;
};

export function EventAssistantMobileWorkspace({
  triggerLabel,
  triggerHint,
  children,
}: EventAssistantMobileWorkspaceProps) {
  const { isOpen, setOpen } = useAssistantWorkspaceQueryState();

  return (
    <>
      <div className="sticky top-3 z-30 pb-2 lg:hidden">
        <div className="w-full rounded-[24px] bg-background/80 backdrop-blur-sm">
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(true)}
            className="h-auto w-full justify-start rounded-[24px] border border-border/60 bg-[linear-gradient(180deg,color-mix(in_oklch,var(--background)_94%,var(--primary)_6%),var(--background))] px-4 py-3.5 text-left text-foreground shadow-[0_14px_36px_rgba(15,23,42,0.08)]"
            aria-label={triggerLabel}
          >
            <span className="min-w-0 flex-1 pr-3">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {triggerLabel}
              </span>
              <span className="mt-1.5 block text-sm font-medium text-foreground">
                {triggerHint}
              </span>
            </span>
            <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-border/50 bg-background/80 text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
              <ArrowUpRight className="size-4" />
            </span>
          </Button>
        </div>
      </div>

      <Sheet open={isOpen} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="flex h-[88dvh] max-h-[88dvh] flex-col gap-0 overflow-hidden rounded-t-[28px] border-x border-t border-border/60 bg-[linear-gradient(180deg,color-mix(in_oklch,var(--background)_95%,var(--primary)_5%),var(--background))] p-0 lg:hidden"
        >
          <div className="mx-auto mt-3 h-1.5 w-10 rounded-full bg-muted" />
          <SheetHeader className="border-b border-border/60 px-4 pb-4 pt-3 text-left">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {triggerLabel}
            </p>
            <SheetTitle className="mt-2 text-lg font-semibold tracking-tight text-foreground">
              {triggerHint}
            </SheetTitle>
            <SheetDescription className="mt-1 text-sm leading-6 text-muted-foreground">
              {triggerLabel}
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-4">
            {children}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
