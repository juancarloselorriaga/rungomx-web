export const organizerPaymentsTelemetryEventNames = [
  'organizer_payments_workspace_viewed',
  'organizer_payout_request_submitted',
  'organizer_payout_queue_intent_submitted',
  'organizer_payout_detail_viewed',
  'organizer_payout_statement_requested',
] as const;

export const organizerPaymentsTelemetryStorageKey = 'rungomx.organizer-payments.telemetry';

export type OrganizerPaymentsTelemetryEventName =
  (typeof organizerPaymentsTelemetryEventNames)[number];

export type OrganizerPaymentsTelemetryEvent = {
  eventName: OrganizerPaymentsTelemetryEventName;
  organizationId: string;
  payoutRequestId?: string;
  payoutQueuedIntentId?: string;
  requestedAmountMinor?: number;
  isTerminal?: boolean;
  occurredAt: string;
};

declare global {
  interface Window {
    __RUNGO_PAYMENTS_SMOKE_TELEMETRY__?: OrganizerPaymentsTelemetryEvent[];
  }
}

function loadPersistedTelemetry(): OrganizerPaymentsTelemetryEvent[] {
  try {
    const persisted = window.sessionStorage.getItem(organizerPaymentsTelemetryStorageKey);
    if (!persisted) return [];
    const parsed = JSON.parse(persisted);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistTelemetry(events: OrganizerPaymentsTelemetryEvent[]) {
  try {
    window.sessionStorage.setItem(
      organizerPaymentsTelemetryStorageKey,
      JSON.stringify(events),
    );
  } catch {
    // Ignore session storage errors to avoid impacting user flows.
  }
}

export function emitOrganizerPaymentsTelemetry(
  payload: Omit<OrganizerPaymentsTelemetryEvent, 'occurredAt'>,
) {
  if (typeof window === 'undefined') return;

  const eventPayload: OrganizerPaymentsTelemetryEvent = {
    ...payload,
    occurredAt: new Date().toISOString(),
  };

  let telemetryBuffer = window.__RUNGO_PAYMENTS_SMOKE_TELEMETRY__;
  if (!Array.isArray(telemetryBuffer)) {
    telemetryBuffer = loadPersistedTelemetry();
    window.__RUNGO_PAYMENTS_SMOKE_TELEMETRY__ = telemetryBuffer;
  }

  telemetryBuffer.push(eventPayload);
  persistTelemetry(telemetryBuffer);

  window.dispatchEvent(
    new CustomEvent<OrganizerPaymentsTelemetryEvent>(
      'rungomx:organizer-payments-telemetry',
      { detail: eventPayload },
    ),
  );
}
