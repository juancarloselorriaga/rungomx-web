'use client';

import type { ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { MutedSurface, Surface } from '@/components/ui/surface';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

import { useAssistantWorkspaceQueryState } from './event-assistant-workspace-state';

type EventAssistantDesktopWorkspaceProps = {
  triggerLabel: string;
  triggerHint: string;
  workspaceTitle: string;
  workspaceDescription: string;
  children: ReactNode;
};

export function EventAssistantDesktopWorkspace({
  triggerLabel,
  triggerHint,
  workspaceTitle,
  workspaceDescription,
  children,
}: EventAssistantDesktopWorkspaceProps) {
  const { isOpen, setOpen } = useAssistantWorkspaceQueryState();

  return (
    <>
      <div className="hidden lg:block">
        <Surface className="w-full rounded-[28px] border-border/60 bg-[linear-gradient(180deg,color-mix(in_oklch,var(--background)_92%,var(--primary)_8%),var(--background))] p-6 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 flex-1 space-y-3">
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  {triggerLabel}
                </p>
                <p className="text-base font-semibold tracking-tight text-foreground">
                  {workspaceTitle}
                </p>
                <p className="max-w-3xl text-sm leading-6 text-foreground">{triggerHint}</p>
              </div>
              <MutedSurface className="max-w-3xl border-border/50 bg-background/70 px-4 py-3">
                <p className="text-sm leading-6 text-muted-foreground">{workspaceDescription}</p>
              </MutedSurface>
            </div>
            <Button
              type="button"
              size="lg"
              onClick={() => setOpen(true)}
              className={cn(
                'shrink-0 self-start rounded-2xl px-5 shadow-[0_10px_30px_rgba(15,23,42,0.12)]',
              )}
            >
              {triggerLabel}
              <ArrowUpRight className="ml-2 size-4" />
            </Button>
          </div>
        </Surface>
      </div>

      <Sheet open={isOpen} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="hidden h-full w-[min(820px,60vw)] max-w-none flex-col gap-0 overflow-hidden border-l border-border/60 bg-[linear-gradient(180deg,color-mix(in_oklch,var(--background)_94%,var(--primary)_6%),var(--background))] p-0 shadow-2xl sm:max-w-none lg:flex"
        >
          <SheetHeader className="border-b border-border/60 px-8 py-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              {triggerLabel}
            </p>
            <SheetTitle className="mt-2 text-xl font-semibold tracking-tight">
              {workspaceTitle}
            </SheetTitle>
            <SheetDescription className="mt-2 max-w-2xl leading-6 text-muted-foreground">
              {workspaceDescription}
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-8 py-7">{children}</div>
        </SheetContent>
      </Sheet>
    </>
  );
}
