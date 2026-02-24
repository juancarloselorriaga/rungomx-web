import {
  acceptMoneyCommandOnWebRuntime,
  assertFinancialProcessorRuntime,
  replayCanonicalMoneyEvents,
} from '@/lib/payments/core/replay';

const paymentCapturedEvent = {
  eventId: '11111111-1111-4111-8111-111111111111',
  traceId: 'trace-replay-1',
  occurredAt: '2026-02-23T12:00:00.000Z',
  recordedAt: '2026-02-23T12:00:00.000Z',
  eventName: 'payment.captured',
  version: 1,
  entityType: 'registration',
  entityId: 'registration-1',
  source: 'api',
  idempotencyKey: 'idem-1',
  metadata: {},
  payload: {
    organizerId: '22222222-2222-4222-8222-222222222222',
    registrationId: '33333333-3333-4333-8333-333333333333',
    orderId: '44444444-4444-4444-8444-444444444444',
    grossAmount: { amountMinor: 10000, currency: 'MXN' },
    feeAmount: { amountMinor: 500, currency: 'MXN' },
    netAmount: { amountMinor: 9500, currency: 'MXN' },
  },
} as const;

const refundExecutedEvent = {
  eventId: '55555555-5555-4555-8555-555555555555',
  traceId: 'trace-replay-1',
  occurredAt: '2026-02-23T12:10:00.000Z',
  recordedAt: '2026-02-23T12:10:00.000Z',
  eventName: 'refund.executed',
  version: 1,
  entityType: 'refund',
  entityId: 'refund-1',
  source: 'worker',
  idempotencyKey: 'idem-2',
  metadata: {},
  payload: {
    organizerId: '22222222-2222-4222-8222-222222222222',
    refundRequestId: '66666666-6666-4666-8666-666666666666',
    registrationId: '33333333-3333-4333-8333-333333333333',
    refundAmount: { amountMinor: 1000, currency: 'MXN' },
    refundableBalanceAfter: { amountMinor: 0, currency: 'MXN' },
    reasonCode: 'policy_eligible',
  },
} as const;

const adjustmentPostedEvent = {
  eventId: '77777777-7777-4777-8777-777777777777',
  traceId: 'trace-replay-1',
  occurredAt: '2026-02-23T12:20:00.000Z',
  recordedAt: '2026-02-23T12:20:00.000Z',
  eventName: 'financial.adjustment_posted',
  version: 1,
  entityType: 'adjustment',
  entityId: 'adjustment-1',
  source: 'admin',
  idempotencyKey: 'idem-3',
  metadata: {},
  payload: {
    organizerId: '22222222-2222-4222-8222-222222222222',
    adjustmentId: '88888888-8888-4888-8888-888888888888',
    adjustmentCode: 'manual_reconciliation',
    amount: { amountMinor: -300, currency: 'MXN' },
    reason: 'manual_reconciliation',
  },
} as const;

const disputeOpenedEvent = {
  eventId: '89999999-9999-4999-8999-999999999999',
  traceId: 'trace-replay-dispute-1',
  occurredAt: '2026-02-23T12:30:00.000Z',
  recordedAt: '2026-02-23T12:30:00.000Z',
  eventName: 'dispute.opened',
  version: 1,
  entityType: 'dispute',
  entityId: 'dispute-1',
  source: 'api',
  idempotencyKey: 'idem-dispute-opened-1',
  metadata: {},
  payload: {
    organizerId: '22222222-2222-4222-8222-222222222222',
    disputeCaseId: '99999999-9999-4999-8999-999999999999',
    registrationId: '33333333-3333-4333-8333-333333333333',
    amountAtRisk: { amountMinor: 2000, currency: 'MXN' },
    evidenceDeadlineAt: '2026-02-26T12:30:00.000Z',
  },
} as const;

const disputeFundsReleasedEvent = {
  eventId: '81111111-1111-4111-8111-111111111111',
  traceId: 'trace-replay-dispute-1',
  occurredAt: '2026-02-23T13:00:00.000Z',
  recordedAt: '2026-02-23T13:00:00.000Z',
  eventName: 'dispute.funds_released',
  version: 1,
  entityType: 'dispute',
  entityId: 'dispute-1',
  source: 'worker',
  idempotencyKey: 'idem-dispute-release-1',
  metadata: {},
  payload: {
    organizerId: '22222222-2222-4222-8222-222222222222',
    disputeCaseId: '99999999-9999-4999-8999-999999999999',
    registrationId: '33333333-3333-4333-8333-333333333333',
    outcomeStatus: 'won',
    amountReleased: { amountMinor: 2000, currency: 'MXN' },
    freezeLadderProfile: 'full_at_risk_v1',
    freezeLadderStage: 'won_release_full_hold',
  },
} as const;

const disputeFundsReleasedOnLossEvent = {
  ...disputeFundsReleasedEvent,
  eventId: '83333333-3333-4333-8333-333333333333',
  traceId: 'trace-replay-dispute-2',
  idempotencyKey: 'idem-dispute-release-2',
  payload: {
    ...disputeFundsReleasedEvent.payload,
    outcomeStatus: 'lost',
    freezeLadderStage: 'lost_convert_full_hold_to_debt',
  },
} as const;

