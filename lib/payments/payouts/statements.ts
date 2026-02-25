import { createHash } from 'node:crypto';

import { and, asc, eq, inArray, isNull } from 'drizzle-orm';

import { db } from '@/db';
import { moneyEvents, payoutContracts, payoutQuotes, payoutRequests } from '@/db/schema';

const payoutStatementTerminalStatuses = ['completed', 'failed'] as const;
type PayoutStatementTerminalStatus = (typeof payoutStatementTerminalStatuses)[number];

const payoutStatementRelevantEventNames = [
  'payout.adjusted',
  'payout.completed',
  'payout.failed',
] as const;

export const payoutStatementErrorCodes = [
  'PAYOUT_STATEMENT_REQUEST_ID_REQUIRED',
  'PAYOUT_STATEMENT_NOT_FOUND',
  'PAYOUT_STATEMENT_STATUS_NOT_TERMINAL',
  'PAYOUT_STATEMENT_BASELINE_INCOMPLETE',
] as const;

export type PayoutStatementErrorCode = (typeof payoutStatementErrorCodes)[number];

export class PayoutStatementError extends Error {
  public readonly code: PayoutStatementErrorCode;

  constructor(code: PayoutStatementErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export type PayoutStatementAdjustmentLine = {
  eventId: string;
  traceId: string;
  occurredAt: Date;
  reasonCode: string;
  previousRequestedAmountMinor: number;
  adjustedRequestedAmountMinor: number;
  deltaMinor: number;
};

export type PayoutStatementArtifact = {
  payoutStatementId: string;
  organizerId: string;
  payoutRequestId: string;
  payoutQuoteId: string;
  payoutContractId: string;
  payoutStatus: PayoutStatementTerminalStatus;
  traceId: string;
  statementFingerprint: string;
  quoteReference: {
    payoutQuoteId: string;
    quoteFingerprint: string;
    requestedAt: Date;
    includedAmountMinor: number;
    deductionAmountMinor: number;
    maxWithdrawableAmountMinor: number;
    requestedAmountMinor: number;
  };
  componentBreakdown: Record<string, unknown>;
  adjustmentLines: PayoutStatementAdjustmentLine[];
  originalRequestedAmountMinor: number;
  currentRequestedAmountMinor: number;
  terminalAmountMinor: number;
  adjustmentTotalMinor: number;
  accessReference: {
    kind: 'organizer_statement';
    traceId: string;
    href: string;
  };
  deliveryReference: {
    channel: 'api_pull';
    referenceId: string;
    traceId: string;
  };
  generatedAt: Date;
};

function toError(code: PayoutStatementErrorCode, detail?: string): PayoutStatementError {
  switch (code) {
    case 'PAYOUT_STATEMENT_REQUEST_ID_REQUIRED':
      return new PayoutStatementError(code, 'Payout statement lookup requires a payout request id.');
    case 'PAYOUT_STATEMENT_NOT_FOUND':
      return new PayoutStatementError(code, 'Payout request was not found for statement generation.');
    case 'PAYOUT_STATEMENT_STATUS_NOT_TERMINAL':
      return new PayoutStatementError(
        code,
        detail ??
          'Payout statement generation requires payout lifecycle in completed or failed status.',
      );
    case 'PAYOUT_STATEMENT_BASELINE_INCOMPLETE':
      return new PayoutStatementError(
        code,
        detail ??
          'Payout statement generation requires quote and contract baseline artifacts for the payout request.',
      );
    default:
      return new PayoutStatementError(code, 'Payout statement generation failed.');
  }
}

function deterministicHash(seed: string): string {
  return createHash('sha256').update(seed).digest('hex');
}

function deterministicUuid(seed: string): string {
  const hash = createHash('sha256').update(seed).digest();
  const bytes = Uint8Array.from(hash.subarray(0, 16));

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Buffer.from(bytes).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function readPositiveInteger(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || !Number.isFinite(value)) return null;
  if (value <= 0) return null;
  return value;
}

function readNestedAmountMinor(payload: Record<string, unknown>, key: string): number {
  const candidate = payload[key];
  if (!candidate || typeof candidate !== 'object') return 0;
  const amountMinor = (candidate as Record<string, unknown>).amountMinor;
  const amount = readPositiveInteger(amountMinor);
  return amount ?? 0;
}

function readString(payload: Record<string, unknown>, key: string): string {
  const candidate = payload[key];
  return typeof candidate === 'string' ? candidate.trim() : '';
}

function buildAccessHref(params: { organizerId: string; payoutRequestId: string }): string {
  return `/api/payments/payouts/${encodeURIComponent(params.payoutRequestId)}/statement?organizationId=${encodeURIComponent(params.organizerId)}`;
}

function normalizeTerminalStatus(value: string): PayoutStatementTerminalStatus | null {
  return (payoutStatementTerminalStatuses as readonly string[]).includes(value)
    ? (value as PayoutStatementTerminalStatus)
    : null;
}

export async function generatePayoutStatementArtifact(params: {
  organizerId: string;
  payoutRequestId: string;
  now?: Date;
}): Promise<PayoutStatementArtifact> {
  const payoutRequestId = params.payoutRequestId.trim();
  if (!payoutRequestId) {
    throw toError('PAYOUT_STATEMENT_REQUEST_ID_REQUIRED');
  }

  const now = params.now ?? new Date();

  const payoutRequest = await db.query.payoutRequests.findFirst({
    where: and(
      eq(payoutRequests.id, payoutRequestId),
      eq(payoutRequests.organizerId, params.organizerId),
      isNull(payoutRequests.deletedAt),
    ),
    columns: {
      id: true,
      organizerId: true,
      payoutQuoteId: true,
      status: true,
      traceId: true,
      lifecycleContextJson: true,
    },
  });

  if (!payoutRequest) {
    throw toError('PAYOUT_STATEMENT_NOT_FOUND');
  }

  const terminalStatus = normalizeTerminalStatus(payoutRequest.status);
  if (!terminalStatus) {
    throw toError(
      'PAYOUT_STATEMENT_STATUS_NOT_TERMINAL',
      `Payout statement generation requires terminal status, received=${payoutRequest.status}.`,
    );
  }

  const [payoutQuote, payoutContract] = await Promise.all([
    db.query.payoutQuotes.findFirst({
      where: and(
        eq(payoutQuotes.id, payoutRequest.payoutQuoteId),
        eq(payoutQuotes.organizerId, payoutRequest.organizerId),
        isNull(payoutQuotes.deletedAt),
      ),
      columns: {
        id: true,
        quoteFingerprint: true,
        requestedAt: true,
        includedAmountMinor: true,
        deductionAmountMinor: true,
        maxWithdrawableAmountMinor: true,
        requestedAmountMinor: true,
        componentBreakdownJson: true,
      },
    }),
    db.query.payoutContracts.findFirst({
      where: and(
        eq(payoutContracts.payoutRequestId, payoutRequest.id),
        eq(payoutContracts.payoutQuoteId, payoutRequest.payoutQuoteId),
        eq(payoutContracts.organizerId, payoutRequest.organizerId),
        isNull(payoutContracts.deletedAt),
      ),
      columns: {
        id: true,
      },
    }),
  ]);

  if (!payoutQuote || !payoutContract) {
    throw toError('PAYOUT_STATEMENT_BASELINE_INCOMPLETE');
  }

  const terminalAndAdjustmentEvents = await db
    .select({
      id: moneyEvents.id,
      traceId: moneyEvents.traceId,
      eventName: moneyEvents.eventName,
      occurredAt: moneyEvents.occurredAt,
      payloadJson: moneyEvents.payloadJson,
    })
    .from(moneyEvents)
    .where(
      and(
        eq(moneyEvents.organizerId, payoutRequest.organizerId),
        eq(moneyEvents.entityType, 'payout'),
        eq(moneyEvents.entityId, payoutRequest.id),
        inArray(moneyEvents.eventName, payoutStatementRelevantEventNames),
      ),
    )
    .orderBy(asc(moneyEvents.occurredAt), asc(moneyEvents.createdAt), asc(moneyEvents.id));

  const adjustmentLines: PayoutStatementAdjustmentLine[] = [];
  let terminalAmountFromEvent: number | null = null;

  for (const event of terminalAndAdjustmentEvents) {
    const payload = toRecord(event.payloadJson);

    if (event.eventName === 'payout.adjusted') {
      const previousRequestedAmountMinor = readNestedAmountMinor(payload, 'previousRequestedAmount');
      const adjustedRequestedAmountMinor = readNestedAmountMinor(payload, 'adjustedRequestedAmount');
      const deltaMinor = Math.max(previousRequestedAmountMinor - adjustedRequestedAmountMinor, 0);

      if (previousRequestedAmountMinor > 0 && adjustedRequestedAmountMinor > 0) {
        adjustmentLines.push({
          eventId: event.id,
          traceId: event.traceId,
          occurredAt: event.occurredAt,
          reasonCode: readString(payload, 'reasonCode') || 'unspecified_adjustment_reason',
          previousRequestedAmountMinor,
          adjustedRequestedAmountMinor,
          deltaMinor,
        });
      }

      continue;
    }

    if (terminalStatus === 'completed' && event.eventName === 'payout.completed') {
      const settledAmountMinor = readNestedAmountMinor(payload, 'settledAmount');
      if (settledAmountMinor > 0) {
        terminalAmountFromEvent = settledAmountMinor;
      }
    }

    if (terminalStatus === 'failed' && event.eventName === 'payout.failed') {
      const failedAmountMinor = readNestedAmountMinor(payload, 'failedAmount');
      if (failedAmountMinor > 0) {
        terminalAmountFromEvent = failedAmountMinor;
      }
    }
  }

  const lifecycleContext = toRecord(payoutRequest.lifecycleContextJson);
  const currentRequestedAmountMinor =
    readPositiveInteger(lifecycleContext.currentRequestedAmountMinor) ??
    payoutQuote.requestedAmountMinor;
  const adjustmentTotalMinor = adjustmentLines.reduce((sum, line) => sum + line.deltaMinor, 0);
  const terminalAmountMinor = terminalAmountFromEvent ?? currentRequestedAmountMinor;

  const statementSeed = [
    payoutRequest.id,
    payoutQuote.quoteFingerprint,
    payoutContract.id,
    terminalStatus,
    payoutQuote.requestedAmountMinor,
    currentRequestedAmountMinor,
    terminalAmountMinor,
    adjustmentTotalMinor,
  ].join(':');

  const payoutStatementId = deterministicUuid(`payout-statement:${statementSeed}`);
  const statementFingerprint = deterministicHash(`payout-statement:${statementSeed}`);
  const deliveryTraceId = `payout-statement-delivery:${payoutRequest.traceId}`.slice(0, 128);
  const deliveryReferenceId = deterministicUuid(`payout-statement-delivery:${payoutRequest.id}`);

  return {
    payoutStatementId,
    organizerId: payoutRequest.organizerId,
    payoutRequestId: payoutRequest.id,
    payoutQuoteId: payoutQuote.id,
    payoutContractId: payoutContract.id,
    payoutStatus: terminalStatus,
    traceId: payoutRequest.traceId,
    statementFingerprint,
    quoteReference: {
      payoutQuoteId: payoutQuote.id,
      quoteFingerprint: payoutQuote.quoteFingerprint,
      requestedAt: payoutQuote.requestedAt,
      includedAmountMinor: payoutQuote.includedAmountMinor,
      deductionAmountMinor: payoutQuote.deductionAmountMinor,
      maxWithdrawableAmountMinor: payoutQuote.maxWithdrawableAmountMinor,
      requestedAmountMinor: payoutQuote.requestedAmountMinor,
    },
    componentBreakdown: toRecord(payoutQuote.componentBreakdownJson),
    adjustmentLines,
    originalRequestedAmountMinor: payoutQuote.requestedAmountMinor,
    currentRequestedAmountMinor,
    terminalAmountMinor,
    adjustmentTotalMinor,
    accessReference: {
      kind: 'organizer_statement',
      traceId: payoutRequest.traceId,
      href: buildAccessHref({
        organizerId: payoutRequest.organizerId,
        payoutRequestId: payoutRequest.id,
      }),
    },
    deliveryReference: {
      channel: 'api_pull',
      referenceId: deliveryReferenceId,
      traceId: deliveryTraceId,
    },
    generatedAt: now,
  };
}
