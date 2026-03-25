import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { and, eq, isNull } from 'drizzle-orm';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env.test'), override: false });

let dbRef: typeof import('../../db').db;
let schemaRef: typeof import('../../db/schema');

type Args = {
  email: string;
  baseUrl: string;
};

type SeededPayout = {
  payoutQuoteId: string;
  payoutRequestId: string;
  payoutContractId: string;
  traceId: string;
};

function parseArgs(argv: string[]): Args {
  let email = 'jetsam-elector92@icloud.com';
  let baseUrl = process.env.SMOKE_BASE_URL?.trim() || 'http://localhost:3462';

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--email') {
      email = argv[index + 1] ?? email;
      index += 1;
      continue;
    }
    if (arg === '--base-url') {
      baseUrl = argv[index + 1] ?? baseUrl;
      index += 1;
    }
  }

  return {
    email: email.trim().toLowerCase(),
    baseUrl: baseUrl.replace(/\/+$/, ''),
  };
}

function createSlug(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
}

async function createOrganizationForUser(params: {
  userId: string;
  name: string;
  slugPrefix: string;
}) {
  const slug = createSlug(params.slugPrefix);
  const [organization] = await dbRef
    .insert(schemaRef.organizations)
    .values({
      name: params.name,
      slug,
    })
    .returning({
      id: schemaRef.organizations.id,
      name: schemaRef.organizations.name,
      slug: schemaRef.organizations.slug,
    });

  await dbRef.insert(schemaRef.organizationMemberships).values({
    organizationId: organization.id,
    userId: params.userId,
    role: 'owner',
  });

  return organization;
}

function createTraceId(prefix: string): string {
  return `${prefix}:${Date.now()}:${randomUUID()}`.slice(0, 128);
}

