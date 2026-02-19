'use client';

import { useState } from 'react';
import { Lock, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';

type EventAiWizardDrawerProps = {
  triggerLabel: string;
  defaultOpen?: boolean;
  locked?: boolean;
  children: React.ReactNode;
};

export function EventAiWizardDrawer({
  triggerLabel,
  defaultOpen,
  locked,
  children,
}: EventAiWizardDrawerProps) {
  const [open, setOpen] = useState(Boolean(defaultOpen));

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="gap-2">
          {locked ? <Lock className="size-4" /> : <Sparkles className="size-4" />}
          <span className="truncate">{triggerLabel}</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[92vw] p-0 sm:max-w-md lg:max-w-lg">
        <div className="h-full overflow-y-auto p-4">{children}</div>
      </SheetContent>
    </Sheet>
  );
}

