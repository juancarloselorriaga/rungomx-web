/** @jest-environment jsdom */

import AdminPaymentsPage from '@/app/[locale]/(admin)/admin/payments/page';
import { getAuthContext } from '@/lib/auth/server';
import { getArtifactGovernanceSummary } from '@/lib/payments/artifacts/governance';
import { getAdminDebtDisputeExposureMetrics } from '@/lib/payments/economics/debt-dispute-exposure';
import {
  getFxRateActionFlagsForAdmin,
  listDailyFxRatesForAdmin,
  listEventTimeFxSnapshotsFromDailyRates,
} from '@/lib/payments/economics/fx-rate-management';
import { getAdminMxnNetRecognizedFeeReport } from '@/lib/payments/economics/mxn-reporting';
import { getAdminNetRecognizedFeeMetrics } from '@/lib/payments/economics/net-recognized-fees';
import { lookupFinancialCases } from '@/lib/payments/support/case-lookup';
import { buildFinancialEvidencePack } from '@/lib/payments/support/evidence-pack';
import { getAdminPaymentCaptureVolumeMetrics } from '@/lib/payments/volume/payment-capture-volume';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

jest.mock('@/utils/config-page-locale', () => ({
  configPageLocale: jest.fn(async () => undefined),
}));

jest.mock('@/utils/seo', () => ({
  createLocalizedPageMetadata: jest.fn(),
}));

jest.mock('next-intl/server', () => ({
  getTranslations: jest.fn(async () => {
    const translator = ((key: string) => key) as ((key: string) => string) & {
      raw: (key: string) => string;
    };
    translator.raw = (key: string) => key;
    return translator;
  }),
}));

jest.mock('@/i18n/navigation', () => ({
  getPathname: jest.fn(() => '/admin'),
}));

jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
  useRouter: () => ({ replace: jest.fn() }),
  usePathname: () => '/admin/payments',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: { children: ReactNode }) => <button {...props}>{children}</button>,
}));

jest.mock('@/components/admin/dashboard/admin-dashboard-range-selector', () => ({
  AdminDashboardRangeSelector: () => <div data-testid="admin-range-selector">range-selector</div>,
}));

jest.mock('@/components/admin/payments/artifact-governance-dashboard', () => ({
  ArtifactGovernanceDashboard: () => <div>artifact-governance-dashboard</div>,
}));

jest.mock('@/components/admin/payments/debt-dispute-exposure-dashboard', () => ({
  DebtDisputeExposureDashboard: () => <div>debt-dispute-exposure-dashboard</div>,
}));

jest.mock('@/components/admin/payments/evidence-pack-review-dashboard', () => ({
  EvidencePackReviewDashboard: () => <div>evidence-pack-review-dashboard</div>,
}));

jest.mock('@/components/admin/payments/financial-case-lookup-dashboard', () => ({
  FinancialCaseLookupDashboard: () => <div>financial-case-lookup-dashboard</div>,
}));

jest.mock('@/components/admin/payments/fx-rate-management-dashboard', () => ({
  FxRateManagementDashboard: () => <div>fx-rate-management-dashboard</div>,
}));

jest.mock('@/components/admin/payments/mxn-reporting-dashboard', () => ({
  MxnReportingDashboard: () => <div>mxn-reporting-dashboard</div>,
}));

jest.mock('@/components/admin/payments/net-recognized-fee-dashboard', () => ({
  NetRecognizedFeeDashboard: () => <div>net-recognized-fee-dashboard</div>,
}));

jest.mock('@/components/admin/payments/payment-capture-volume-dashboard', () => ({
  PaymentCaptureVolumeDashboard: () => <div>payment-capture-volume-dashboard</div>,
}));

jest.mock('@/components/admin/payments/admin-investigation-controls', () => ({
  AdminInvestigationOpenTraceButton: () => <button>open-trace</button>,
  AdminInvestigationToolSwitcher: () => <div>investigation-tool-switcher</div>,
}));

jest.mock('@/db', () => ({
  db: (() => {
    const groupBy = jest.fn(async () => []);
    const where = jest.fn(() => ({ groupBy }));
    const from = jest.fn(() => ({ where }));
    const select = jest.fn(() => ({ from }));

    return {
      select,
    };
  })(),
}));

jest.mock('@/db/schema', () => ({
  moneyEvents: {
    eventName: 'event_name',
    occurredAt: 'occurred_at',
  },
}));

jest.mock('@/lib/auth/server', () => ({
  getAuthContext: jest.fn(),
}));

jest.mock('@/lib/payments/artifacts/governance', () => ({
  getArtifactGovernanceSummary: jest.fn(),
}));

