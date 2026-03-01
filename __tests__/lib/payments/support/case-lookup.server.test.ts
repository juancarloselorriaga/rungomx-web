const mockSelect = jest.fn();

const selectResultQueue: Array<unknown[]> = [];
const selectLimitCalls: number[] = [];

jest.mock('@/db', () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
  },
}));

import {
  applyRoleMetadataPolicy,
  lookupFinancialCases,
  normalizeFinancialCaseLookupQuery,
  projectFinancialCaseDisambiguationGroups,
  type FinancialCaseLookupCase,
} from '@/lib/payments/support/case-lookup';

function enqueueSelectResult(rows: unknown[]): void {
  selectResultQueue.push(rows);
}

describe('financial case lookup projection helpers', () => {
  it('normalizes lookup query deterministically', () => {
    expect(normalizeFinancialCaseLookupQuery('  TRACE-ABC-123  ')).toBe('trace-abc-123');
    expect(normalizeFinancialCaseLookupQuery('PAYOUT-KEY-001')).toBe('payout-key-001');
  });

  it('groups ambiguous identifiers with explicit disambiguation context', () => {
    const groups = projectFinancialCaseDisambiguationGroups([
      {
        traceId: 'trace-1',
        identifier: 'PAYOUT-REQ-001',
        source: 'payout_request_id',
      },
      {
        traceId: 'trace-2',
        identifier: 'payout-req-001',
        source: 'event_entity_id',
      },
      {
        traceId: 'trace-3',
        identifier: 'TRACE-ONLY-003',
        source: 'trace_id',
      },
    ]);

    expect(groups).toEqual([
      {
        normalizedIdentifier: 'payout-req-001',
        displayIdentifier: 'PAYOUT-REQ-001',
        traceIds: ['trace-1', 'trace-2'],
        reason: '2 traces matched this identifier',
      },
    ]);
  });

  it('applies role-appropriate metadata redaction for non-sensitive views', () => {
    const baseCase: FinancialCaseLookupCase = {
      traceId: 'trace-sensitive-1',
      organizerId: '11111111-1111-4111-8111-111111111111',
      rootEntityType: 'payout_request',
      rootEntityId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      eventCount: 5,
      firstOccurredAt: new Date('2026-02-20T10:00:00.000Z'),
      lastOccurredAt: new Date('2026-02-20T12:00:00.000Z'),
      matchedIdentifiers: [
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'idem-key-0123456789',
      ],
      matchSources: ['payout_request_id', 'event_idempotency_key'],
    };

    const sensitive = applyRoleMetadataPolicy({
      value: baseCase,
      includeSensitiveMetadata: true,
    });
    expect(sensitive).toEqual(baseCase);

    const redacted = applyRoleMetadataPolicy({
      value: baseCase,
      includeSensitiveMetadata: false,
    });
    expect(redacted.traceId).toBe('trace-sensitive-1');
    expect(redacted.organizerId).toBe('11111111…1111');
    expect(redacted.rootEntityId).toBe('aaaaaaaa…aaaa');
    expect(redacted.matchedIdentifiers).toEqual(['aaaaaaaa…aaaa', 'idem-key…6789']);
  });
});