async function insertPayoutWithLifecycle(params: {
  organizerId: string;
  userId: string;
  status: 'completed' | 'failed' | 'processing';
  requestedAmountMinor: number;
  currentRequestedAmountMinor: number;
  maxWithdrawableAmountMinor: number;
  includedAmountMinor: number;
  deductionAmountMinor: number;
  occurredAt: Date;
  reasonCode?: string;
}) {
  const payoutQuoteId = randomUUID();
  const payoutRequestId = randomUUID();
  const payoutContractId = randomUUID();
  const traceId = createTraceId(`trace:payout:${params.status}`);
  const idempotencySuffix = randomUUID();

  await dbRef.insert(schemaRef.payoutQuotes).values({
    id: payoutQuoteId,
    organizerId: params.organizerId,
    idempotencyKey: `smoke-quote-${idempotencySuffix}`,
    quoteFingerprint: `smoke-quote-fingerprint-${idempotencySuffix}`,
    currency: 'MXN',
    includedAmountMinor: params.includedAmountMinor,
    deductionAmountMinor: params.deductionAmountMinor,
    maxWithdrawableAmountMinor: params.maxWithdrawableAmountMinor,
    requestedAmountMinor: params.requestedAmountMinor,
    eligibilitySnapshotJson: {
      source: 'smoke-seed',
      status: params.status,
    },
    componentBreakdownJson: {
      source: 'smoke-seed',
      requestedAmountMinor: params.requestedAmountMinor,
    },
    createdByUserId: params.userId,
    requestedAt: params.occurredAt,
    createdAt: params.occurredAt,
    updatedAt: params.occurredAt,
  });

  await dbRef.insert(schemaRef.payoutRequests).values({
    id: payoutRequestId,
    organizerId: params.organizerId,
    payoutQuoteId,
    status: params.status,
    traceId,
    requestedByUserId: params.userId,
    requestedAt: params.occurredAt,
    lifecycleContextJson: {
      currentRequestedAmountMinor: params.currentRequestedAmountMinor,
      reasonCode: params.reasonCode ?? null,
      source: 'smoke-seed',
    },
    createdAt: params.occurredAt,
    updatedAt: params.occurredAt,
  });

  await dbRef.insert(schemaRef.payoutContracts).values({
    id: payoutContractId,
    organizerId: params.organizerId,
    payoutQuoteId,
    payoutRequestId,
    policyVersion: 'smoke-seed-v1',
    immutableFingerprint: `smoke-contract-fingerprint-${idempotencySuffix}`,
    baselineSnapshotJson: {
      source: 'smoke-seed',
      requestedAmountMinor: params.requestedAmountMinor,
      currentRequestedAmountMinor: params.currentRequestedAmountMinor,
    },
    createdAt: params.occurredAt,
    updatedAt: params.occurredAt,
  });

  await dbRef.insert(schemaRef.moneyTraces).values({
    traceId,
    organizerId: params.organizerId,
    rootEntityType: 'payout_request',
    rootEntityId: payoutRequestId,
    createdBySource: 'api',
    metadataJson: {
      seededBy: 'seed-organizer-payments-smoke-fixtures',
      status: params.status,
    },
    createdAt: params.occurredAt,
  });

  const eventBase = params.occurredAt.getTime();
  const processingAt = new Date(eventBase + 60_000);
  const terminalAt = new Date(eventBase + 120_000);
  const pausedAt = new Date(eventBase + 90_000);

  await dbRef.insert(schemaRef.moneyEvents).values({
    id: randomUUID(),
    traceId,
    organizerId: params.organizerId,
    eventName: 'payout.requested',
    eventVersion: 1,
    entityType: 'payout',
    entityId: payoutRequestId,
    source: 'api',
    idempotencyKey: `smoke-requested-${idempotencySuffix}`,
    occurredAt: params.occurredAt,
    payloadJson: {
      requestedAmount: { amountMinor: params.requestedAmountMinor },
      reasonCode: 'smoke_seed_request',
    },
    metadataJson: { source: 'smoke-seed' },
    createdAt: params.occurredAt,
  });

  await dbRef.insert(schemaRef.moneyEvents).values({
    id: randomUUID(),
    traceId,
    organizerId: params.organizerId,
    eventName: 'payout.processing',
    eventVersion: 1,
    entityType: 'payout',
    entityId: payoutRequestId,
    source: 'api',
    idempotencyKey: `smoke-processing-${idempotencySuffix}`,
    occurredAt: processingAt,
    payloadJson: {
      currentRequestedAmount: { amountMinor: params.currentRequestedAmountMinor },
      reasonCode: 'smoke_seed_processing',
    },
    metadataJson: { source: 'smoke-seed' },
    createdAt: processingAt,
  });

  if (params.status === 'processing') {
    await dbRef.insert(schemaRef.moneyEvents).values({
      id: randomUUID(),
      traceId,
      organizerId: params.organizerId,
      eventName: 'payout.paused',
      eventVersion: 1,
      entityType: 'payout',
      entityId: payoutRequestId,
      source: 'api',
      idempotencyKey: `smoke-paused-${idempotencySuffix}`,
      occurredAt: pausedAt,
      payloadJson: {
        currentRequestedAmount: { amountMinor: params.currentRequestedAmountMinor },
        reasonCode: params.reasonCode ?? 'smoke_seed_manual_review',
      },
      metadataJson: { source: 'smoke-seed' },
      createdAt: pausedAt,
    });
  }

  if (params.status === 'completed') {
    await dbRef.insert(schemaRef.moneyEvents).values({
      id: randomUUID(),
      traceId,
      organizerId: params.organizerId,
      eventName: 'payout.completed',
      eventVersion: 1,
      entityType: 'payout',
      entityId: payoutRequestId,
      source: 'api',
      idempotencyKey: `smoke-completed-${idempotencySuffix}`,
      occurredAt: terminalAt,
      payloadJson: {
        settledAmount: { amountMinor: params.currentRequestedAmountMinor },
        reasonCode: 'smoke_seed_completed',
      },
      metadataJson: { source: 'smoke-seed' },
      createdAt: terminalAt,
    });
  }

  if (params.status === 'failed') {
    await dbRef.insert(schemaRef.moneyEvents).values({
      id: randomUUID(),
      traceId,
      organizerId: params.organizerId,
      eventName: 'payout.failed',
      eventVersion: 1,
      entityType: 'payout',
      entityId: payoutRequestId,
      source: 'api',
      idempotencyKey: `smoke-failed-${idempotencySuffix}`,
      occurredAt: terminalAt,
      payloadJson: {
        failedAmount: { amountMinor: params.currentRequestedAmountMinor },
        reasonCode: params.reasonCode ?? 'smoke_seed_failed',
      },
      metadataJson: { source: 'smoke-seed' },
      createdAt: terminalAt,
    });
  }

  const seeded: SeededPayout = {
    payoutQuoteId,
    payoutRequestId,
    payoutContractId,
    traceId,
  };

  return seeded;
}

