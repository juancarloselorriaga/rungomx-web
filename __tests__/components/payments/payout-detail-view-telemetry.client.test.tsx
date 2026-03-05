import { PayoutDetailViewTelemetry } from '@/components/payments/payout-detail-view-telemetry';
import { organizerPaymentsTelemetryStorageKey } from '@/lib/payments/organizer/telemetry';
import { render, waitFor } from '@testing-library/react';

describe('PayoutDetailViewTelemetry', () => {
  beforeEach(() => {
    delete (window as typeof window & { __RUNGO_PAYMENTS_SMOKE_TELEMETRY__?: unknown })
      .__RUNGO_PAYMENTS_SMOKE_TELEMETRY__;
    window.sessionStorage.removeItem(organizerPaymentsTelemetryStorageKey);
  });

  it('emits payout detail viewed telemetry on mount', async () => {
    render(
      <PayoutDetailViewTelemetry
        organizationId="org-telemetry"
        payoutRequestId="request-telemetry"
      />,
    );

    await waitFor(() => {
      expect(window.__RUNGO_PAYMENTS_SMOKE_TELEMETRY__).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            eventName: 'organizer_payout_detail_viewed',
            organizationId: 'org-telemetry',
            payoutRequestId: 'request-telemetry',
          }),
        ]),
      );
    });
  });
});
