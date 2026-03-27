'use client';

import type { ReactNode } from 'react';
import { Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

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
        <div className="w-full">
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(true)}
            className={cn(
              'h-auto w-full justify-start gap-3 rounded-xl border border-border/70 bg-card/90 px-4 py-3 text-left text-foreground shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/80',
            )}
            aria-label={triggerLabel}
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Sparkles className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{triggerLabel}</span>
              <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                {triggerHint}
              </span>
            </span>
          </Button>
        </div>
      </div>

      <Sheet open={isOpen} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="flex h-[88dvh] max-h-[88dvh] flex-col gap-0 overflow-hidden rounded-t-3xl p-0 lg:hidden"
        >
          <div className="mx-auto mt-3 h-1.5 w-10 rounded-full bg-muted" />
          <SheetHeader className="sr-only">
            <SheetTitle>{triggerLabel}</SheetTitle>
            <SheetDescription>{triggerHint}</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-4">
            {children}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