async function main() {
  const [{ db }, schema] = await Promise.all([import('../../db'), import('../../db/schema')]);
  dbRef = db;
  schemaRef = schema;

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required (.env.local or .env.test).');
  }

  const args = parseArgs(process.argv.slice(2));
  const [user] = await dbRef
    .select({ id: schemaRef.users.id, email: schemaRef.users.email })
    .from(schemaRef.users)
    .where(and(eq(schemaRef.users.email, args.email), isNull(schemaRef.users.deletedAt)))
    .limit(1);

  if (!user) {
    throw new Error(`User not found for email=${args.email}`);
  }

  const readyOrganization = await createOrganizationForUser({
    userId: user.id,
    name: `Smoke Payments Ready ${Date.now()}`,
    slugPrefix: 'smoke-payments-ready',
  });

  const conflictOrganization = await createOrganizationForUser({
    userId: user.id,
    name: `Smoke Payments Conflict ${Date.now()}`,
    slugPrefix: 'smoke-payments-conflict',
  });

  const completedSeed = await insertPayoutWithLifecycle({
    organizerId: readyOrganization.id,
    userId: user.id,
    status: 'completed',
    requestedAmountMinor: 110_000,
    currentRequestedAmountMinor: 108_500,
    maxWithdrawableAmountMinor: 150_000,
    includedAmountMinor: 120_000,
    deductionAmountMinor: 1_500,
    occurredAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
  });

  const failedSeed = await insertPayoutWithLifecycle({
    organizerId: readyOrganization.id,
    userId: user.id,
    status: 'failed',
    requestedAmountMinor: 90_000,
    currentRequestedAmountMinor: 90_000,
    maxWithdrawableAmountMinor: 120_000,
    includedAmountMinor: 95_000,
    deductionAmountMinor: 5_000,
    occurredAt: new Date(Date.now() - 90 * 60 * 1000),
    reasonCode: 'smoke_seed_bank_reject',
  });

  const processingSeed = await insertPayoutWithLifecycle({
    organizerId: conflictOrganization.id,
    userId: user.id,
    status: 'processing',
    requestedAmountMinor: 80_000,
    currentRequestedAmountMinor: 80_000,
    maxWithdrawableAmountMinor: 100_000,
    includedAmountMinor: 85_000,
    deductionAmountMinor: 5_000,
    occurredAt: new Date(Date.now() - 45 * 60 * 1000),
    reasonCode: 'smoke_seed_active_processing',
  });

  const output = {
    user: {
      id: user.id,
      email: user.email,
    },
    organizations: {
      ready: {
        ...readyOrganization,
        paymentsUrl: `${args.baseUrl}/en/dashboard/payments?organizationId=${readyOrganization.id}`,
        payoutsUrl: `${args.baseUrl}/en/dashboard/payments/payouts?organizationId=${readyOrganization.id}`,
      },
      conflict: {
        ...conflictOrganization,
        paymentsUrl: `${args.baseUrl}/en/dashboard/payments?organizationId=${conflictOrganization.id}`,
        payoutsUrl: `${args.baseUrl}/en/dashboard/payments/payouts?organizationId=${conflictOrganization.id}`,
      },
    },
    payouts: {
      completed: {
        ...completedSeed,
        detailUrl: `${args.baseUrl}/en/dashboard/payments/payouts/${completedSeed.payoutRequestId}?organizationId=${readyOrganization.id}`,
      },
      failed: {
        ...failedSeed,
        detailUrl: `${args.baseUrl}/en/dashboard/payments/payouts/${failedSeed.payoutRequestId}?organizationId=${readyOrganization.id}`,
      },
      processing: {
        ...processingSeed,
        detailUrl: `${args.baseUrl}/en/dashboard/payments/payouts/${processingSeed.payoutRequestId}?organizationId=${conflictOrganization.id}`,
      },
    },
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error('[seed-organizer-payments-smoke-fixtures] Failed');
  console.error(error);
  process.exit(1);
});
