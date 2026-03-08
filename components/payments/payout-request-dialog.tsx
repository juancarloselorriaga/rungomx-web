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
          className={cn('whitespace-nowrap', triggerClassName)}
        >
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('request.title')}</DialogTitle>
          <DialogDescription>{t('request.description')}</DialogDescription>
        </DialogHeader>
        <PayoutRequestForm
          organizationId={organizationId}
          presentation="dialog"
          eventId={eventId}
        />
      </DialogContent>
    </Dialog>
  );
}
