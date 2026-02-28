'use client';

import { useEffect, useId, useState } from 'react';
import { Lock, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

export const EVENT_AI_WIZARD_OPEN_EVENT = 'event-ai-wizard:open';

type EventAiWizardDrawerProps = {
  triggerLabel: string;
  description: string;
  defaultOpen?: boolean;
  locked?: boolean;
  hideTrigger?: boolean;
  children: React.ReactNode;
};

export function EventAiWizardDrawer({
  triggerLabel,
  description,
  defaultOpen,
  locked,
  hideTrigger = false,
  children,
}: EventAiWizardDrawerProps) {
  // This prop is used as initial state only for first render/hydration.
  const [open, setOpen] = useState(() => Boolean(defaultOpen));
  const contentId = useId();

  useEffect(() => {
    const handleOpen = () => setOpen(true);
    window.addEventListener(EVENT_AI_WIZARD_OPEN_EVENT, handleOpen);
    return () => {
      window.removeEventListener(EVENT_AI_WIZARD_OPEN_EVENT, handleOpen);
    };
  }, []);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {!hideTrigger ? (
        <SheetTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-expanded={open}
            aria-controls={contentId}
            className="gap-2 shadow-sm"
          >
            {locked ? <Lock className="size-4" /> : <Sparkles className="size-4" />}
            <span className="truncate">{triggerLabel}</span>
          </Button>
        </SheetTrigger>
      ) : null}
      <SheetContent
        id={contentId}
        side="right"
        className="w-screen max-w-full overflow-hidden p-0 sm:max-w-lg lg:max-w-xl"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>{triggerLabel}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <div className="flex h-full min-h-0 flex-col bg-card">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
