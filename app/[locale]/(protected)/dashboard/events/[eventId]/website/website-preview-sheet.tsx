'use client';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Eye } from 'lucide-react';
import { useState, type ReactNode } from 'react';

type WebsitePreviewSheetProps = {
  triggerLabel: string;
  title: string;
  description: string;
  children: ReactNode;
};

export function WebsitePreviewSheet({
  triggerLabel,
  title,
  description,
  children,
}: WebsitePreviewSheetProps) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Eye className="h-4 w-4" />
          {triggerLabel}
        </Button>
      </SheetTrigger>

      <SheetContent
        side="right"
        className="gap-0 p-0 w-full sm:max-w-xl lg:max-w-2xl xl:max-w-3xl"
      >
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}

