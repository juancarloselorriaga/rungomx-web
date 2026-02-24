import fs from 'node:fs';
import path from 'node:path';

import {
  assertCanonicalMoneyEventRegistryCoverage,
  buildCanonicalMoneyEventRegistryIndex,
  buildCanonicalMoneyEventSchemaArtifacts,
  canonicalMoneyEventNames,
  canonicalMoneyEventRegistry,
  parseCanonicalMoneyEventWithUpcasting,
} from '@/lib/payments/core/contracts/events';

const canonicalEventFixtureByName = {
  'payment.captured': {
    eventId: '11111111-1111-4111-8111-111111111111',
    traceId: 'trace-payment-1',
    occurredAt: '2026-02-23T12:00:00.000Z',
    recordedAt: '2026-02-23T12:00:00.000Z',
    eventName: 'payment.captured',
    version: 1,
    entityType: 'registration',
    entityId: 'registration-1',
    source: 'api',
    idempotencyKey: 'idem-payment-1',
    metadata: { sourceSystem: 'tests' },
    payload: {
      organizerId: '22222222-2222-4222-8222-222222222222',
      registrationId: '33333333-3333-4333-8333-333333333333',
      orderId: '44444444-4444-4444-8444-444444444444',
      grossAmount: { amountMinor: 10000, currency: 'MXN' },
      feeAmount: { amountMinor: 800, currency: 'MXN' },
      netAmount: { amountMinor: 9200, currency: 'MXN' },
    },
  },
  'refund.executed': {
    eventId: '55555555-5555-4555-8555-555555555555',
    traceId: 'trace-refund-1',
    occurredAt: '2026-02-23T12:00:00.000Z',
    recordedAt: '2026-02-23T12:00:00.000Z',
    eventName: 'refund.executed',
    version: 1,
    entityType: 'refund',
    entityId: 'refund-1',
    source: 'worker',
    idempotencyKey: 'idem-refund-1',
    metadata: { sourceSystem: 'tests' },
    payload: {
      organizerId: '66666666-6666-4666-8666-666666666666',
      refundRequestId: '77777777-7777-4777-8777-777777777777',
      registrationId: '88888888-8888-4888-8888-888888888888',
      refundAmount: { amountMinor: 5000, currency: 'MXN' },
      refundableBalanceAfter: { amountMinor: 0, currency: 'MXN' },
      reasonCode: 'policy_eligible',
    },
  },
  'dispute.opened': {
    eventId: '99999999-9999-4999-8999-999999999999',
    traceId: 'trace-dispute-1',
    occurredAt: '2026-02-23T12:00:00.000Z',
    recordedAt: '2026-02-23T12:00:00.000Z',
    eventName: 'dispute.opened',
    version: 1,
    entityType: 'dispute',
    entityId: 'dispute-1',
    source: 'scheduler',
    idempotencyKey: 'idem-dispute-1',
    metadata: { sourceSystem: 'tests' },
    payload: {
      organizerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      registrationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      disputeCaseId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      amountAtRisk: { amountMinor: 7500, currency: 'MXN' },
      evidenceDeadlineAt: '2026-03-01T12:00:00.000Z',
    },
  },
  'dispute.funds_released': {
    eventId: '91919191-9191-4919-8919-919191919191',
    traceId: 'trace-dispute-settlement-1',
    occurredAt: '2026-02-23T15:00:00.000Z',
    recordedAt: '2026-02-23T15:00:00.000Z',
    eventName: 'dispute.funds_released',
    version: 1,
    entityType: 'dispute',
    entityId: 'dispute-1',
    source: 'worker',
    idempotencyKey: 'idem-dispute-release-1',
    metadata: { sourceSystem: 'tests' },
    payload: {
      organizerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      disputeCaseId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      registrationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      outcomeStatus: 'won',
      amountReleased: { amountMinor: 7500, currency: 'MXN' },
      freezeLadderProfile: 'full_at_risk_v1',
      freezeLadderStage: 'won_release_full_hold',
    },
  },
  'dispute.debt_posted': {
    eventId: '92929292-9292-4929-8929-929292929292',
    traceId: 'trace-dispute-settlement-2',
    occurredAt: '2026-02-23T16:00:00.000Z',
    recordedAt: '2026-02-23T16:00:00.000Z',
    eventName: 'dispute.debt_posted',
    version: 1,
    entityType: 'dispute',
    entityId: 'dispute-2',
    source: 'worker',
    idempotencyKey: 'idem-dispute-debt-1',
    metadata: { sourceSystem: 'tests' },
    payload: {
      organizerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      disputeCaseId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      orderId: 'edededed-eded-4ede-8ede-edededededed',
      outcomeStatus: 'lost',
      debtAmount: { amountMinor: 4200, currency: 'MXN' },
      debtCode: 'dispute_loss_at_risk',
      settlementComposition: 'single_debt_posting_v1',
      freezeLadderProfile: 'full_at_risk_v1',
      freezeLadderStage: 'lost_convert_full_hold_to_debt',
    },
  },
  'debt_control.pause_required': {
    eventId: '94949494-9494-4949-8949-949494949494',
    traceId: 'trace-debt-threshold-1',
    occurredAt: '2026-02-24T10:00:00.000Z',
    recordedAt: '2026-02-24T10:00:00.000Z',
    eventName: 'debt_control.pause_required',
    version: 1,
    entityType: 'debt_policy',
    entityId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    source: 'scheduler',
    idempotencyKey: 'idem-debt-threshold-pause-1',
    metadata: { sourceSystem: 'tests' },
    payload: {
      organizerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      policyCode: 'debt_threshold_v1',
      reasonCode: 'debt_threshold_pause_required',
      guidanceCode: 'reduce_debt_below_resume_threshold',
      debtAmount: { amountMinor: 125000, currency: 'MXN' },
      pauseThresholdAmount: { amountMinor: 50000, currency: 'MXN' },
      resumeThresholdAmount: { amountMinor: 25000, currency: 'MXN' },
      affectedEditionIds: [
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      ],
      affectedPaidEditionCount: 2,
      totalPaidEditionCount: 3,
    },
  },
  'debt_control.resume_allowed': {
    eventId: '95959595-9595-4959-8959-959595959595',
    traceId: 'trace-debt-threshold-2',
    occurredAt: '2026-02-25T10:00:00.000Z',
    recordedAt: '2026-02-25T10:00:00.000Z',
    eventName: 'debt_control.resume_allowed',
    version: 1,
    entityType: 'debt_policy',
    entityId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    source: 'scheduler',
    idempotencyKey: 'idem-debt-threshold-resume-1',
    metadata: { sourceSystem: 'tests' },
    payload: {
      organizerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      policyCode: 'debt_threshold_v1',
      reasonCode: 'debt_threshold_resume_allowed',
      guidanceCode: 'paid_registrations_resumed',
      debtAmount: { amountMinor: 15000, currency: 'MXN' },
      pauseThresholdAmount: { amountMinor: 50000, currency: 'MXN' },
      resumeThresholdAmount: { amountMinor: 25000, currency: 'MXN' },
      affectedEditionIds: ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'],
      affectedPaidEditionCount: 1,
      totalPaidEditionCount: 3,
    },
  },
  'payout.requested': {
    eventId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    traceId: 'trace-payout-1',
    occurredAt: '2026-02-23T12:00:00.000Z',
    recordedAt: '2026-02-23T12:00:00.000Z',
    eventName: 'payout.requested',
    version: 1,
    entityType: 'payout',
    entityId: 'payout-1',
    source: 'api',
    idempotencyKey: 'idem-payout-1',
    metadata: { sourceSystem: 'tests' },
    payload: {
      organizerId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      payoutRequestId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      payoutQuoteId: '12345678-1234-4234-8234-123456789012',
      requestedAmount: { amountMinor: 12000, currency: 'MXN' },
    },
  },
  'subscription.renewal_failed': {
    eventId: '23456789-2345-4234-8234-234567890123',
    traceId: 'trace-subscription-1',
    occurredAt: '2026-02-23T12:00:00.000Z',
    recordedAt: '2026-02-23T12:00:00.000Z',
    eventName: 'subscription.renewal_failed',
    version: 1,
    entityType: 'subscription',
    entityId: 'subscription-1',
    source: 'worker',
    idempotencyKey: 'idem-subscription-1',
    metadata: { sourceSystem: 'tests' },
    payload: {
      organizerId: '34567890-3456-4345-8345-345678901234',
      subscriptionId: '45678901-4567-4456-8456-456789012345',
      renewalAttempt: 1,
      graceEndsAt: '2026-03-23T12:00:00.000Z',
      reasonCode: 'card_declined',
    },
  },
  'financial.adjustment_posted': {
    eventId: '56789012-5678-4567-8567-567890123456',
    traceId: 'trace-adjustment-1',
    occurredAt: '2026-02-23T12:00:00.000Z',
    recordedAt: '2026-02-23T12:00:00.000Z',
    eventName: 'financial.adjustment_posted',
    version: 1,
    entityType: 'adjustment',
    entityId: 'adjustment-1',
    source: 'admin',
    idempotencyKey: 'idem-adjustment-1',
    metadata: { sourceSystem: 'tests' },
    payload: {
      organizerId: '67890123-6789-4678-8678-678901234567',
      adjustmentId: '78901234-7890-4789-8789-789012345678',
      adjustmentCode: 'manual_reconciliation',
      amount: { amountMinor: -300, currency: 'MXN' },
      reason: 'manual_reconciliation',
    },
  },
} as const;

