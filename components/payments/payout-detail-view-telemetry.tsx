'use client';

import { useEffect } from 'react';

import { emitOrganizerPaymentsTelemetry } from '@/lib/payments/organizer/telemetry';

type PayoutDetailViewTelemetryProps = {
  organizationId: string;
  payoutRequestId: string;
};

export function PayoutDetailViewTelemetry({
  organizationId,
  payoutRequestId,
}: PayoutDetailViewTelemetryProps) {
  useEffect(() => {
    emitOrganizerPaymentsTelemetry({
      eventName: 'organizer_payout_detail_viewed',
      organizationId,
      payoutRequestId,
    });
  }, [organizationId, payoutRequestId]);

  return null;
}
