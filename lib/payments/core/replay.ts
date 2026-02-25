import { type CanonicalMoneyEventV1 } from '@/lib/payments/core/contracts/events';

export const replayModes = [
  'state_rebuild_default',
  'artifact_rebuild_explicit',
  'in_process',
] as const;

export type ReplayMode = (typeof replayModes)[number];

export const financialProcessorRuntimes = ['web', 'worker'] as const;

export type FinancialProcessorRuntime = (typeof financialProcessorRuntimes)[number];

type ReplayProjection = {
  walletNetMinor: number;
  economicsNetFeeMinor: number;
  eventCount: number;
};

export type ReplayResult = {
  mode: ReplayMode;
  projection: ReplayProjection;
  sideEffectsSuppressed: boolean;
  replayFingerprint: string;
};

export function assertInProcessReplayAllowed(nodeEnv: string, mode: ReplayMode): void {
  if (mode === 'in_process' && nodeEnv === 'production') {
    throw new Error('in_process replay mode is blocked in production.');
  }
}

export function assertFinancialProcessorRuntime(params: {
  nodeEnv: string;
  runtime: FinancialProcessorRuntime;
  processorName: string;
}): void {
  if (params.nodeEnv === 'production' && params.runtime !== 'worker') {
    throw new Error(
      `${params.processorName} must run on dedicated worker runtime in production (received: ${params.runtime}).`,
    );
  }
}

function normalizeReplayEvents(events: CanonicalMoneyEventV1[]): CanonicalMoneyEventV1[] {
  return [...events].sort((a, b) => {
    const occurredAtDiff = a.occurredAt.localeCompare(b.occurredAt);
    if (occurredAtDiff !== 0) return occurredAtDiff;
    return a.eventId.localeCompare(b.eventId);
  });
}

function eventWalletDeltaMinor(event: CanonicalMoneyEventV1): number {
  switch (event.eventName) {
    case 'payment.captured':
      return event.payload.netAmount.amountMinor;
    case 'refund.executed':
      return -event.payload.refundAmount.amountMinor;
    case 'dispute.opened':
      return -event.payload.amountAtRisk.amountMinor;
    case 'dispute.funds_released':
      return event.payload.amountReleased.amountMinor;
    case 'dispute.debt_posted':
      return -event.payload.debtAmount.amountMinor;
    case 'debt_control.pause_required':
    case 'debt_control.resume_allowed':
      return 0;
    case 'payout.requested':
      return -event.payload.requestedAmount.amountMinor;
    case 'payout.processing':
    case 'payout.paused':
    case 'payout.resumed':
      return 0;
    case 'payout.completed':
      return 0;
    case 'payout.failed':
      return event.payload.failedAmount.amountMinor;
    case 'payout.adjusted':
      return event.payload.previousRequestedAmount.amountMinor - event.payload.adjustedRequestedAmount.amountMinor;
    case 'financial.adjustment_posted':
      return event.payload.amount.amountMinor;
    case 'subscription.renewal_failed':
      return 0;
    default:
      return 0;
  }
}

function eventEconomicsDeltaMinor(event: CanonicalMoneyEventV1): number {
  switch (event.eventName) {
    case 'payment.captured':
      return event.payload.feeAmount.amountMinor;
    default:
      return 0;
  }
}

function buildReplayProjection(events: CanonicalMoneyEventV1[]): ReplayProjection {
  const projection = {
    walletNetMinor: 0,
    economicsNetFeeMinor: 0,
    eventCount: events.length,
  };

  for (const event of events) {
    projection.walletNetMinor += eventWalletDeltaMinor(event);
    projection.economicsNetFeeMinor += eventEconomicsDeltaMinor(event);
  }

  return projection;
}

export function replayCanonicalMoneyEvents(params: {
  events: CanonicalMoneyEventV1[];
  mode: ReplayMode;
  nodeEnv: string;
  runtime: FinancialProcessorRuntime;
}): ReplayResult {
  if (!replayModes.includes(params.mode)) {
    throw new Error(`Unsupported replay mode: ${String(params.mode)}`);
  }

  if (!financialProcessorRuntimes.includes(params.runtime)) {
    throw new Error(`Unsupported financial processor runtime: ${String(params.runtime)}`);
  }

  assertInProcessReplayAllowed(params.nodeEnv, params.mode);
  assertFinancialProcessorRuntime({
    nodeEnv: params.nodeEnv,
    runtime: params.runtime,
    processorName: 'payments_replay_processor',
  });

  const orderedEvents = normalizeReplayEvents(params.events);
  const projection = buildReplayProjection(orderedEvents);

  return {
    mode: params.mode,
    projection,
    sideEffectsSuppressed: params.mode !== 'artifact_rebuild_explicit',
    replayFingerprint: orderedEvents
      .map((event) => `${event.eventName}:v${event.version}:${event.eventId}`)
      .join('|'),
  };
}

export function acceptMoneyCommandOnWebRuntime(params: {
  traceId: string;
  commandName: string;
  nodeEnv: string;
}) {
  return {
    traceId: params.traceId,
    commandName: params.commandName,
    acceptedOnWebRuntime: true,
    appendsCanonicalEvents: true,
    enqueuesProcessorWork: true,
    execution: params.nodeEnv === 'production' ? 'enqueued_for_worker' : 'inline_or_worker',
  } as const;
}