jest.mock('@/lib/payments/economics/debt-dispute-exposure', () => ({
  getAdminDebtDisputeExposureMetrics: jest.fn(),
}));

jest.mock('@/lib/payments/economics/fx-rate-management', () => ({
  getFxRateActionFlagsForAdmin: jest.fn(),
  listDailyFxRatesForAdmin: jest.fn(),
  listEventTimeFxSnapshotsFromDailyRates: jest.fn(),
}));

jest.mock('@/lib/payments/economics/mxn-reporting', () => ({
  getAdminMxnNetRecognizedFeeReport: jest.fn(),
}));

jest.mock('@/lib/payments/economics/net-recognized-fees', () => ({
  getAdminNetRecognizedFeeMetrics: jest.fn(),
}));

jest.mock('@/lib/payments/volume/payment-capture-volume', () => ({
  getAdminPaymentCaptureVolumeMetrics: jest.fn(),
}));

jest.mock('@/lib/payments/support/case-lookup', () => ({
  lookupFinancialCases: jest.fn(),
}));

jest.mock('@/lib/payments/support/evidence-pack', () => ({
  buildFinancialEvidencePack: jest.fn(),
}));

const mockGetAuthContext = getAuthContext as jest.MockedFunction<typeof getAuthContext>;
const mockGetAdminNetRecognizedFeeMetrics =
  getAdminNetRecognizedFeeMetrics as jest.MockedFunction<typeof getAdminNetRecognizedFeeMetrics>;
const mockGetAdminDebtDisputeExposureMetrics =
  getAdminDebtDisputeExposureMetrics as jest.MockedFunction<typeof getAdminDebtDisputeExposureMetrics>;
const mockListDailyFxRatesForAdmin =
  listDailyFxRatesForAdmin as jest.MockedFunction<typeof listDailyFxRatesForAdmin>;
const mockGetFxRateActionFlagsForAdmin =
  getFxRateActionFlagsForAdmin as jest.MockedFunction<typeof getFxRateActionFlagsForAdmin>;
const mockListEventTimeFxSnapshotsFromDailyRates =
  listEventTimeFxSnapshotsFromDailyRates as jest.MockedFunction<
    typeof listEventTimeFxSnapshotsFromDailyRates
  >;
const mockGetArtifactGovernanceSummary =
  getArtifactGovernanceSummary as jest.MockedFunction<typeof getArtifactGovernanceSummary>;
const mockLookupFinancialCases =
  lookupFinancialCases as jest.MockedFunction<typeof lookupFinancialCases>;
const mockBuildFinancialEvidencePack =
  buildFinancialEvidencePack as jest.MockedFunction<typeof buildFinancialEvidencePack>;
const mockGetAdminMxnNetRecognizedFeeReport =
  getAdminMxnNetRecognizedFeeReport as jest.MockedFunction<typeof getAdminMxnNetRecognizedFeeReport>;
const mockGetAdminPaymentCaptureVolumeMetrics =
  getAdminPaymentCaptureVolumeMetrics as jest.MockedFunction<
    typeof getAdminPaymentCaptureVolumeMetrics
  >;