describe('lookupFinancialCases DB-backed branches', () => {
  beforeEach(() => {
    selectResultQueue.length = 0;
    selectLimitCalls.length = 0;
    mockSelect.mockReset();
    mockSelect.mockImplementation(() => {
      const chain = {
        from: (..._args: unknown[]) => chain,
        innerJoin: (..._args: unknown[]) => chain,
        where: (..._args: unknown[]) => chain,
        orderBy: (..._args: unknown[]) => chain,
        limit: (value: number) => {
          selectLimitCalls.push(value);
          return Promise.resolve(selectResultQueue.shift() ?? []);
        },
        groupBy: (..._args: unknown[]) => Promise.resolve(selectResultQueue.shift() ?? []),
      };

      return chain;
    });
  });

  it('returns empty results for blank queries without touching the DB', async () => {
    const result = await lookupFinancialCases({
      query: '   ',
    });

    expect(result).toEqual({
      query: '',
      normalizedQuery: '',
      totalCaseCount: 0,
      cases: [],
      disambiguationGroups: [],
    });
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it('returns no matches when all lookup scans come back empty', async () => {
    enqueueSelectResult([]);
    enqueueSelectResult([]);
    enqueueSelectResult([]);
    enqueueSelectResult([]);

    const result = await lookupFinancialCases({
      query: 'missing-identifier',
    });

    expect(result).toEqual({
      query: 'missing-identifier',
      normalizedQuery: 'missing-identifier',
      totalCaseCount: 0,
      cases: [],
      disambiguationGroups: [],
    });
    expect(mockSelect).toHaveBeenCalledTimes(4);
    expect(selectLimitCalls).toEqual([80, 80, 80, 80]);
  });

  it('adds UUID exact matches from payout request and quote branches', async () => {
    const uuid = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

    enqueueSelectResult([]);
    enqueueSelectResult([]);
    enqueueSelectResult([]);
    enqueueSelectResult([]);
    enqueueSelectResult([
      {
        traceId: 'trace-from-request',
        payoutRequestId: uuid,
      },
    ]);
    enqueueSelectResult([
      {
        traceId: 'trace-from-quote',
        payoutQuoteId: uuid,
      },
    ]);
    enqueueSelectResult([
      {
        traceId: 'trace-from-request',
        organizerId: '11111111-1111-4111-8111-111111111111',
        rootEntityType: 'payout_request',
        rootEntityId: 'root-entity-request-1234567890',
        createdAt: new Date('2026-02-20T10:00:00.000Z'),
      },
      {
        traceId: 'trace-from-quote',
        organizerId: '22222222-2222-4222-8222-222222222222',
        rootEntityType: 'payout_request',
        rootEntityId: 'root-entity-quote-1234567890',
        createdAt: new Date('2026-02-20T11:00:00.000Z'),
      },
    ]);
    enqueueSelectResult([
      {
        traceId: 'trace-from-request',
        eventCount: 3,
        firstOccurredAt: new Date('2026-02-20T10:01:00.000Z'),
        lastOccurredAt: new Date('2026-02-20T10:05:00.000Z'),
      },
      {
        traceId: 'trace-from-quote',
        eventCount: 7,
        firstOccurredAt: new Date('2026-02-20T11:01:00.000Z'),
        lastOccurredAt: new Date('2026-02-20T11:06:00.000Z'),
      },
    ]);

    const result = await lookupFinancialCases({
      query: uuid,
      includeSensitiveMetadata: true,
    });

    expect(mockSelect).toHaveBeenCalledTimes(8);
    expect(selectLimitCalls).toEqual([80, 80, 80, 80, 80, 80, 20]);
    expect(result.totalCaseCount).toBe(2);
    expect(result.cases.map((entry) => entry.traceId)).toEqual([
      'trace-from-quote',
      'trace-from-request',
    ]);
    expect(result.cases[0]?.matchedIdentifiers).toEqual([uuid]);
    expect(result.cases[0]?.matchSources).toEqual(['payout_quote_id']);
    expect(result.cases[1]?.matchedIdentifiers).toEqual([uuid]);
    expect(result.cases[1]?.matchSources).toEqual(['payout_request_id']);
    expect(result.disambiguationGroups).toEqual([
      {
        normalizedIdentifier: uuid,
        displayIdentifier: uuid,
        traceIds: ['trace-from-quote', 'trace-from-request'],
        reason: '2 traces matched this identifier',
      },
    ]);
  });

  it('redacts disambiguation identifiers when sensitive metadata is disabled', async () => {
    const sharedIdentifier = 'shared-identifier-1234567890';

    enqueueSelectResult([
      {
        traceId: 'trace-a',
        rootEntityId: sharedIdentifier,
      },
      {
        traceId: 'trace-b',
        rootEntityId: sharedIdentifier,
      },
    ]);
    enqueueSelectResult([]);
    enqueueSelectResult([]);
    enqueueSelectResult([]);
    enqueueSelectResult([
      {
        traceId: 'trace-a',
        organizerId: 'aaaa1111-1111-4111-8111-aaaaaaaaaaaa',
        rootEntityType: 'payout_request',
        rootEntityId: sharedIdentifier,
        createdAt: new Date('2026-02-20T10:00:00.000Z'),
      },
      {
        traceId: 'trace-b',
        organizerId: 'bbbb2222-2222-4222-8222-bbbbbbbbbbbb',
        rootEntityType: 'payout_request',
        rootEntityId: sharedIdentifier,
        createdAt: new Date('2026-02-20T11:00:00.000Z'),
      },
    ]);
    enqueueSelectResult([]);

    const result = await lookupFinancialCases({
      query: 'shared-identifier',
      includeSensitiveMetadata: false,
    });

    expect(result.cases.map((entry) => entry.rootEntityId)).toEqual([
      'shared-i…7890',
      'shared-i…7890',
    ]);
    expect(result.cases.map((entry) => entry.matchedIdentifiers)).toEqual([
      ['shared-i…7890'],
      ['shared-i…7890'],
    ]);
    expect(result.disambiguationGroups).toEqual([
      {
        normalizedIdentifier: sharedIdentifier,
        displayIdentifier: 'shared-i…7890',
        traceIds: ['trace-a', 'trace-b'],
        reason: '2 traces matched this identifier',
      },
    ]);
  });

  it('normalizes limit values and applies result slicing deterministically', async () => {
    enqueueSelectResult([
      {
        traceId: 'trace-one',
        rootEntityId: 'entity-one',
      },
      {
        traceId: 'trace-two',
        rootEntityId: 'entity-two',
      },
    ]);
    enqueueSelectResult([]);
    enqueueSelectResult([]);
    enqueueSelectResult([]);
    enqueueSelectResult([
      {
        traceId: 'trace-one',
        organizerId: '11111111-1111-4111-8111-111111111111',
        rootEntityType: 'payout_request',
        rootEntityId: 'entity-one-1234567890',
        createdAt: new Date('2026-02-20T10:00:00.000Z'),
      },
      {
        traceId: 'trace-two',
        organizerId: '22222222-2222-4222-8222-222222222222',
        rootEntityType: 'payout_request',
        rootEntityId: 'entity-two-1234567890',
        createdAt: new Date('2026-02-20T11:00:00.000Z'),
      },
    ]);
    enqueueSelectResult([
      {
        traceId: 'trace-one',
        eventCount: 2,
        firstOccurredAt: new Date('2026-02-20T09:30:00.000Z'),
        lastOccurredAt: new Date('2026-02-20T10:30:00.000Z'),
      },
      {
        traceId: 'trace-two',
        eventCount: 4,
        firstOccurredAt: new Date('2026-02-20T11:30:00.000Z'),
        lastOccurredAt: new Date('2026-02-20T12:30:00.000Z'),
      },
    ]);

    const result = await lookupFinancialCases({
      query: 'trace-',
      limit: 1.9,
      includeSensitiveMetadata: true,
    });

    expect(selectLimitCalls).toEqual([80, 80, 80, 80, 2]);
    expect(result.totalCaseCount).toBe(1);
    expect(result.cases).toHaveLength(1);
    expect(result.cases[0]?.traceId).toBe('trace-two');
  });
});
