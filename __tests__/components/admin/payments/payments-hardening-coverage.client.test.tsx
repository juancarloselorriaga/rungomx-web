import { ArtifactGovernanceDashboard } from '@/components/admin/payments/artifact-governance-dashboard';
import { DebtDisputeExposureDashboard } from '@/components/admin/payments/debt-dispute-exposure-dashboard';
import { EvidencePackReviewDashboard } from '@/components/admin/payments/evidence-pack-review-dashboard';
import { FinancialCaseLookupDashboard } from '@/components/admin/payments/financial-case-lookup-dashboard';
import { FxRateManagementDashboard } from '@/components/admin/payments/fx-rate-management-dashboard';
import { MxnReportingDashboard } from '@/components/admin/payments/mxn-reporting-dashboard';
import { NetRecognizedFeeDashboard } from '@/components/admin/payments/net-recognized-fee-dashboard';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { DebtDisputeExposureMetrics } from '@/lib/payments/economics/debt-dispute-exposure';
import type {
  DailyFxRateRecord,
  FxRateActionFlags,
} from '@/lib/payments/economics/fx-rate-management';
import type { MxnNetRecognizedFeeReport } from '@/lib/payments/economics/mxn-reporting';
import type { NetRecognizedFeeMetrics } from '@/lib/payments/economics/net-recognized-fees';

type FinancialCaseLookupLabels = Parameters<typeof FinancialCaseLookupDashboard>[0]['labels'];
type EvidencePackReviewLabels = Parameters<typeof EvidencePackReviewDashboard>[0]['labels'];
type ArtifactGovernanceLabels = Parameters<typeof ArtifactGovernanceDashboard>[0]['labels'];
type NetRecognizedFeeLabels = Parameters<typeof NetRecognizedFeeDashboard>[0]['labels'];
type DebtDisputeExposureLabels = Parameters<typeof DebtDisputeExposureDashboard>[0]['labels'];
type MxnReportingLabels = Parameters<typeof MxnReportingDashboard>[0]['labels'];
type FxRateManagementLabels = Parameters<typeof FxRateManagementDashboard>[0]['labels'];
type FinancialCaseLookupResult = NonNullable<
  Parameters<typeof FinancialCaseLookupDashboard>[0]['result']
>;

const runArtifactGovernanceAdminActionMock = jest.fn();
const listArtifactGovernanceSummaryAdminActionMock = jest.fn();
const routerReplaceMock = jest.fn();
const routerRefreshMock = jest.fn();

jest.mock('@/app/actions/admin-payments-artifacts', () => ({
  runArtifactGovernanceAdminAction: (...args: unknown[]) =>
    runArtifactGovernanceAdminActionMock(...args),
  listArtifactGovernanceSummaryAdminAction: (...args: unknown[]) =>
    listArtifactGovernanceSummaryAdminActionMock(...args),
}));

jest.mock('@/components/admin/dashboard/admin-dashboard-range-selector', () => ({
  AdminDashboardRangeSelector: () => <div data-testid="admin-range-selector" />,
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: routerReplaceMock,
    refresh: routerRefreshMock,
  }),
  usePathname: () => '/admin/payments',
  useSearchParams: () => new URLSearchParams('range=30d'),
}));

jest.mock('@/components/ui/date-picker', () => ({
  DatePicker: ({
    value,
    onChangeAction,
  }: {
    value?: string;
    onChangeAction?: (value: string) => void;
  }) => (
    <input
      aria-label="fxDatePicker"
      data-testid="fx-date-picker"
      value={value ?? ''}
      onChange={(event) => onChangeAction?.(event.target.value)}
    />
  ),
}));

function createLabels<T extends Record<string, unknown>>(): T {
  return new Proxy({} as T, {
    get(target, property: string | symbol) {
      if (typeof property === 'string' && property in target) {
        return target[property as keyof T];
      }
      return typeof property === 'string' ? property : '';
    },
  });
}

