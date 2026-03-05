import {
  emitOrganizerPaymentsTelemetry,
  organizerPaymentsTelemetryStorageKey,
} from '@/lib/payments/organizer/telemetry';

describe('organizer payments telemetry', () => {
  beforeEach(() => {
    delete (window as typeof window & { __RUNGO_PAYMENTS_SMOKE_TELEMETRY__?: unknown[] })
      .__RUNGO_PAYMENTS_SMOKE_TELEMETRY__;
    window.sessionStorage.removeItem(organizerPaymentsTelemetryStorageKey);
  });

  it('persists events to session storage and restores on next navigation context', () => {
    emitOrganizerPaymentsTelemetry({
      eventName: 'organizer_payments_workspace_viewed',
      organizationId: 'org-1',
    });

    delete (window as typeof window & { __RUNGO_PAYMENTS_SMOKE_TELEMETRY__?: unknown[] })
      .__RUNGO_PAYMENTS_SMOKE_TELEMETRY__;

    emitOrganizerPaymentsTelemetry({
      eventName: 'organizer_payout_detail_viewed',
      organizationId: 'org-1',
      payoutRequestId: 'payout-1',
    });

    const telemetry = window.__RUNGO_PAYMENTS_SMOKE_TELEMETRY__;
    expect(telemetry).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventName: 'organizer_payments_workspace_viewed' }),
        expect.objectContaining({ eventName: 'organizer_payout_detail_viewed' }),
      ]),
    );

    const persisted = JSON.parse(
      window.sessionStorage.getItem(organizerPaymentsTelemetryStorageKey) ?? '[]',
    ) as Array<{ eventName: string }>;

    expect(persisted).toHaveLength(2);
    expect(persisted.map((event) => event.eventName)).toEqual([
      'organizer_payments_workspace_viewed',
      'organizer_payout_detail_viewed',
    ]);
  });

  it('recovers when persisted telemetry cannot be parsed', () => {
    window.sessionStorage.setItem(organizerPaymentsTelemetryStorageKey, 'not-json');

    emitOrganizerPaymentsTelemetry({
      eventName: 'organizer_payout_statement_requested',
      organizationId: 'org-1',
      payoutRequestId: 'payout-1',
      isTerminal: true,
    });

    expect(window.__RUNGO_PAYMENTS_SMOKE_TELEMETRY__).toEqual([
      expect.objectContaining({ eventName: 'organizer_payout_statement_requested' }),
    ]);
  });
});
