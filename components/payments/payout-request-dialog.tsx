'use client';

import { PayoutRequestForm } from '@/components/payments/payout-request-form';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useTranslations } from 'next-intl';

type PayoutRequestDialogProps = {
  organizationId: string;
  triggerLabel: string;
  triggerVariant?: 'default' | 'outline';
  triggerTestId?: string;
  eventId?: string;
  triggerClassName?: string;
};

export function PayoutRequestDialog({
  organizationId,
  triggerLabel,
  triggerVariant = 'default',
  triggerTestId,
  eventId,
  triggerClassName,
}: PayoutRequestDialogProps) {
  const t = useTranslations('pages.dashboardPayments');

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant={triggerVariant}
          data-testid={triggerTestId}
          className={cn('whitespace-nowrap rounded-xl', triggerClassName)}
        >
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[min(92vh,48rem)] overflow-hidden rounded-2xl border border-border/80 bg-background/98 p-0 shadow-2xl sm:max-w-[40rem]">
        <DialogHeader className="border-b border-border/70 bg-muted/20 px-4 py-4 sm:px-6">
          <DialogTitle className="text-xl font-semibold tracking-tight">
            {t('request.title')}
          </DialogTitle>
          <DialogDescription className="max-w-2xl text-sm leading-6">
            {t('request.description')}
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
          <PayoutRequestForm
            organizationId={organizationId}
            presentation="dialog"
            eventId={eventId}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
