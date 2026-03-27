'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { InsetSurface } from '@/components/ui/surface';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import * as React from 'react';

type Router = ReturnType<typeof useRouter>;
type RouterPushHref = Parameters<Router['push']>[0];

type ResultsRouteModalProps = {
  title: string;
  description: string;
  returnHref: RouterPushHref;
  children: React.ReactNode;
  contentClassName?: string;
};

export function ResultsRouteModal({
  title,
  description,
  returnHref,
  children,
  contentClassName,
}: ResultsRouteModalProps) {
  const router = useRouter();

  return (
    <Dialog
      defaultOpen
      onOpenChange={(open) => {
        if (open) return;
        router.push(returnHref);
      }}
    >
      <DialogContent
        className={cn(
          'max-h-[min(94vh,64rem)] overflow-hidden rounded-2xl border border-border/80 bg-background/98 p-0 shadow-2xl sm:max-w-5xl',
          contentClassName,
        )}
      >
        <DialogHeader className="border-b border-border/70 bg-muted/20 px-4 py-4 text-left sm:px-6">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <InsetSurface className="m-3 max-h-[calc(94vh-7rem)] overflow-y-auto border-border/50 bg-background/70 p-4 sm:m-4 sm:p-6">
          {children}
        </InsetSurface>
      </DialogContent>
    </Dialog>
  );
}
