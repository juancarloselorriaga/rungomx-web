import { ArtifactGovernanceDashboard } from '@/components/admin/payments/artifact-governance-dashboard';
import { EvidencePackReviewDashboard } from '@/components/admin/payments/evidence-pack-review-dashboard';
import { FinancialCaseLookupDashboard } from '@/components/admin/payments/financial-case-lookup-dashboard';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

type FinancialCaseLookupLabels = Parameters<typeof FinancialCaseLookupDashboard>[0]['labels'];
type EvidencePackReviewLabels = Parameters<typeof EvidencePackReviewDashboard>[0]['labels'];
type ArtifactGovernanceLabels = Parameters<typeof ArtifactGovernanceDashboard>[0]['labels'];
type FinancialCaseLookupResult = NonNullable<
  Parameters<typeof FinancialCaseLookupDashboard>[0]['result']
>;

const runArtifactGovernanceAdminActionMock = jest.fn();
const listArtifactGovernanceSummaryAdminActionMock = jest.fn();

jest.mock('@/app/actions/admin-payments-artifacts', () => ({
  runArtifactGovernanceAdminAction: (...args: unknown[]) =>
    runArtifactGovernanceAdminActionMock(...args),
  listArtifactGovernanceSummaryAdminAction: (...args: unknown[]) =>
    listArtifactGovernanceSummaryAdminActionMock(...args),
}));

function createLabels<T extends Record<string, string>>(): T {
  return new Proxy({} as T, {
    get(_target, property: string | symbol) {
      return typeof property === 'string' ? property : '';
    },
  });
}

const caseLookupLabels = createLabels<FinancialCaseLookupLabels>();
const evidenceLabels = createLabels<EvidencePackReviewLabels>();
const governanceLabels = createLabels<ArtifactGovernanceLabels>();

const financialCaseLookupResultFixture: FinancialCaseLookupResult = {
  query: 'trace-01',
  normalizedQuery: 'trace-01',
  totalCaseCount: 1,
  cases: [
    {
      traceId: 'trace-01',
      organizerId: 'org-1234',
      rootEntityType: 'payout_request',
      rootEntityId: 'payout-001',
      eventCount: 4,
      firstOccurredAt: new Date('2026-02-01T10:00:00.000Z'),
      lastOccurredAt: new Date('2026-02-01T10:30:00.000Z'),
      matchedIdentifiers: ['trace-01'],
      matchSources: ['trace_id'],
    },
  ],
  disambiguationGroups: [
    {
      normalizedIdentifier: 'trace-01',
      displayIdentifier: 'trace-01',
      traceIds: ['trace-01', 'trace-02'],
      reason: '2 traces matched this identifier',
    },
  ],
};

const evidencePackFixture = {
  traceId: 'trace-01',
  rootEntity: {
    entityType: 'payout_request',
    entityId: 'payout-001',
  },
  organizerId: 'org-1234',
  generatedAt: new Date('2026-02-01T10:45:00.000Z'),
  keyTimestamps: {
    traceCreatedAt: new Date('2026-02-01T10:00:00.000Z'),
    firstEventAt: new Date('2026-02-01T10:00:00.000Z'),
    lastEventAt: new Date('2026-02-01T10:30:00.000Z'),
  },
  lifecycleEvents: [
    {
      id: 'evt-1',
      eventName: 'payout.requested',
      entityType: 'payout_request',
      entityId: 'payout-001',
      occurredAt: new Date('2026-02-01T10:00:00.000Z'),
      payloadJson: { amountMinor: 1000 },
      metadataJson: {},
    },
  ],
  artifacts: {
    versions: [
      {
        id: 'version-2',
        artifactType: 'payout_statement',
        artifactVersion: 2,
        fingerprint: 'fp-v2',
        rebuiltFromVersionId: 'version-1',
        reasonCode: 'manual_review',
        requestedByUserId: 'staff-1',
        createdAt: new Date('2026-02-01T10:35:00.000Z'),
      },
    ],
    deliveries: [
      {
        id: 'delivery-2',
        artifactVersionId: 'version-2',
        artifactType: 'payout_statement',
        channel: 'email',
        recipientReference: 'organizer@example.com',
        reasonCode: 'manual_review',
        requestedByUserId: 'staff-1',
        createdAt: new Date('2026-02-01T10:36:00.000Z'),
      },
    ],
  },
  policyContext: {
    policyVersion: '2026-02-01',
    source: 'payments-hardening',
  },
  ownership: {
    currentState: 'action_needed',
    currentOwner: 'support',
    nextExpectedTransition: 'support.review_complete',
    timeline: [
      {
        eventId: 'evt-1',
        ownershipState: 'action_needed',
        currentOwner: 'support',
        nextExpectedTransition: 'support.review_complete',
      },
    ],
  },
  redaction: {
    viewRole: 'support',
    redactedPaths: [],
  },
} as const;