const caseLookupLabels = createLabels<FinancialCaseLookupLabels>();
const evidenceLabels = createLabels<EvidencePackReviewLabels>();
const governanceLabels = Object.assign(createLabels<ArtifactGovernanceLabels>(), {
  errorMessages: {
    VALIDATION_FAILED: 'validationFallbackMessage',
    REQUIRED_FIELD: 'requiredFieldMessage',
    INVALID_NUMBER: 'invalidNumberMessage',
    INVALID_STRING: 'invalidStringMessage',
    INVALID_ENUM: 'invalidEnumMessage',
    ARTIFACT_TRACE_NOT_FOUND: 'errorMessageForCode:ARTIFACT_TRACE_NOT_FOUND',
    UNKNOWN_ERROR: 'errorMessageForCode:UNKNOWN_ERROR',
  },
});
const netRecognizedFeeLabels = Object.assign(createLabels<NetRecognizedFeeLabels>(), {
  sampleTracesScopeLabel: (shown: number, total: number) =>
    `sampleTracesScopeLabel:${shown}:${total}`,
  sampleTracesMoreLabel: (count: number) => `sampleTracesMoreLabel:${count}`,
});
const mxnReportingLabels = createLabels<MxnReportingLabels>();
const fxRateManagementLabels = createLabels<FxRateManagementLabels>();
const debtDisputeExposureLabels: DebtDisputeExposureLabels = {
  sectionTitle: 'sectionTitle',
  sectionDescription: 'sectionDescription',
  summaryExposureTitle: 'summaryExposureTitle',
  summaryOpenCasesTitle: 'summaryOpenCasesTitle',
  summaryPolicyPausesTitle: 'summaryPolicyPausesTitle',
  organizerTableTitle: 'organizerTableTitle',
  organizerTableDescription: 'organizerTableDescription',
  eventTableTitle: 'eventTableTitle',
  eventTableDescription: 'eventTableDescription',
  groupHeader: 'groupHeader',
  exposureHeader: 'exposureHeader',
  openAtRiskHeader: 'openAtRiskHeader',
  debtPostedHeader: 'debtPostedHeader',
  openCasesHeader: 'openCasesHeader',
  pauseHeader: 'pauseHeader',
  resumeHeader: 'resumeHeader',
  tracesHeader: 'tracesHeader',
  disputeCasesHeader: 'disputeCasesHeader',
  sampleTracesLabel: 'sampleTracesLabel',
  sampleCasesLabel: 'sampleCasesLabel',
  sampledTraceCountLabel: (count) => `sampledTraceCountLabel:${count}`,
  sampledCaseCountLabel: (count) => `sampledCaseCountLabel:${count}`,
  sampledMoreLabel: (count) => `sampledMoreLabel:${count}`,
  currenciesLabel: (count) => `currenciesLabel:${count}`,
  emptyState: 'emptyState',
};

const netRecognizedMetricsFixture: NetRecognizedFeeMetrics = {
  asOf: new Date('2026-02-10T00:00:00.000Z'),
  windowStart: new Date('2026-02-01T00:00:00.000Z'),
  windowEnd: new Date('2026-02-10T00:00:00.000Z'),
  headlineCurrency: 'MXN',
  headlineCapturedFeeMinor: 125000,
  headlineAdjustmentsMinor: -1500,
  headlineNetRecognizedFeeMinor: 123500,
  currencies: [
    {
      currency: 'MXN',
      capturedFeeMinor: 125000,
      adjustmentsMinor: -1500,
      netRecognizedFeeMinor: 123500,
      captureEventCount: 3,
      adjustmentEventCount: 1,
    },
  ],
  adjustments: [
    {
      currency: 'MXN',
      adjustmentCode: 'manual_review',
      amountMinor: -1500,
      eventCount: 1,
    },
  ],
  traceability: {
    windowStart: new Date('2026-02-01T00:00:00.000Z'),
    windowEnd: new Date('2026-02-10T00:00:00.000Z'),
    eventCount: 4,
    distinctTraceCount: 2,
    firstOccurredAt: new Date('2026-02-01T10:00:00.000Z'),
    lastOccurredAt: new Date('2026-02-09T14:00:00.000Z'),
    sampleTraceIds: ['trace-net-1'],
  },
};