const disputeDebtPostedEvent = {
  eventId: '82222222-2222-4222-8222-222222222222',
  traceId: 'trace-replay-dispute-2',
  occurredAt: '2026-02-23T13:10:00.000Z',
  recordedAt: '2026-02-23T13:10:00.000Z',
  eventName: 'dispute.debt_posted',
  version: 1,
  entityType: 'dispute',
  entityId: 'dispute-2',
  source: 'worker',
  idempotencyKey: 'idem-dispute-debt-1',
  metadata: {},
  payload: {
    organizerId: '22222222-2222-4222-8222-222222222222',
    disputeCaseId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    orderId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    outcomeStatus: 'lost',
    debtAmount: { amountMinor: 2000, currency: 'MXN' },
    debtCode: 'dispute_loss_at_risk',
    settlementComposition: 'single_debt_posting_v1',
    freezeLadderProfile: 'full_at_risk_v1',
    freezeLadderStage: 'lost_convert_full_hold_to_debt',
  },
} as const;

describe('payments replay model', () => {
  it('rebuilds deterministic projection results for identical inputs in different order', () => {
    const forward = replayCanonicalMoneyEvents({
      events: [paymentCapturedEvent, refundExecutedEvent, adjustmentPostedEvent],
      mode: 'state_rebuild_default',
      nodeEnv: 'test',
      runtime: 'worker',
    });

    const reversed = replayCanonicalMoneyEvents({
      events: [adjustmentPostedEvent, refundExecutedEvent, paymentCapturedEvent],
      mode: 'state_rebuild_default',
      nodeEnv: 'test',
      runtime: 'worker',
    });

    expect(forward.projection).toEqual(reversed.projection);
    expect(forward.replayFingerprint).toEqual(reversed.replayFingerprint);
    expect(forward.projection.walletNetMinor).toBe(8200);
    expect(forward.projection.economicsNetFeeMinor).toBe(500);
  });

  it('suppresses side effects in default rebuild mode and enables them only in artifact mode', () => {
    const defaultMode = replayCanonicalMoneyEvents({
      events: [paymentCapturedEvent],
      mode: 'state_rebuild_default',
      nodeEnv: 'test',
      runtime: 'worker',
    });

    const artifactMode = replayCanonicalMoneyEvents({
      events: [paymentCapturedEvent],
      mode: 'artifact_rebuild_explicit',
      nodeEnv: 'test',
      runtime: 'worker',
    });

    expect(defaultMode.sideEffectsSuppressed).toBe(true);
    expect(artifactMode.sideEffectsSuppressed).toBe(false);
  });

  it('applies dispute outcome settlement events deterministically for win and loss paths', () => {
    const wonOutcome = replayCanonicalMoneyEvents({
      events: [disputeOpenedEvent, disputeFundsReleasedEvent],
      mode: 'state_rebuild_default',
      nodeEnv: 'test',
      runtime: 'worker',
    });

    const lostOutcome = replayCanonicalMoneyEvents({
      events: [disputeOpenedEvent, disputeFundsReleasedOnLossEvent, disputeDebtPostedEvent],
      mode: 'state_rebuild_default',
      nodeEnv: 'test',
      runtime: 'worker',
    });

    expect(wonOutcome.projection.walletNetMinor).toBe(0);
    expect(lostOutcome.projection.walletNetMinor).toBe(-2000);
  });

  it('blocks in_process mode in production and allows it in local/test', () => {
    expect(() =>
      replayCanonicalMoneyEvents({
        events: [paymentCapturedEvent],
        mode: 'in_process',
        nodeEnv: 'production',
        runtime: 'worker',
      }),
    ).toThrow('in_process replay mode is blocked in production.');

    expect(() =>
      replayCanonicalMoneyEvents({
        events: [paymentCapturedEvent],
        mode: 'in_process',
        nodeEnv: 'test',
        runtime: 'worker',
      }),
    ).not.toThrow();
  });

  it('rejects production replay execution on web runtime', () => {
    expect(() =>
      replayCanonicalMoneyEvents({
        events: [paymentCapturedEvent],
        mode: 'state_rebuild_default',
        nodeEnv: 'production',
        runtime: 'web',
      }),
    ).toThrow(
      'payments_replay_processor must run on dedicated worker runtime in production (received: web).',
    );
  });

  it('rejects unsupported replay mode values', () => {
    expect(() =>
      replayCanonicalMoneyEvents({
        events: [paymentCapturedEvent],
        mode: 'unexpected_mode' as never,
        nodeEnv: 'test',
        runtime: 'worker',
      }),
    ).toThrow('Unsupported replay mode: unexpected_mode');
  });

  it('enforces production worker runtime for processors', () => {
    expect(() =>
      assertFinancialProcessorRuntime({
        nodeEnv: 'production',
        runtime: 'web',
        processorName: 'payout_processor',
      }),
    ).toThrow('payout_processor must run on dedicated worker runtime in production (received: web).');

    expect(() =>
      assertFinancialProcessorRuntime({
        nodeEnv: 'production',
        runtime: 'worker',
        processorName: 'payout_processor',
      }),
    ).not.toThrow();
  });

  it('keeps web runtime command handling enqueue-only in production', () => {
    const productionCommand = acceptMoneyCommandOnWebRuntime({
      traceId: 'trace-replay-1',
      commandName: 'execute_refund',
      nodeEnv: 'production',
    });

    const localCommand = acceptMoneyCommandOnWebRuntime({
      traceId: 'trace-replay-1',
      commandName: 'execute_refund',
      nodeEnv: 'test',
    });

    expect(productionCommand.execution).toBe('enqueued_for_worker');
    expect(localCommand.execution).toBe('inline_or_worker');
    expect(productionCommand.appendsCanonicalEvents).toBe(true);
    expect(productionCommand.enqueuesProcessorWork).toBe(true);
  });
});