const governanceSummaryFixture = {
  versions: [
    {
      id: 'version-2',
      traceId: 'trace-01',
      artifactType: 'payout_statement',
      artifactVersion: 2,
      fingerprint: 'fp-v2',
      rebuiltFromVersionId: 'version-1',
      reasonCode: 'manual_review',
      requestedByUserId: 'staff-1',
      createdAt: new Date('2026-02-01T10:35:00.000Z'),
    },
  ],
  deliveries: [
    {
      id: 'delivery-2',
      artifactVersionId: 'version-2',
      traceId: 'trace-01',
      artifactType: 'payout_statement',
      channel: 'email',
      recipientReference: 'organizer@example.com',
      reasonCode: 'manual_review',
      requestedByUserId: 'staff-1',
      createdAt: new Date('2026-02-01T10:36:00.000Z'),
    },
  ],
} as const;

describe('Payments hardening component coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows empty query state in financial case lookup dashboard', () => {
    render(
      <FinancialCaseLookupDashboard
        locale="en"
        selectedRange="30d"
        searchQuery=""
        result={null}
        labels={caseLookupLabels}
      />,
    );

    expect(screen.getByText('noQueryState')).toBeInTheDocument();
  });

  it('shows not-found state when lookup query has no matches', () => {
    render(
      <FinancialCaseLookupDashboard
        locale="en"
        selectedRange="30d"
        searchQuery="trace-missing"
        result={{
          query: 'trace-missing',
          normalizedQuery: 'trace-missing',
          totalCaseCount: 0,
          cases: [],
          disambiguationGroups: [],
        }}
        labels={caseLookupLabels}
      />,
    );

    expect(screen.getByText('noResultsState')).toBeInTheDocument();
  });

  it('renders case/disambiguation rows when lookup data is present', () => {
    render(
      <FinancialCaseLookupDashboard
        locale="en"
        selectedRange="30d"
        searchQuery="trace-01"
        result={financialCaseLookupResultFixture}
        labels={caseLookupLabels}
      />,
    );

    expect(screen.getAllByText('trace-01').length).toBeGreaterThan(0);
    expect(screen.getByText('2 traces matched this identifier')).toBeInTheDocument();
    expect(screen.getByText(/summaryLabel:\s*1/)).toBeInTheDocument();
  });

  it('renders no-trace and not-found states in evidence pack review dashboard', () => {
    const { rerender } = render(
      <EvidencePackReviewDashboard
        locale="en"
        selectedRange="30d"
        searchQuery=""
        selectedTraceId=""
        evidencePack={null}
        labels={evidenceLabels}
      />,
    );

    expect(screen.getByText('noTraceState')).toBeInTheDocument();

    rerender(
      <EvidencePackReviewDashboard
        locale="en"
        selectedRange="30d"
        searchQuery=""
        selectedTraceId="trace-01"
        evidencePack={null}
        labels={evidenceLabels}
      />,
    );

    expect(screen.getByText('notFoundState')).toBeInTheDocument();
  });

  it('renders evidence summary, ownership state, and artifact rows when pack exists', () => {
    render(
      <EvidencePackReviewDashboard
        locale="en"
        selectedRange="30d"
        searchQuery=""
        selectedTraceId="trace-01"
        evidencePack={evidencePackFixture as never}
        labels={evidenceLabels}
      />,
    );

    expect(screen.getAllByText('Action Needed').length).toBeGreaterThan(0);
    expect(screen.getAllByText('support.review_complete').length).toBeGreaterThan(0);
    expect(screen.getAllByText('payout_request:payout-001').length).toBeGreaterThan(0);
    expect(screen.getByText('fp-v2')).toBeInTheDocument();
    expect(screen.getByText('organizer@example.com')).toBeInTheDocument();
  });

  it('renders governance empty states and toggles resend version input enablement', () => {
    render(
      <ArtifactGovernanceDashboard
        locale="en"
        initialSummary={{ versions: [], deliveries: [] }}
        labels={governanceLabels}
      />,
    );

    expect(screen.getByText('versionsEmpty')).toBeInTheDocument();
    expect(screen.getByText('deliveriesEmpty')).toBeInTheDocument();

    const operationSelect = screen.getByLabelText('operationFieldLabel');
    const artifactVersionInput = screen.getByLabelText('artifactVersionFieldLabel');

    expect(artifactVersionInput).toBeDisabled();
    fireEvent.change(operationSelect, { target: { value: 'resend' } });
    expect(artifactVersionInput).toBeEnabled();
  });

  it('submits governance rebuild and shows success feedback', async () => {
    runArtifactGovernanceAdminActionMock.mockResolvedValue({
      ok: true,
      data: {
        operation: 'rebuild',
        traceId: 'trace-01',
        artifactType: 'payout_statement',
        artifactVersion: 2,
        versionId: 'version-2',
        deliveryId: 'delivery-2',
        rateLimitRemaining: null,
        rateLimitResetAtIso: null,
      },
    });
    listArtifactGovernanceSummaryAdminActionMock.mockResolvedValue({
      ok: true,
      data: governanceSummaryFixture,
    });

    render(
      <ArtifactGovernanceDashboard
        locale="en"
        initialSummary={{ versions: [], deliveries: [] }}
        labels={governanceLabels}
      />,
    );

    fireEvent.change(screen.getByLabelText('traceFieldLabel'), {
      target: { value: 'trace-01' },
    });
    fireEvent.change(screen.getByLabelText('reasonFieldLabel'), {
      target: { value: 'manual_review' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'submitLabel' }));

    await waitFor(() => {
      expect(runArtifactGovernanceAdminActionMock).toHaveBeenCalledTimes(1);
    });

    expect(runArtifactGovernanceAdminActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'rebuild',
        traceId: 'trace-01',
        artifactType: 'payout_statement',
        reasonCode: 'manual_review',
        artifactVersion: undefined,
      }),
    );

    await waitFor(() => {
      expect(screen.getByText(/successPrefix: operationRebuildLabel/)).toBeInTheDocument();
    });
    expect(listArtifactGovernanceSummaryAdminActionMock).toHaveBeenCalledTimes(1);
  });

  it('shows policy-denied feedback when governance operation fails', async () => {
    runArtifactGovernanceAdminActionMock.mockResolvedValue({
      ok: false,
      error: 'ARTIFACT_TRACE_NOT_FOUND',
      message: 'Trace not found',
    });

    render(
      <ArtifactGovernanceDashboard
        locale="en"
        initialSummary={{ versions: [], deliveries: [] }}
        labels={governanceLabels}
      />,
    );

    fireEvent.change(screen.getByLabelText('traceFieldLabel'), {
      target: { value: 'trace-missing' },
    });
    fireEvent.change(screen.getByLabelText('reasonFieldLabel'), {
      target: { value: 'manual_review' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'submitLabel' }));

    await waitFor(() => {
      expect(screen.getByText('policyDeniedPrefix: ARTIFACT_TRACE_NOT_FOUND (Trace not found)')).toBeInTheDocument();
    });
  });
});
