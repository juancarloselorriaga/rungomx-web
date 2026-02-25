import {
  applyRoleMetadataPolicy,
  normalizeFinancialCaseLookupQuery,
  projectFinancialCaseDisambiguationGroups,
  type FinancialCaseLookupCase,
} from '@/lib/payments/support/case-lookup';

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