describe('admin payments page workspace semantics', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockGetAuthContext.mockResolvedValue({
      user: { id: 'staff-user' },
      permissions: {
        canAccessAdminArea: true,
        canAccessUserArea: true,
        canManageUsers: true,
        canManageEvents: true,
        canViewStaffTools: true,
        canViewOrganizersDashboard: false,
        canViewAthleteDashboard: false,
      },
    } as Awaited<ReturnType<typeof getAuthContext>>);

    mockGetAdminNetRecognizedFeeMetrics.mockResolvedValue({
      asOf: new Date('2026-03-10T00:00:00.000Z'),
      windowStart: new Date('2026-03-01T00:00:00.000Z'),
      windowEnd: new Date('2026-03-10T00:00:00.000Z'),
      headlineCurrency: 'MXN',
      headlineCapturedFeeMinor: 100,
      headlineAdjustmentsMinor: 0,
      headlineNetRecognizedFeeMinor: 100,
      currencies: [],
      adjustments: [],
      traceability: {
        windowStart: new Date('2026-03-01T00:00:00.000Z'),
        windowEnd: new Date('2026-03-10T00:00:00.000Z'),
        eventCount: 0,
        distinctTraceCount: 0,
        firstOccurredAt: null,
        lastOccurredAt: null,
        sampleTraceIds: [],
      },
    });

    mockGetAdminDebtDisputeExposureMetrics.mockResolvedValue({
      asOf: new Date('2026-03-10T00:00:00.000Z'),
      windowStart: new Date('2026-03-01T00:00:00.000Z'),
      windowEnd: new Date('2026-03-10T00:00:00.000Z'),
      totals: {
        openDisputeCaseCount: 0,
        pauseRequiredCount: 0,
        resumeAllowedCount: 0,
        headlineCurrency: 'MXN',
        headlineOpenDisputeAtRiskMinor: 0,
        headlineDebtPostedMinor: 0,
        headlineExposureScoreMinor: 0,
        currencies: [],
      },
      organizers: [],
      events: [],
      traceability: {
        windowStart: new Date('2026-03-01T00:00:00.000Z'),
        windowEnd: new Date('2026-03-10T00:00:00.000Z'),
        eventCount: 0,
        distinctTraceCount: 0,
        firstOccurredAt: null,
        lastOccurredAt: null,
        sampleTraceIds: [],
      },
    });

    mockListDailyFxRatesForAdmin.mockResolvedValue([]);
    mockGetFxRateActionFlagsForAdmin.mockResolvedValue({
      checkedCurrencies: [],
      missingRates: [],
      staleRates: [],
      hasActions: false,
    });
    mockListEventTimeFxSnapshotsFromDailyRates.mockResolvedValue([]);
    mockGetArtifactGovernanceSummary.mockResolvedValue({
      versions: [],
      deliveries: [],
    });
    mockLookupFinancialCases.mockResolvedValue({
      query: '',
      normalizedQuery: '',
      totalCaseCount: 0,
      returnedCaseCount: 0,
      resultLimit: 20,
      isResultLimitApplied: false,
      cases: [],
      disambiguationGroups: [],
    });
    mockBuildFinancialEvidencePack.mockResolvedValue(null);
    mockGetAdminMxnNetRecognizedFeeReport.mockResolvedValue({
      asOf: new Date('2026-03-10T00:00:00.000Z'),
      windowStart: new Date('2026-03-01T00:00:00.000Z'),
      windowEnd: new Date('2026-03-10T00:00:00.000Z'),
      headlineMxnNetRecognizedFeeMinor: 0,
      convertedEventCount: 0,
      missingSnapshotEventCount: 0,
      currencies: [],
      traceability: {
        windowStart: new Date('2026-03-01T00:00:00.000Z'),
        windowEnd: new Date('2026-03-10T00:00:00.000Z'),
        eventCount: 0,
        distinctTraceCount: 0,
        firstOccurredAt: null,
        lastOccurredAt: null,
        sampleTraceIds: [],
      },
    });
    mockGetAdminPaymentCaptureVolumeMetrics.mockResolvedValue({
      asOf: new Date('2026-03-10T00:00:00.000Z'),
      windowStart: new Date('2026-03-01T00:00:00.000Z'),
      windowEnd: new Date('2026-03-10T00:00:00.000Z'),
      headlineCurrency: 'MXN',
      headlineGrossProcessedMinor: 10_000,
      headlinePlatformFeeMinor: 500,
      headlineOrganizerProceedsMinor: 9_500,
      headlineCaptureCount: 1,
      currencies: [],
      organizers: [],
      organizerPagination: {
        page: 1,
        pageSize: 5,
        total: 0,
        pageCount: 0,
      },
      excludedEvents: [],
      traceability: {
        windowStart: new Date('2026-03-01T00:00:00.000Z'),
        windowEnd: new Date('2026-03-10T00:00:00.000Z'),
        eventCount: 1,
        distinctTraceCount: 1,
        firstOccurredAt: new Date('2026-03-05T10:00:00.000Z'),
        lastOccurredAt: new Date('2026-03-05T10:00:00.000Z'),
        sampleTraceIds: ['trace-1'],
        excludedEventCount: 0,
      },
    });
  });

  async function renderPage(searchParams?: Record<string, string>) {
    const page = await AdminPaymentsPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve(searchParams ?? {}),
    });

    return render(page);
  }

  it('renders navigation in the expected visible order', async () => {
    await renderPage({ workspace: 'volume' });

    expect(screen.getAllByRole('button').map((node) => node.textContent)).toEqual([
      'nav.volumeLabel',
      'nav.economicsLabel',
      'nav.riskLabel',
      'nav.operationsLabel',
      'nav.investigationLabel',
    ]);
  });

  it('renders the repository-backed volume workspace', async () => {
    await renderPage({ workspace: 'volume', organizerPage: '2' });

    expect(screen.getByText('payment-capture-volume-dashboard')).toBeInTheDocument();
    expect(screen.queryByText('net-recognized-fee-dashboard')).not.toBeInTheDocument();
    expect(screen.getByTestId('admin-range-selector')).toBeInTheDocument();
    expect(mockGetAdminPaymentCaptureVolumeMetrics).toHaveBeenCalledWith(
      expect.objectContaining({ days: 30, organizerPage: 2, organizerPageSize: 5 }),
    );
    expect(mockGetAdminNetRecognizedFeeMetrics).not.toHaveBeenCalled();
    expect(mockGetAdminDebtDisputeExposureMetrics).not.toHaveBeenCalled();
    expect(mockListDailyFxRatesForAdmin).not.toHaveBeenCalled();
    expect(mockGetFxRateActionFlagsForAdmin).not.toHaveBeenCalled();
    expect(mockListEventTimeFxSnapshotsFromDailyRates).not.toHaveBeenCalled();
    expect(mockGetArtifactGovernanceSummary).not.toHaveBeenCalled();
    expect(mockLookupFinancialCases).not.toHaveBeenCalled();
    expect(mockBuildFinancialEvidencePack).not.toHaveBeenCalled();
    expect(mockGetAdminMxnNetRecognizedFeeReport).not.toHaveBeenCalled();
  });

  it('renders the economics branch for the economics workspace', async () => {
    await renderPage({ workspace: 'economics' });

    expect(screen.getByText('overview.heroEyebrow')).toBeInTheDocument();
    expect(screen.getByText('net-recognized-fee-dashboard')).toBeInTheDocument();
    expect(screen.getByText('mxn-reporting-dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('admin-range-selector')).toBeInTheDocument();
  });

  it('renders risk breakdown before passive review guidance', async () => {
    mockGetAdminDebtDisputeExposureMetrics.mockResolvedValueOnce({
      asOf: new Date('2026-03-10T00:00:00.000Z'),
      windowStart: new Date('2026-03-01T00:00:00.000Z'),
      windowEnd: new Date('2026-03-10T00:00:00.000Z'),
      totals: {
        openDisputeCaseCount: 2,
        pauseRequiredCount: 1,
        resumeAllowedCount: 0,
        headlineCurrency: 'MXN',
        headlineOpenDisputeAtRiskMinor: 1000,
        headlineDebtPostedMinor: 2000,
        headlineExposureScoreMinor: 3000,
        currencies: [
          {
            currency: 'MXN',
            openDisputeAtRiskMinor: 1000,
            debtPostedMinor: 2000,
            exposureScoreMinor: 3000,
          },
        ],
      },
      organizers: [
        {
          organizerId: 'org-1',
          organizerLabel: 'Organizer 1',
          headlineCurrency: 'MXN',
          headlineExposureScoreMinor: 3000,
          headlineOpenDisputeAtRiskMinor: 1000,
          headlineDebtPostedMinor: 2000,
          openDisputeCaseCount: 2,
          pauseRequiredCount: 1,
          resumeAllowedCount: 0,
          traceability: {
            distinctTraceCount: 1,
            distinctDisputeCaseCount: 1,
            sampleTraceIds: ['trace-1'],
            sampleDisputeCaseIds: ['case-1'],
          },
          currencies: [
            {
              currency: 'MXN',
              openDisputeAtRiskMinor: 1000,
              debtPostedMinor: 2000,
              exposureScoreMinor: 3000,
            },
          ],
        },
      ],
      events: [],
      traceability: {
        windowStart: new Date('2026-03-01T00:00:00.000Z'),
        windowEnd: new Date('2026-03-10T00:00:00.000Z'),
        eventCount: 1,
        distinctTraceCount: 1,
        firstOccurredAt: new Date('2026-03-05T10:00:00.000Z'),
        lastOccurredAt: new Date('2026-03-05T10:00:00.000Z'),
        sampleTraceIds: ['trace-1'],
      },
    });

    const view = await renderPage({ workspace: 'risk' });

    expect(screen.getByText('debt-dispute-exposure-dashboard')).toBeInTheDocument();
    expect(view.container.innerHTML.indexOf('debt-dispute-exposure-dashboard')).toBeLessThan(
      view.container.innerHTML.indexOf('risk.reviewTitle'),
    );
  });

  it('renders operations tools before passive guidance', async () => {
    const view = await renderPage({ workspace: 'operations' });

    expect(screen.getByText('fx-rate-management-dashboard')).toBeInTheDocument();
    expect(screen.getByText('artifact-governance-dashboard')).toBeInTheDocument();
    expect(view.container.innerHTML.indexOf('fx-rate-management-dashboard')).toBeLessThan(
      view.container.innerHTML.indexOf('sections.operationsNote'),
    );
  });

  it('renders investigation lookup before help content', async () => {
    const view = await renderPage({ workspace: 'investigation' });

    expect(screen.getByText('financial-case-lookup-dashboard')).toBeInTheDocument();
    expect(view.container.innerHTML.indexOf('financial-case-lookup-dashboard')).toBeLessThan(
      view.container.innerHTML.indexOf('investigation.helpTitle'),
    );
  });
});