const debtDisputeExposureMetricsFixture: DebtDisputeExposureMetrics = {
  asOf: new Date('2026-02-10T00:00:00.000Z'),
  windowStart: new Date('2026-02-01T00:00:00.000Z'),
  windowEnd: new Date('2026-02-10T00:00:00.000Z'),
  totals: {
    openDisputeCaseCount: 2,
    pauseRequiredCount: 1,
    resumeAllowedCount: 1,
    headlineCurrency: 'MXN',
    headlineOpenDisputeAtRiskMinor: 4000,
    headlineDebtPostedMinor: 700,
    headlineExposureScoreMinor: 4700,
    currencies: [
      {
        currency: 'MXN',
        openDisputeAtRiskMinor: 4000,
        debtPostedMinor: 700,
        exposureScoreMinor: 4700,
      },
    ],
  },
  organizers: [
    {
      organizerId: 'org-1',
      organizerLabel: 'Organizer One',
      openDisputeCaseCount: 1,
      pauseRequiredCount: 1,
      resumeAllowedCount: 0,
      headlineCurrency: 'MXN',
      headlineOpenDisputeAtRiskMinor: 2500,
      headlineDebtPostedMinor: 500,
      headlineExposureScoreMinor: 3000,
      currencies: [
        {
          currency: 'MXN',
          openDisputeAtRiskMinor: 2500,
          debtPostedMinor: 500,
          exposureScoreMinor: 3000,
        },
      ],
      traceability: {
        distinctTraceCount: 1,
        distinctDisputeCaseCount: 1,
        sampleTraceIds: ['trace-dispute-1'],
        sampleDisputeCaseIds: ['case-1'],
      },
    },
  ],
  events: [
    {
      eventEditionId: 'edition-1',
      eventLabel: 'Main Event',
      openDisputeCaseCount: 1,
      pauseRequiredCount: 0,
      resumeAllowedCount: 1,
      headlineCurrency: 'MXN',
      headlineOpenDisputeAtRiskMinor: 1500,
      headlineDebtPostedMinor: 200,
      headlineExposureScoreMinor: 1700,
      currencies: [
        {
          currency: 'MXN',
          openDisputeAtRiskMinor: 1500,
          debtPostedMinor: 200,
          exposureScoreMinor: 1700,
        },
      ],
      traceability: {
        distinctTraceCount: 1,
        distinctDisputeCaseCount: 1,
        sampleTraceIds: ['trace-dispute-2'],
        sampleDisputeCaseIds: ['case-2'],
      },
    },
  ],
  traceability: {
    windowStart: new Date('2026-02-01T00:00:00.000Z'),
    windowEnd: new Date('2026-02-10T00:00:00.000Z'),
    eventCount: 5,
    distinctTraceCount: 2,
    firstOccurredAt: new Date('2026-02-01T10:00:00.000Z'),
    lastOccurredAt: new Date('2026-02-08T10:00:00.000Z'),
    sampleTraceIds: ['trace-dispute-1', 'trace-dispute-2'],
  },
};