describe('payments event contracts registry', () => {
  it('covers every canonical event exactly once', () => {
    expect(() => assertCanonicalMoneyEventRegistryCoverage()).not.toThrow();
    expect(canonicalMoneyEventRegistry).toHaveLength(canonicalMoneyEventNames.length);

    const index = buildCanonicalMoneyEventRegistryIndex();
    expect(index.events).toHaveLength(canonicalMoneyEventNames.length);
    expect(index.events.map((entry) => entry.eventName)).toEqual([...canonicalMoneyEventNames].sort());
  });

  it('keeps upcaster compatibility metadata aligned with supported versions', () => {
    for (const entry of canonicalMoneyEventRegistry) {
      expect(entry.upcasterVersions).toEqual([1]);
    }
  });

  it('parses canonical events through upcaster path for every event type', () => {
    for (const eventName of canonicalMoneyEventNames) {
      const parsed = parseCanonicalMoneyEventWithUpcasting(canonicalEventFixtureByName[eventName]);
      expect(parsed.eventName).toBe(eventName);
      expect(parsed.version).toBe(1);
    }
  });

  it('builds deterministic contract artifact payloads', () => {
    const first = buildCanonicalMoneyEventSchemaArtifacts();
    const second = buildCanonicalMoneyEventSchemaArtifacts();

    expect(first).toEqual(second);
    expect(first.schemas).toHaveLength(canonicalMoneyEventNames.length);
    expect(first.schemas.map((item) => item.fileName)).toEqual(
      [...first.schemas.map((item) => item.fileName)].sort(),
    );
  });

  it('matches committed registry index and schema snapshots', () => {
    const artifactDir = path.join(process.cwd(), 'docs/payments/contracts/event-registry');
    const expected = buildCanonicalMoneyEventSchemaArtifacts();

    const indexPath = path.join(artifactDir, 'index.json');
    expect(fs.existsSync(indexPath)).toBe(true);
    const committedIndex = JSON.parse(fs.readFileSync(indexPath, 'utf8')) as unknown;
    expect(committedIndex).toEqual(expected.index);

    for (const schemaArtifact of expected.schemas) {
      const schemaPath = path.join(artifactDir, schemaArtifact.fileName);
      expect(fs.existsSync(schemaPath)).toBe(true);
      const committedSchema = JSON.parse(fs.readFileSync(schemaPath, 'utf8')) as unknown;
      expect(committedSchema).toEqual(schemaArtifact.schema);
    }
  });

  it('rejects unsupported canonical event versions with deterministic error', () => {
    const unsupportedVersionEvent = {
      ...canonicalEventFixtureByName['payment.captured'],
      version: 2,
    };

    expect(() => parseCanonicalMoneyEventWithUpcasting(unsupportedVersionEvent)).toThrow(
      'Unsupported canonical money event version: payment.captured v2',
    );
  });
});
