'use client';

import type { ReactNode } from 'react';
import { ArrowUpRight, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
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
        <div className="w-full rounded-2xl border border-border/70 bg-card/80 p-5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/70">
          <div className="flex items-start justify-between gap-5">
            <span className="mt-0.5 flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Sparkles className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">{workspaceTitle}</p>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{triggerHint}</p>
            </div>
            <Button
              type="button"
              size="lg"
              onClick={() => setOpen(true)}
              className={cn('shrink-0 px-5')}
            >
              {triggerLabel}
              <ArrowUpRight className="ml-2 size-4" />
            </Button>
          </div>
        </div>
      </div>

      <Sheet open={isOpen} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="hidden h-full w-[min(1120px,78vw)] max-w-none sm:max-w-none flex-col gap-0 overflow-hidden border-l border-border/70 bg-background/98 p-0 shadow-2xl lg:flex"
        >
          <SheetHeader className="border-b border-border/60 px-8 py-5">
            <SheetTitle className="text-xl">{workspaceTitle}</SheetTitle>
            <SheetDescription className="max-w-2xl leading-6">
              {workspaceDescription}
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
            {children}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