const mxnReportFixture: MxnNetRecognizedFeeReport = {
  asOf: new Date('2026-02-10T00:00:00.000Z'),
  windowStart: new Date('2026-02-01T00:00:00.000Z'),
  windowEnd: new Date('2026-02-10T00:00:00.000Z'),
  headlineMxnNetRecognizedFeeMinor: 99000,
  convertedEventCount: 3,
  missingSnapshotEventCount: 1,
  currencies: [
    {
      sourceCurrency: 'USD',
      sourceNetRecognizedFeeMinor: 5600,
      mxnNetRecognizedFeeMinor: 95000,
      convertedEventCount: 2,
      missingSnapshotEventCount: 0,
      appliedSnapshots: [
        {
          snapshotId: 'fx-usd-mxn-2026-02-01',
          sourceCurrency: 'USD',
          rateToMxn: 17.35,
          effectiveAt: new Date('2026-02-01T00:00:00.000Z'),
        },
      ],
      sampleMissingSnapshotTraceIds: [],
    },
    {
      sourceCurrency: 'CLP',
      sourceNetRecognizedFeeMinor: 10000,
      mxnNetRecognizedFeeMinor: null,
      convertedEventCount: 0,
      missingSnapshotEventCount: 1,
      appliedSnapshots: [],
      sampleMissingSnapshotTraceIds: ['trace-mxn-missing-1'],
    },
  ],
  traceability: {
    windowStart: new Date('2026-02-01T00:00:00.000Z'),
    windowEnd: new Date('2026-02-10T00:00:00.000Z'),
    eventCount: 4,
    distinctTraceCount: 2,
    firstOccurredAt: new Date('2026-02-01T10:00:00.000Z'),
    lastOccurredAt: new Date('2026-02-09T10:00:00.000Z'),
    sampleTraceIds: ['trace-mxn-1'],
  },
};

const fxRatesFixture: DailyFxRateRecord[] = [
  {
    id: 'fx-rate-1',
    sourceCurrency: 'USD',
    quoteCurrency: 'MXN',
    effectiveDate: new Date('2026-02-01T00:00:00.000Z'),
    rateMicroMxn: 17_350_000,
    rateToMxn: 17.35,
    updatedReason: 'manual_review',
    updatedByUserId: 'admin-1',
    createdAt: new Date('2026-02-01T01:00:00.000Z'),
    updatedAt: new Date('2026-02-01T02:00:00.000Z'),
  },
];

const fxFlagsFixture: FxRateActionFlags = {
  checkedCurrencies: ['USD'],
  missingRates: [
    {
      sourceCurrency: 'USD',
      missingEventDates: ['2026-02-05'],
    },
  ],
  staleRates: [
    {
      sourceCurrency: 'USD',
      latestEffectiveDate: '2026-02-01',
      daysStale: 4,
    },
  ],
  hasActions: true,
};

