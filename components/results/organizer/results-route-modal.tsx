'use client';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
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
      <DialogContent className={cn('p-0 sm:max-w-5xl', contentClassName)}>
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">{description}</DialogDescription>
        <div className="p-4 sm:p-6">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
