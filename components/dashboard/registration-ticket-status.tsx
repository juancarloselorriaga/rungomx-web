'use client';

import { useState } from 'react';

import { Badge } from '@/components/common/badge';
import { DemoPayButton } from '@/components/dashboard/demo-pay-button';
import { PrintButton } from '@/components/dashboard/print-button';
import { Button } from '@/components/ui/button';
import type { MyRegistrationStatusKey } from '@/lib/events/my-registrations';

const statusVariants: Record<MyRegistrationStatusKey, 'green' | 'blue' | 'outline' | 'indigo'> = {
  confirmed: 'green',
  payment_pending: 'blue',
  cancelled: 'outline',
  started: 'indigo',
  submitted: 'indigo',
  expired: 'outline',
};

type RegistrationTicketStatusProps = {
  registrationId: string;
  initialStatus: MyRegistrationStatusKey;
  statusLabels: Record<MyRegistrationStatusKey, string>;
  ticketTitle: string;
  ticketCodeLabel: string;
  ticketCode: string;
  supportIdLabel: string;
  ticketNote: string;
  paymentPendingNote: string;
  demoPayNote: string;
  demoPaymentsEnabled: boolean;
  printLabel: string;
  payNowLabel: string;
};

export function RegistrationTicketStatus({
  registrationId,
  initialStatus,
  statusLabels,
  ticketTitle,
  ticketCodeLabel,
  ticketCode,
  supportIdLabel,
  ticketNote,
  paymentPendingNote,
  demoPayNote,
  demoPaymentsEnabled,
  printLabel,
  payNowLabel,
}: RegistrationTicketStatusProps) {
  const [status, setStatus] = useState<MyRegistrationStatusKey>(initialStatus);
  const isPaymentPending = status === 'payment_pending';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold">{ticketTitle}</h2>
        <Badge variant={statusVariants[status]}>{statusLabels[status]}</Badge>
      </div>
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">{ticketCodeLabel}</p>
        <p className="text-2xl font-bold tracking-widest">{ticketCode}</p>
        <p className="text-xs text-muted-foreground">
          {supportIdLabel}: {registrationId}
        </p>
      </div>
      <p className="text-sm text-muted-foreground">{ticketNote}</p>
      {isPaymentPending ? (
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{paymentPendingNote}</p>
          {demoPaymentsEnabled ? (
            <p className="text-xs text-muted-foreground">{demoPayNote}</p>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <PrintButton label={printLabel} />
        {isPaymentPending ? (
          demoPaymentsEnabled ? (
            <DemoPayButton
              registrationId={registrationId}
              onSuccess={(nextStatus) => {
                if (nextStatus === 'confirmed') {
                  setStatus('confirmed');
                }
              }}
            />
          ) : (
            <Button type="button" disabled>
              {payNowLabel}
            </Button>
          )
        ) : null}
      </div>
    </div>
  );
}
