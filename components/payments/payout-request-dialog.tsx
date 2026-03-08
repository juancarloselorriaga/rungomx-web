'use client';

import { PayoutRequestForm } from '@/components/payments/payout-request-form';
import { Button } from '@/components/ui/button';
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
};

export function PayoutRequestDialog({
  organizationId,
  triggerLabel,
  triggerVariant = 'default',
  triggerTestId,
}: PayoutRequestDialogProps) {
  const t = useTranslations('pages.dashboardPayments');

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant={triggerVariant} data-testid={triggerTestId} className="whitespace-nowrap">
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('request.title')}</DialogTitle>
          <DialogDescription>{t('request.description')}</DialogDescription>
        </DialogHeader>
        <PayoutRequestForm organizationId={organizationId} presentation="dialog" />
      </DialogContent>
    </Dialog>
  );
}