const financialCaseLookupResultFixture: FinancialCaseLookupResult = {
  query: 'trace-01',
  normalizedQuery: 'trace-01',
  totalCaseCount: 3,
  returnedCaseCount: 1,
  resultLimit: 1,
  isResultLimitApplied: true,
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
      reasonCode: 'multiple_traces_matched',
      uiReason: 'disambiguationReasonMultipleTraces:2',
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
    routerReplaceMock.mockReset();
    routerRefreshMock.mockReset();
  });

  it('shows empty query state in financial case lookup dashboard', () => {
    render(
      <FinancialCaseLookupDashboard
        locale="en"
        selectedRange="30d"
        searchQuery=""
        result={null}
        labels={caseLookupLabels}
        summaryLabel={null}
        summaryLimitedHint={null}
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
          returnedCaseCount: 0,
          resultLimit: 20,
          isResultLimitApplied: false,
          cases: [],
          disambiguationGroups: [],
        }}
        labels={caseLookupLabels}
        summaryLabel="summaryLabel:0:0"
        summaryLimitedHint={null}
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
        summaryLabel="summaryLabel:1:3"
        summaryLimitedHint="summaryLimitedHint:1:3"
      />,
    );

    expect(screen.getAllByText('trace-01').length).toBeGreaterThan(0);
    expect(screen.getByText('disambiguationReasonMultipleTraces:2')).toBeInTheDocument();
    expect(screen.getByText('summaryLabel:1:3')).toBeInTheDocument();
    expect(screen.getByText('summaryLimitedHint:1:3')).toBeInTheDocument();
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

  it('renders net recognized fee dashboard summary and traceability details', () => {
    render(
      <NetRecognizedFeeDashboard
        locale="en"
        metrics={netRecognizedMetricsFixture}
        labels={netRecognizedFeeLabels}
        rangeOptions={[
          { value: '7d', label: '7d' },
          { value: '30d', label: '30d' },
        ]}
        selectedRange="30d"
      />,
    );

    expect(screen.getByText('sectionTitle')).toBeInTheDocument();
    expect(screen.getByText('sampleTracesScopeLabel:1:2')).toBeInTheDocument();
    expect(screen.getByText('trace-net-1')).toBeInTheDocument();
    expect(screen.getAllByText('manual_review')).not.toHaveLength(0);
  });

  it('renders debt/dispute exposure dashboard organizer and event rows', () => {
    render(
      <DebtDisputeExposureDashboard
        locale="en"
        metrics={debtDisputeExposureMetricsFixture}
        labels={debtDisputeExposureLabels}
      />,
    );

    expect(screen.getAllByText('Organizer One')).not.toHaveLength(0);
    expect(screen.getAllByText('Main Event')).not.toHaveLength(0);
    expect(screen.getAllByText('sampledTraceCountLabel:1')).not.toHaveLength(0);
    expect(screen.getAllByText('sampledCaseCountLabel:1')).not.toHaveLength(0);
    expect(screen.getAllByText('trace-dispute-1')).not.toHaveLength(0);
    expect(screen.getAllByText('case-1')).not.toHaveLength(0);
  });

  it('renders mxn reporting table rows and not-converted fallback label', () => {
    render(
      <MxnReportingDashboard
        locale="en"
        report={mxnReportFixture}
        labels={mxnReportingLabels}
      />,
    );

    expect(screen.getByText('sectionTitle')).toBeInTheDocument();
    expect(
      screen.getAllByTitle('fx-usd-mxn-2026-02-01 (Feb 1, 2026 · 17.3500)'),
    ).not.toHaveLength(0);
    expect(screen.getAllByText('trace-mxn-missing-1')).not.toHaveLength(0);
    expect(screen.getAllByText('notConvertedLabel')).not.toHaveLength(0);
  });

  it('renders fx rate management action flags, form inputs, and rates table', () => {
    const upsertActionMock = jest.fn().mockResolvedValue({
      ok: true,
      data: { rateId: 'fx-rate-created' },
    });

    render(
      <FxRateManagementDashboard
        locale="en"
        rates={fxRatesFixture}
        flags={fxFlagsFixture}
        labels={fxRateManagementLabels}
        upsertAction={upsertActionMock}
      />,
    );

    expect(screen.getByText(/missingTitle:\s*USD/)).toBeInTheDocument();
    expect(screen.getByText(/staleTitle:\s*USD/)).toBeInTheDocument();
    expect(screen.getByLabelText('currencyFieldLabel')).toBeInTheDocument();
    expect(screen.getByLabelText('fxDatePicker')).toBeInTheDocument();
    expect(screen.getAllByText('manual_review')).not.toHaveLength(0);
  });

  it('renders fx rate dashboard no-action and empty-rates states', () => {
    render(
      <FxRateManagementDashboard
        locale="en"
        rates={[]}
        flags={{
          checkedCurrencies: [],
          missingRates: [],
          staleRates: [],
          hasActions: false,
        }}
        labels={fxRateManagementLabels}
        upsertAction={async () => ({ ok: true, data: { rateId: 'fx-rate-created' } })}
      />,
    );

    expect(screen.getByText('noActions')).toBeInTheDocument();
    expect(screen.getByText('emptyRates')).toBeInTheDocument();
  });

  it('submits fx upsert through form action payload', async () => {
    const upsertActionMock = jest.fn().mockResolvedValue({
      ok: true,
      data: { rateId: 'fx-rate-created' },
    });

    render(
      <FxRateManagementDashboard
        locale="en"
        rates={fxRatesFixture}
        flags={fxFlagsFixture}
        labels={fxRateManagementLabels}
        upsertAction={upsertActionMock}
      />,
    );

    fireEvent.change(screen.getByLabelText('currencyFieldLabel'), {
      target: { value: 'usd' },
    });
    fireEvent.change(screen.getByLabelText('fxDatePicker'), {
      target: { value: '2026-02-06' },
    });
    fireEvent.change(screen.getByLabelText('rateFieldLabel'), {
      target: { value: '17.250000' },
    });
    fireEvent.change(screen.getByLabelText('reasonFieldLabel'), {
      target: { value: 'manual_review' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'submitLabel' }));

    await waitFor(() => {
      expect(upsertActionMock).toHaveBeenCalledWith({
        sourceCurrency: 'usd',
        effectiveDate: '2026-02-06',
        rateToMxn: '17.250000',
        reason: 'manual_review',
      });
    });
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

    expect(screen.getAllByText('ownershipStateActionNeededLabel').length).toBeGreaterThan(0);
    expect(screen.getAllByText('support.review_complete').length).toBeGreaterThan(0);
    expect(screen.getAllByText('payout_request:payout-001').length).toBeGreaterThan(0);
    expect(screen.getAllByText('fp-v2')).not.toHaveLength(0);
    expect(screen.getAllByText('organizer@example.com')).not.toHaveLength(0);
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
      expect(
        screen.getByText('policyDeniedPrefix: errorMessageForCode:ARTIFACT_TRACE_NOT_FOUND'),
      ).toBeInTheDocument();
    });
  });

  it('maps validation codes to localized field copy and validation fallback', async () => {
    runArtifactGovernanceAdminActionMock.mockResolvedValue({
      ok: false,
      error: 'INVALID_INPUT',
      message: 'VALIDATION_FAILED',
      fieldErrors: {
        traceId: ['REQUIRED_FIELD'],
        artifactVersion: ['INVALID_NUMBER'],
      },
    });

    render(
      <ArtifactGovernanceDashboard
        locale="en"
        initialSummary={{ versions: [], deliveries: [] }}
        labels={governanceLabels}
      />,
    );

    fireEvent.change(screen.getByLabelText('operationFieldLabel'), {
      target: { value: 'resend' },
    });
    fireEvent.change(screen.getByLabelText('reasonFieldLabel'), {
      target: { value: 'manual_review' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'submitLabel' }));

    await waitFor(() => {
      expect(screen.getByText('requiredFieldMessage')).toBeInTheDocument();
    });

    expect(screen.getByText('invalidNumberMessage')).toBeInTheDocument();
    expect(screen.getByText('validationFallbackMessage')).toBeInTheDocument();
    expect(screen.queryByText('Validation failed')).not.toBeInTheDocument();
  });

  it('falls back to safe translated copy for unknown validation codes', async () => {
    runArtifactGovernanceAdminActionMock.mockResolvedValue({
      ok: false,
      error: 'INVALID_INPUT',
      message: 'RAW_BACKEND_MESSAGE',
      fieldErrors: {
        traceId: ['RAW_ZOD_MESSAGE'],
      },
    });

    render(
      <ArtifactGovernanceDashboard
        locale="en"
        initialSummary={{ versions: [], deliveries: [] }}
        labels={governanceLabels}
      />,
    );

    fireEvent.change(screen.getByLabelText('reasonFieldLabel'), {
      target: { value: 'manual_review' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'submitLabel' }));

    await waitFor(() => {
      expect(screen.getAllByText('validationFallbackMessage').length).toBeGreaterThanOrEqual(1);
    });

    expect(screen.queryByText('RAW_BACKEND_MESSAGE')).not.toBeInTheDocument();
    expect(screen.queryByText('RAW_ZOD_MESSAGE')).not.toBeInTheDocument();
  });
});
