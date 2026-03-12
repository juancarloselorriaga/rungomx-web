import { upsertDailyFxRateAdminAction } from '@/app/actions/admin-payments-fx';
import {
  AdminPaymentsWorkspaceId,
  AdminPaymentsWorkspaceShell,
} from '@/components/admin/payments/admin-payments-workspace-shell';
import {
  AdminInvestigationOpenTraceButton,
  AdminInvestigationToolSwitcher,
} from '@/components/admin/payments/admin-investigation-controls';
import { ArtifactGovernanceDashboard } from '@/components/admin/payments/artifact-governance-dashboard';
import {
  AdminDashboardRangeSelector,
} from '@/components/admin/dashboard/admin-dashboard-range-selector';
import { DebtDisputeExposureDashboard } from '@/components/admin/payments/debt-dispute-exposure-dashboard';
import { EvidencePackReviewDashboard } from '@/components/admin/payments/evidence-pack-review-dashboard';
import { FinancialCaseLookupDashboard } from '@/components/admin/payments/financial-case-lookup-dashboard';
import { FxRateManagementDashboard } from '@/components/admin/payments/fx-rate-management-dashboard';
import { MxnReportingDashboard } from '@/components/admin/payments/mxn-reporting-dashboard';
import { NetRecognizedFeeDashboard } from '@/components/admin/payments/net-recognized-fee-dashboard';
import { PaymentCaptureVolumeDashboard } from '@/components/admin/payments/payment-capture-volume-dashboard';
import { getPathname } from '@/i18n/navigation';
import { getAuthContext } from '@/lib/auth/server';
import { db } from '@/db';
import { moneyEvents } from '@/db/schema';
import {
  adminPaymentsRangeSelectorWorkspaceIds,
  normalizeAdminPaymentsWorkspace,
} from '@/lib/payments/admin/workspaces';
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
import { buildFinancialEvidencePack, type EvidencePackViewRole } from '@/lib/payments/support/evidence-pack';
import { getAdminPaymentCaptureVolumeMetrics } from '@/lib/payments/volume/payment-capture-volume';
import { type AppLocale } from '@/i18n/routing';
import { LocalePageProps } from '@/types/next';
import { formatMoneyFromMinor } from '@/lib/utils/format-money';
import { configPageLocale } from '@/utils/config-page-locale';
import { createLocalizedPageMetadata } from '@/utils/seo';
import { and, gte, inArray, lte, sql } from 'drizzle-orm';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

export async function generateMetadata({ params }: LocalePageProps): Promise<Metadata> {
  const { locale } = await params;
  return createLocalizedPageMetadata(
    locale,
    '/admin/payments',
    (messages) => messages.Pages?.AdminPayments?.metadata,
    {
      robots: {
        index: false,
        follow: false,
      },
    },
  );
}

type AdminPaymentsSearchParams = Record<string, string | string[] | undefined>;

type AdminPaymentsPageProps = LocalePageProps & {
  searchParams?: Promise<AdminPaymentsSearchParams>;
};

const DEFAULT_RANGE: '7d' | '14d' | '30d' = '30d';

function normalizeRange(rawRange: string | undefined): '7d' | '14d' | '30d' {
  if (rawRange === '7d' || rawRange === '14d' || rawRange === '30d') {
    return rawRange;
  }
  return DEFAULT_RANGE;
}

function rangeToDays(range: '7d' | '14d' | '30d'): number {
  switch (range) {
    case '7d':
      return 7;
    case '14d':
      return 14;
    case '30d':
    default:
      return 30;
  }
}

function normalizePositivePage(rawValue: string | undefined): number {
  if (!rawValue) return 1;
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }
  return parsed;
}

function toSingleValueSearchParamMap(
  searchParams: AdminPaymentsSearchParams,
): Record<string, string> {
  return Object.entries(searchParams).reduce<Record<string, string>>((accumulator, [key, value]) => {
    if (typeof value === 'string') {
      accumulator[key] = value;
      return accumulator;
    }

    if (Array.isArray(value) && value[0]) {
      accumulator[key] = value[0];
    }

    return accumulator;
  }, {});
}

function normalizeInvestigationTool(
  rawTool: string | undefined,
  hasSelectedTrace: boolean,
): 'lookup' | 'trace' {
  if (rawTool === 'lookup' || rawTool === 'trace') {
    return rawTool;
  }

  return hasSelectedTrace ? 'trace' : 'lookup';
}

function formatDateTime(value: Date | string | null | undefined, locale: 'es' | 'en'): string {
  if (!value) return '—';
  const normalized = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(normalized.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(normalized);
}

const adminPaymentsContextEventNames = [
  'payment.captured',
  'financial.adjustment_posted',
  'payout.requested',
  'payout.processing',
  'payout.paused',
  'payout.resumed',
  'payout.completed',
  'payout.failed',
] as const;

type AdminPaymentsContextSummary = {
  capturedCount: number;
  adjustmentCount: number;
  payoutLifecycleCount: number;
};

async function getAdminPaymentsContextSummary(params: {
  windowStart: Date;
  windowEnd: Date;
}): Promise<AdminPaymentsContextSummary> {
  const rows = await db
    .select({
      eventName: moneyEvents.eventName,
      count: sql<number>`count(*)::int`,
    })
    .from(moneyEvents)
    .where(
      and(
        inArray(moneyEvents.eventName, adminPaymentsContextEventNames),
        gte(moneyEvents.occurredAt, params.windowStart),
        lte(moneyEvents.occurredAt, params.windowEnd),
      ),
    )
    .groupBy(moneyEvents.eventName);

  let capturedCount = 0;
  let adjustmentCount = 0;
  let payoutLifecycleCount = 0;

  for (const row of rows) {
    const count = Number(row.count);
    if (row.eventName === 'payment.captured') {
      capturedCount += count;
    } else if (row.eventName === 'financial.adjustment_posted') {
      adjustmentCount += count;
    } else {
      payoutLifecycleCount += count;
    }
  }

  return {
    capturedCount,
    adjustmentCount,
    payoutLifecycleCount,
  };
}

export default async function AdminPaymentsEconomicsPage({
  params,
  searchParams,
}: AdminPaymentsPageProps) {
  const { locale } = await params;
  await configPageLocale(params, { pathname: '/admin/payments' });
  const authContext = await getAuthContext();

  if (!authContext.permissions.canViewStaffTools) {
    redirect(getPathname({ href: '/admin', locale }));
  }

  async function upsertFxRateFormAction(formData: FormData): Promise<void> {
    'use server';
    await upsertDailyFxRateAdminAction(formData);
  }

  const tDashboardRanges = await getTranslations('pages.dashboard.admin.metrics.ranges');
  const tPayments = await getTranslations('pages.adminPayments.admin.payments');
  const resolvedSearchParams: AdminPaymentsSearchParams = searchParams
    ? await searchParams
    : {};
  const rangeParam = resolvedSearchParams.range;
  const caseQueryParam = resolvedSearchParams.caseQuery;
  const lookupQueryParam = resolvedSearchParams.lookupQuery;
  const evidenceTraceIdParam = resolvedSearchParams.evidenceTraceId;
  const workspaceParam = resolvedSearchParams.workspace;
  const rawRange =
    typeof rangeParam === 'string'
      ? rangeParam
      : Array.isArray(rangeParam)
        ? rangeParam[0]
        : undefined;
  const rawWorkspace =
    typeof workspaceParam === 'string'
      ? workspaceParam
      : Array.isArray(workspaceParam)
        ? workspaceParam[0]
        : undefined;
  const organizerPageParam = resolvedSearchParams.organizerPage;
  const investigationToolParam = resolvedSearchParams.investigationTool;
  const primaryCaseQuery =
    typeof caseQueryParam === 'string'
      ? caseQueryParam
      : Array.isArray(caseQueryParam)
        ? caseQueryParam[0] ?? ''
        : '';
  const fallbackLookupQuery =
    typeof lookupQueryParam === 'string'
      ? lookupQueryParam
      : Array.isArray(lookupQueryParam)
        ? lookupQueryParam[0] ?? ''
        : '';
  const caseQuery = primaryCaseQuery || fallbackLookupQuery;
  const evidenceTraceId =
    typeof evidenceTraceIdParam === 'string'
      ? evidenceTraceIdParam
      : Array.isArray(evidenceTraceIdParam)
        ? evidenceTraceIdParam[0] ?? ''
        : '';
  const rawInvestigationTool =
    typeof investigationToolParam === 'string'
      ? investigationToolParam
      : Array.isArray(investigationToolParam)
        ? investigationToolParam[0]
        : undefined;
  const evidenceViewRole: EvidencePackViewRole = authContext.permissions.canManageUsers
    ? 'admin'
    : 'support';
  const selectedRange = normalizeRange(rawRange);
  const activeWorkspace = normalizeAdminPaymentsWorkspace(rawWorkspace);
  const organizerPage =
    typeof organizerPageParam === 'string'
      ? normalizePositivePage(organizerPageParam)
      : Array.isArray(organizerPageParam)
        ? normalizePositivePage(organizerPageParam[0])
        : 1;
  const activeInvestigationTool = normalizeInvestigationTool(
    rawInvestigationTool,
    evidenceTraceId.trim().length > 0,
  );
  const rangeDays = rangeToDays(selectedRange);
  const volumeQueryState = toSingleValueSearchParamMap(resolvedSearchParams);
  const rangeOptions = [
    { value: '7d' as const, label: tDashboardRanges('last7days') },
    { value: '14d' as const, label: tDashboardRanges('last14days') },
    { value: '30d' as const, label: tDashboardRanges('last30days') },
  ];
  const workspaceItems = [
    {
      id: 'volume' as const,
      label: tPayments('nav.volumeLabel'),
      description: tPayments('nav.volumeDescription'),
    },
    {
      id: 'economics' as const,
      label: tPayments('nav.economicsLabel'),
      description: tPayments('nav.economicsDescription'),
    },
    {
      id: 'risk' as const,
      label: tPayments('nav.riskLabel'),
      description: tPayments('nav.riskDescription'),
    },
    {
      id: 'operations' as const,
      label: tPayments('nav.operationsLabel'),
      description: tPayments('nav.operationsDescription'),
    },
    {
      id: 'investigation' as const,
      label: tPayments('nav.investigationLabel'),
      description: tPayments('nav.investigationDescription'),
    },
  ] satisfies Array<{
    id: AdminPaymentsWorkspaceId;
    label: string;
    description: string;
  }>;

  if (activeWorkspace === 'volume') {
    const volumeMetrics = await getAdminPaymentCaptureVolumeMetrics({
      days: rangeDays,
      organizerPage,
      organizerPageSize: 5,
    });
    const contextSummary = await getAdminPaymentsContextSummary({
      windowStart: volumeMetrics.windowStart,
      windowEnd: volumeMetrics.windowEnd,
    });
    const hasPayoutOnlyContext =
      contextSummary.capturedCount === 0 &&
      contextSummary.adjustmentCount === 0 &&
      contextSummary.payoutLifecycleCount > 0;
    const volumeLabels = {
      sectionTitle: tPayments('volume.sectionTitle'),
      sectionDescription: tPayments('volume.sectionDescription'),
      mixedCurrencyNotice: (currency: string) =>
        tPayments('volume.mixedCurrencyNotice', {
          currency,
        }),
      grossProcessedLabel: tPayments('volume.grossProcessedLabel'),
      grossProcessedDescription: tPayments('volume.grossProcessedDescription'),
      platformFeesLabel: tPayments('volume.platformFeesLabel'),
      platformFeesDescription: tPayments('volume.platformFeesDescription'),
      organizerProceedsLabel: tPayments('volume.organizerProceedsLabel'),
      organizerProceedsDescription: tPayments('volume.organizerProceedsDescription'),
      capturedPaymentsLabel: tPayments('volume.capturedPaymentsLabel'),
      capturedPaymentsDescription: tPayments('volume.capturedPaymentsDescription'),
      currenciesTitle: tPayments('volume.currenciesTitle'),
      currenciesDescription: tPayments('volume.currenciesDescription'),
      currencyHeader: tPayments('volume.currencyHeader'),
      grossHeader: tPayments('volume.grossHeader'),
      feesHeader: tPayments('volume.feesHeader'),
      proceedsHeader: tPayments('volume.proceedsHeader'),
      countHeader: tPayments('volume.countHeader'),
      emptyCurrencies: tPayments('volume.emptyCurrencies'),
      traceabilityTitle: tPayments('volume.traceabilityTitle'),
      traceabilityDescription: tPayments('volume.traceabilityDescription'),
      traceabilityWindowLabel: tPayments('volume.traceabilityWindowLabel'),
      traceabilityEventsLabel: tPayments('volume.traceabilityEventsLabel'),
      traceabilityTracesLabel: tPayments('volume.traceabilityTracesLabel'),
      traceabilityExcludedLabel: tPayments('volume.traceabilityExcludedLabel'),
      traceabilityFirstEventLabel: tPayments('volume.traceabilityFirstEventLabel'),
      traceabilityLastEventLabel: tPayments('volume.traceabilityLastEventLabel'),
      sampleTracesTitle: tPayments('volume.sampleTracesTitle'),
      sampleTracesEmpty: tPayments('volume.sampleTracesEmpty'),
      sampleTracesScopeLabel: (shown: number, total: number) =>
        tPayments('sampledReferences.traceScope', {
          shown,
          total,
        }),
      sampleTracesMoreLabel: (count: number) =>
        tPayments('sampledReferences.moreLabel', {
          count,
        }),
      topOrganizersTitle: tPayments('volume.topOrganizersTitle'),
      topOrganizersDescription: tPayments('volume.topOrganizersDescription'),
      organizerHeader: tPayments('volume.organizerHeader'),
      organizerGrossHeader: tPayments('volume.organizerGrossHeader'),
      organizerFeesHeader: tPayments('volume.organizerFeesHeader'),
      organizerProceedsHeader: tPayments('volume.organizerProceedsHeader'),
      organizerCountHeader: tPayments('volume.organizerCountHeader'),
      organizerActionHeader: tPayments('volume.organizerActionHeader'),
      organizerEmpty: tPayments('volume.organizerEmpty'),
      organizerPageSummary: ({
        start,
        end,
        total,
      }: {
        start: number;
        end: number;
        total: number;
      }) =>
        tPayments('volume.organizerPageSummary', {
          start,
          end,
          total,
        }),
      organizerPageStatus: ({ page, pageCount }: { page: number; pageCount: number }) =>
        tPayments('volume.organizerPageStatus', {
          page,
          pageCount,
        }),
      firstPageLabel: tPayments('volume.firstPageLabel'),
      previousPageLabel: tPayments('volume.previousPageLabel'),
      nextPageLabel: tPayments('volume.nextPageLabel'),
      lastPageLabel: tPayments('volume.lastPageLabel'),
      investigationTitle: tPayments('volume.investigationTitle'),
      investigationDescription: tPayments('volume.investigationDescription'),
      investigationActionLabel: tPayments('volume.investigationActionLabel'),
      organizerActionLabel: tPayments('volume.organizerActionLabel'),
    };

    return (
      <div className="space-y-6">
        <AdminPaymentsWorkspaceShell
          title={tPayments('title')}
          description={tPayments('description')}
          workspaceLabel={tPayments('workspaceLabel')}
          activeItemId={activeWorkspace}
          toolbar={
            <AdminDashboardRangeSelector
              options={rangeOptions}
              selected={selectedRange}
              className="w-full max-w-[38rem]"
            />
          }
          items={workspaceItems}
        />
        {hasPayoutOnlyContext ? (
          <section className="rounded-2xl border bg-muted/20 p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">{tPayments('contextBanner.title')}</p>
            <p className="mt-1">
              {tPayments('contextBanner.description', {
                payoutCount: contextSummary.payoutLifecycleCount,
              })}
            </p>
          </section>
        ) : null}
        <PaymentCaptureVolumeDashboard
          locale={locale as AppLocale}
          metrics={volumeMetrics}
          labels={volumeLabels}
          queryState={volumeQueryState}
        />
      </div>
    );
  }

  const [
    metrics,
    exposureMetrics,
    fxRates,
    fxFlags,
    fxSnapshots,
    artifactSummary,
    caseLookupResult,
    evidencePack,
  ] = await Promise.all([
    getAdminNetRecognizedFeeMetrics({
      days: rangeDays,
    }),
    getAdminDebtDisputeExposureMetrics({
      days: rangeDays,
    }),
    listDailyFxRatesForAdmin({
      limit: 120,
    }),
    getFxRateActionFlagsForAdmin({
      windowDays: rangeDays,
    }),
    listEventTimeFxSnapshotsFromDailyRates(),
    getArtifactGovernanceSummary({
      limit: 25,
    }),
    caseQuery.trim()
      ? lookupFinancialCases({
          query: caseQuery,
          limit: 20,
          includeSensitiveMetadata: authContext.permissions.canManageUsers,
        })
      : Promise.resolve(null),
    evidenceTraceId.trim()
      ? buildFinancialEvidencePack({
          traceId: evidenceTraceId,
          viewRole: evidenceViewRole,
          eventLimit: 250,
        })
      : Promise.resolve(null),
  ]);
  const mxnReport = await getAdminMxnNetRecognizedFeeReport({
    days: rangeDays,
    snapshots: fxSnapshots,
  });
  const contextSummary = await getAdminPaymentsContextSummary({
    windowStart: metrics.windowStart,
    windowEnd: metrics.windowEnd,
  });

  const labels = {
    sectionTitle: tPayments('sectionTitle'),
    sectionDescription: tPayments('sectionDescription'),
    primaryMetricTitle: tPayments('primaryMetricTitle'),
    primaryMetricDescription: tPayments('primaryMetricDescription'),
    capturedFeesLabel: tPayments('capturedFeesLabel'),
    adjustmentsLabel: tPayments('adjustmentsLabel'),
    currenciesTitle: tPayments('currenciesTitle'),
    currenciesDescription: tPayments('currenciesDescription'),
    adjustmentsTitle: tPayments('adjustmentsTitle'),
    adjustmentsDescription: tPayments('adjustmentsDescription'),
    traceabilityTitle: tPayments('traceabilityTitle'),
    traceabilityDescription: tPayments('traceabilityDescription'),
    traceabilityWindowLabel: tPayments('traceabilityWindowLabel'),
    traceabilityEventsLabel: tPayments('traceabilityEventsLabel'),
    traceabilityTracesLabel: tPayments('traceabilityTracesLabel'),
    traceabilityFirstEventLabel: tPayments('traceabilityFirstEventLabel'),
    traceabilityLastEventLabel: tPayments('traceabilityLastEventLabel'),
    sampleTracesTitle: tPayments('sampleTracesTitle'),
    sampleTracesEmpty: tPayments('sampleTracesEmpty'),
    sampleTracesScopeLabel: (shown: number, total: number) =>
      tPayments('sampledReferences.traceScope', {
        shown,
        total,
      }),
    sampleTracesMoreLabel: (count: number) =>
      tPayments('sampledReferences.moreLabel', {
        count,
      }),
    currencyHeader: tPayments('currencyHeader'),
    netHeader: tPayments('netHeader'),
    capturedHeader: tPayments('capturedHeader'),
    adjustmentHeader: tPayments('adjustmentHeader'),
    countHeader: tPayments('countHeader'),
    adjustmentCodeHeader: tPayments('adjustmentCodeHeader'),
    emptyAdjustments: tPayments('emptyAdjustments'),
  };

  const selectedRangeLabel =
    rangeOptions.find((option) => option.value === selectedRange)?.label ?? rangeOptions[2].label;

  const exposureLabels = {
    sectionTitle: tPayments('exposure.sectionTitle'),
    sectionDescription: tPayments('exposure.sectionDescription'),
    summaryExposureTitle: tPayments('exposure.summaryExposureTitle'),
    summaryOpenCasesTitle: tPayments('exposure.summaryOpenCasesTitle'),
    summaryPolicyPausesTitle: tPayments('exposure.summaryPolicyPausesTitle'),
    organizerTableTitle: tPayments('exposure.organizerTableTitle'),
    organizerTableDescription: tPayments('exposure.organizerTableDescription'),
    eventTableTitle: tPayments('exposure.eventTableTitle'),
    eventTableDescription: tPayments('exposure.eventTableDescription'),
    groupHeader: tPayments('exposure.groupHeader'),
    exposureHeader: tPayments('exposure.exposureHeader'),
    openAtRiskHeader: tPayments('exposure.openAtRiskHeader'),
    debtPostedHeader: tPayments('exposure.debtPostedHeader'),
    openCasesHeader: tPayments('exposure.openCasesHeader'),
    pauseHeader: tPayments('exposure.pauseHeader'),
    resumeHeader: tPayments('exposure.resumeHeader'),
    tracesHeader: tPayments('exposure.tracesHeader'),
    disputeCasesHeader: tPayments('exposure.disputeCasesHeader'),
    sampleTracesLabel: tPayments('exposure.sampleTracesLabel'),
    sampleCasesLabel: tPayments('exposure.sampleCasesLabel'),
    sampledTraceCountLabel: (count: number) =>
      tPayments('sampledReferences.traceCount', {
        count,
      }),
    sampledCaseCountLabel: (count: number) =>
      tPayments('sampledReferences.caseCount', {
        count,
      }),
    sampledMoreLabel: (count: number) =>
      tPayments('sampledReferences.moreLabel', {
        count,
      }),
    currenciesLabel: (count: number) => tPayments('exposure.currenciesLabel', { count }),
    emptyState: tPayments('exposure.emptyState'),
  };

  const mxnLabels = {
    sectionTitle: tPayments('mxn.sectionTitle'),
    sectionDescription: tPayments('mxn.sectionDescription'),
    headlineTitle: tPayments('mxn.headlineTitle'),
    convertedEventsTitle: tPayments('mxn.convertedEventsTitle'),
    missingSnapshotsTitle: tPayments('mxn.missingSnapshotsTitle'),
    tableTitle: tPayments('mxn.tableTitle'),
    tableDescription: tPayments('mxn.tableDescription'),
    currencyHeader: tPayments('mxn.currencyHeader'),
    sourceHeader: tPayments('mxn.sourceHeader'),
    mxnHeader: tPayments('mxn.mxnHeader'),
    convertedEventsHeader: tPayments('mxn.convertedEventsHeader'),
    missingSnapshotsHeader: tPayments('mxn.missingSnapshotsHeader'),
    snapshotsHeader: tPayments('mxn.snapshotsHeader'),
    missingTraceHeader: tPayments('mxn.missingTraceHeader'),
    emptyState: tPayments('mxn.emptyState'),
    notConvertedLabel: tPayments('mxn.notConvertedLabel'),
  };

  const fxLabels = {
    sectionTitle: tPayments('fx.sectionTitle'),
    sectionDescription: tPayments('fx.sectionDescription'),
    missingTitle: tPayments('fx.missingTitle'),
    staleTitle: tPayments('fx.staleTitle'),
    upsertTitle: tPayments('fx.upsertTitle'),
    upsertDescription: tPayments('fx.upsertDescription'),
    editActionLabel: tPayments('fx.editActionLabel'),
    currencyFieldLabel: tPayments('fx.currencyFieldLabel'),
    dateFieldLabel: tPayments('fx.dateFieldLabel'),
    rateFieldLabel: tPayments('fx.rateFieldLabel'),
    reasonFieldLabel: tPayments('fx.reasonFieldLabel'),
    clearDateLabel: tPayments('fx.clearDateLabel'),
    submitLabel: tPayments('fx.submitLabel'),
    ratesTableTitle: tPayments('fx.ratesTableTitle'),
    ratesTableDescription: tPayments('fx.ratesTableDescription'),
    tableCurrencyHeader: tPayments('fx.tableCurrencyHeader'),
    tableDateHeader: tPayments('fx.tableDateHeader'),
    tableRateHeader: tPayments('fx.tableRateHeader'),
    tableReasonHeader: tPayments('fx.tableReasonHeader'),
    tableUpdatedHeader: tPayments('fx.tableUpdatedHeader'),
    emptyRates: tPayments('fx.emptyRates'),
    noActions: tPayments('fx.noActions'),
    missingDatesLabel: tPayments('fx.missingDatesLabel'),
  };

  const artifactLabels = {
    sectionTitle: tPayments('artifacts.sectionTitle'),
    sectionDescription: tPayments('artifacts.sectionDescription'),
    formTitle: tPayments('artifacts.formTitle'),
    formDescription: tPayments('artifacts.formDescription'),
    operationActionLabel: tPayments('artifacts.operationActionLabel'),
    operationFieldLabel: tPayments('artifacts.operationFieldLabel'),
    operationRebuildLabel: tPayments('artifacts.operationRebuildLabel'),
    operationResendLabel: tPayments('artifacts.operationResendLabel'),
    traceFieldLabel: tPayments('artifacts.traceFieldLabel'),
    artifactTypeFieldLabel: tPayments('artifacts.artifactTypeFieldLabel'),
    artifactTypePayoutStatementLabel: tPayments('artifacts.artifactTypePayoutStatementLabel'),
    artifactVersionFieldLabel: tPayments('artifacts.artifactVersionFieldLabel'),
    reasonFieldLabel: tPayments('artifacts.reasonFieldLabel'),
    submitLabel: tPayments('artifacts.submitLabel'),
    refreshLabel: tPayments('artifacts.refreshLabel'),
    refreshingLabel: tPayments('artifacts.refreshingLabel'),
    submittingLabel: tPayments('artifacts.submittingLabel'),
    successPrefix: tPayments('artifacts.successPrefix'),
    policyDeniedPrefix: tPayments('artifacts.policyDeniedPrefix'),
    genericErrorMessage: tPayments('artifacts.genericErrorMessage'),
    recentVersionsTitle: tPayments('artifacts.recentVersionsTitle'),
    recentVersionsDescription: tPayments('artifacts.recentVersionsDescription'),
    recentDeliveriesTitle: tPayments('artifacts.recentDeliveriesTitle'),
    recentDeliveriesDescription: tPayments('artifacts.recentDeliveriesDescription'),
    versionsEmpty: tPayments('artifacts.versionsEmpty'),
    deliveriesEmpty: tPayments('artifacts.deliveriesEmpty'),
    versionTraceHeader: tPayments('artifacts.versionTraceHeader'),
    versionNumberHeader: tPayments('artifacts.versionNumberHeader'),
    versionFingerprintHeader: tPayments('artifacts.versionFingerprintHeader'),
    versionLineageHeader: tPayments('artifacts.versionLineageHeader'),
    versionLineageRootLabel: tPayments('artifacts.versionLineageRootLabel'),
    versionLineageFromPrefixLabel: tPayments('artifacts.versionLineageFromPrefixLabel'),
    versionReasonHeader: tPayments('artifacts.versionReasonHeader'),
    versionRequestedByHeader: tPayments('artifacts.versionRequestedByHeader'),
    versionCreatedAtHeader: tPayments('artifacts.versionCreatedAtHeader'),
    deliveryTraceHeader: tPayments('artifacts.deliveryTraceHeader'),
    deliveryVersionHeader: tPayments('artifacts.deliveryVersionHeader'),
    deliveryChannelHeader: tPayments('artifacts.deliveryChannelHeader'),
    deliveryRecipientHeader: tPayments('artifacts.deliveryRecipientHeader'),
    deliveryReasonHeader: tPayments('artifacts.deliveryReasonHeader'),
    deliveryRequestedByHeader: tPayments('artifacts.deliveryRequestedByHeader'),
    deliveryCreatedAtHeader: tPayments('artifacts.deliveryCreatedAtHeader'),
    operationSelectAriaLabel: tPayments('artifacts.operationSelectAriaLabel'),
  };

  const caseLookupLabels = {
    sectionTitle: tPayments('caseLookup.sectionTitle'),
    sectionDescription: tPayments('caseLookup.sectionDescription'),
    searchTitle: tPayments('caseLookup.searchTitle'),
    searchDescription: tPayments('caseLookup.searchDescription'),
    queryFieldLabel: tPayments('caseLookup.queryFieldLabel'),
    queryPlaceholder: tPayments('caseLookup.queryPlaceholder'),
    searchButtonLabel: tPayments('caseLookup.searchButtonLabel'),
    noQueryTitle: tPayments('caseLookup.noQueryTitle'),
    noQueryState: tPayments('caseLookup.noQueryState'),
    noResultsTitle: tPayments('caseLookup.noResultsTitle'),
    noResultsState: tPayments('caseLookup.noResultsState'),
    disambiguationTitle: tPayments('caseLookup.disambiguationTitle'),
    disambiguationDescription: tPayments('caseLookup.disambiguationDescription'),
    disambiguationEmpty: tPayments('caseLookup.disambiguationEmpty'),
    resultsTitle: tPayments('caseLookup.resultsTitle'),
    resultsDescription: tPayments('caseLookup.resultsDescription'),
    loadEvidenceLabel: tPayments('caseLookup.loadEvidenceLabel'),
    evidenceLoadedLabel: tPayments('caseLookup.evidenceLoadedLabel'),
    traceHeader: tPayments('caseLookup.traceHeader'),
    rootEntityHeader: tPayments('caseLookup.rootEntityHeader'),
    organizerHeader: tPayments('caseLookup.organizerHeader'),
    eventCountHeader: tPayments('caseLookup.eventCountHeader'),
    firstEventHeader: tPayments('caseLookup.firstEventHeader'),
    lastEventHeader: tPayments('caseLookup.lastEventHeader'),
    identifiersHeader: tPayments('caseLookup.identifiersHeader'),
    sourcesHeader: tPayments('caseLookup.sourcesHeader'),
  };
  const caseLookupSummaryLabel = caseLookupResult
    ? tPayments('caseLookup.summaryLabel', {
        shown: caseLookupResult.returnedCaseCount,
        total: caseLookupResult.totalCaseCount,
      })
    : null;
  const caseLookupSummaryLimitedHint = caseLookupResult?.isResultLimitApplied
    ? tPayments('caseLookup.summaryLimitedHint', {
        shown: caseLookupResult.returnedCaseCount,
        total: caseLookupResult.totalCaseCount,
      })
    : null;

  const evidenceLabels = {
    sectionTitle: tPayments('evidence.sectionTitle'),
    sectionDescription: tPayments('evidence.sectionDescription'),
    requestTitle: tPayments('evidence.requestTitle'),
    requestDescription: tPayments('evidence.requestDescription'),
    traceFieldLabel: tPayments('evidence.traceFieldLabel'),
    tracePlaceholder: tPayments('evidence.tracePlaceholder'),
    loadButtonLabel: tPayments('evidence.loadButtonLabel'),
    noTraceTitle: tPayments('evidence.noTraceTitle'),
    noTraceState: tPayments('evidence.noTraceState'),
    notFoundTitle: tPayments('evidence.notFoundTitle'),
    notFoundState: tPayments('evidence.notFoundState'),
    summaryTitle: tPayments('evidence.summaryTitle'),
    summaryDescription: tPayments('evidence.summaryDescription'),
    traceCreatedLabel: tPayments('evidence.traceCreatedLabel'),
    firstEventLabel: tPayments('evidence.firstEventLabel'),
    lastEventLabel: tPayments('evidence.lastEventLabel'),
    rootEntityLabel: tPayments('evidence.rootEntityLabel'),
    redactionLabel: tPayments('evidence.redactionLabel'),
    currentStateLabel: tPayments('evidence.currentStateLabel'),
    currentOwnerLabel: tPayments('evidence.currentOwnerLabel'),
    nextTransitionLabel: tPayments('evidence.nextTransitionLabel'),
    policyContextTitle: tPayments('evidence.policyContextTitle'),
    policyContextEmpty: tPayments('evidence.policyContextEmpty'),
    eventsTitle: tPayments('evidence.eventsTitle'),
    eventsDescription: tPayments('evidence.eventsDescription'),
    eventTimeHeader: tPayments('evidence.eventTimeHeader'),
    eventNameHeader: tPayments('evidence.eventNameHeader'),
    eventEntityHeader: tPayments('evidence.eventEntityHeader'),
    eventOwnershipStateHeader: tPayments('evidence.eventOwnershipStateHeader'),
    eventOwnershipOwnerHeader: tPayments('evidence.eventOwnershipOwnerHeader'),
    eventOwnershipNextHeader: tPayments('evidence.eventOwnershipNextHeader'),
    eventPayloadHeader: tPayments('evidence.eventPayloadHeader'),
    ownershipStateActionNeededLabel: tPayments('evidence.ownershipStateActionNeededLabel'),
    ownershipStateInProgressLabel: tPayments('evidence.ownershipStateInProgressLabel'),
    artifactsVersionsTitle: tPayments('evidence.artifactsVersionsTitle'),
    artifactsDeliveriesTitle: tPayments('evidence.artifactsDeliveriesTitle'),
    artifactVersionHeader: tPayments('evidence.artifactVersionHeader'),
    artifactFingerprintHeader: tPayments('evidence.artifactFingerprintHeader'),
    artifactLineageHeader: tPayments('evidence.artifactLineageHeader'),
    artifactLineageRootLabel: tPayments('evidence.artifactLineageRootLabel'),
    artifactReasonHeader: tPayments('evidence.artifactReasonHeader'),
    artifactCreatedHeader: tPayments('evidence.artifactCreatedHeader'),
    deliveryChannelHeader: tPayments('evidence.deliveryChannelHeader'),
    deliveryRecipientHeader: tPayments('evidence.deliveryRecipientHeader'),
    deliveryReasonHeader: tPayments('evidence.deliveryReasonHeader'),
    deliveryCreatedHeader: tPayments('evidence.deliveryCreatedHeader'),
  };

  const hasOverviewActivity =
    metrics.traceability.eventCount > 0 ||
    metrics.headlineNetRecognizedFeeMinor !== 0 ||
    mxnReport.convertedEventCount > 0;
  const hasOverviewBreakdown =
    hasOverviewActivity || metrics.currencies.length > 0 || mxnReport.currencies.length > 0;
  const hasRiskAttention =
    exposureMetrics.totals.pauseRequiredCount > 0 ||
    exposureMetrics.totals.openDisputeCaseCount > 0 ||
    exposureMetrics.totals.headlineExposureScoreMinor > 0;
  const hasRiskBreakdown =
    hasRiskAttention ||
    exposureMetrics.organizers.length > 0 ||
    exposureMetrics.events.length > 0;
  const hasEconomicsData =
    contextSummary.capturedCount > 0 || contextSummary.adjustmentCount > 0;
  const hasPayoutOnlyContext = !hasEconomicsData && contextSummary.payoutLifecycleCount > 0;

  let workspaceContent: ReactNode = null;

  if (activeWorkspace === 'economics') {
    workspaceContent = (
      <div className="space-y-6">
        <section className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
          <div className="rounded-3xl border bg-card/70 p-5 shadow-sm sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/80">
              {tPayments('overview.heroEyebrow')}
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">
              {formatMoneyFromMinor(
                metrics.headlineNetRecognizedFeeMinor,
                metrics.headlineCurrency,
                locale as AppLocale,
              )}
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              {hasOverviewActivity
                ? tPayments('overview.heroActiveDescription', { range: selectedRangeLabel })
                : tPayments('overview.heroIdleDescription', { range: selectedRangeLabel })}
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border bg-background/60 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {labels.capturedFeesLabel}
                </p>
                <p className="mt-2 text-xl font-semibold tabular-nums">
                  {formatMoneyFromMinor(
                    metrics.headlineCapturedFeeMinor,
                    metrics.headlineCurrency,
                    locale as AppLocale,
                  )}
                </p>
              </div>
              <div className="rounded-2xl border bg-background/60 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {mxnLabels.headlineTitle}
                </p>
                <p className="mt-2 text-xl font-semibold tabular-nums">
                  {formatMoneyFromMinor(
                    mxnReport.headlineMxnNetRecognizedFeeMinor,
                    'MXN',
                    locale as AppLocale,
                  )}
                </p>
              </div>
              <div className="rounded-2xl border bg-background/60 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {mxnLabels.convertedEventsTitle}
                </p>
                <p className="mt-2 text-xl font-semibold tabular-nums">
                  {mxnReport.convertedEventCount.toLocaleString(locale as AppLocale)}
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="rounded-3xl border bg-card/70 p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {tPayments('overview.windowTitle')}
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
                {tPayments('overview.windowDescription', { range: selectedRangeLabel })}
              </p>
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                    {labels.traceabilityWindowLabel}
                  </dt>
                  <dd className="mt-1">
                    {formatDateTime(metrics.traceability.windowStart, locale as AppLocale)} -{' '}
                    {formatDateTime(metrics.traceability.windowEnd, locale as AppLocale)}
                  </dd>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                      {labels.traceabilityEventsLabel}
                    </dt>
                    <dd className="mt-1 tabular-nums">{metrics.traceability.eventCount}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                      {labels.traceabilityTracesLabel}
                    </dt>
                    <dd className="mt-1 tabular-nums">{metrics.traceability.distinctTraceCount}</dd>
                  </div>
                </div>
              </dl>
            </div>

            <div className="rounded-3xl border bg-card/70 p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {tPayments('overview.statusTitle')}
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
                {hasOverviewActivity
                  ? tPayments('overview.statusActive')
                  : tPayments('overview.statusIdle')}
              </p>
            </div>
          </div>
        </section>

        {hasOverviewBreakdown ? (
          <div className="space-y-6">
            <NetRecognizedFeeDashboard
              locale={locale as AppLocale}
              metrics={metrics}
              labels={labels}
              hideSummaryCards
            />
            <MxnReportingDashboard
              locale={locale as AppLocale}
              report={mxnReport}
              labels={mxnLabels}
              hideSummaryCards
            />
          </div>
        ) : (
          <section className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-3xl border border-dashed bg-card/50 p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {labels.sectionTitle}
              </p>
              <h3 className="mt-3 text-lg font-semibold">
                {tPayments('overview.revenueIdleTitle')}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {tPayments('overview.revenueIdleDescription')}
              </p>
            </div>
            <div className="rounded-3xl border border-dashed bg-card/50 p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {mxnLabels.sectionTitle}
              </p>
              <h3 className="mt-3 text-lg font-semibold">
                {tPayments('overview.conversionIdleTitle')}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {tPayments('overview.conversionIdleDescription')}
              </p>
            </div>
          </section>
        )}
      </div>
    );
  } else if (activeWorkspace === 'risk') {
    workspaceContent = (
      <div className="space-y-6">
        {hasRiskBreakdown ? (
          <>
            <section className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/80">
                {tPayments('risk.heroEyebrow')}
              </p>
              <h2 className="text-2xl font-semibold tracking-tight">
                {hasRiskAttention
                  ? tPayments('risk.heroAttentionTitle')
                  : tPayments('risk.heroQuietTitle')}
              </h2>
              <p className="max-w-3xl text-sm text-muted-foreground">
                {hasRiskAttention
                  ? tPayments('risk.heroAttentionDescription')
                  : tPayments('risk.heroQuietDescription')}
              </p>
            </section>
            <DebtDisputeExposureDashboard
              locale={locale as AppLocale}
              metrics={exposureMetrics}
              labels={exposureLabels}
            />
            <section className="rounded-2xl border bg-card/60 p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {tPayments('risk.reviewTitle')}
              </p>
              <div className="mt-3 grid gap-4 md:grid-cols-3">
                <div>
                  <p className="font-medium text-foreground">{tPayments('risk.reviewExposureTitle')}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {tPayments('risk.reviewExposureDescription')}
                  </p>
                </div>
                <div>
                  <p className="font-medium text-foreground">{tPayments('risk.reviewCasesTitle')}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {tPayments('risk.reviewCasesDescription')}
                  </p>
                </div>
                <div>
                  <p className="font-medium text-foreground">{tPayments('risk.reviewPausesTitle')}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {tPayments('risk.reviewPausesDescription')}
                  </p>
                </div>
              </div>
            </section>
          </>
        ) : (
          <section className="rounded-3xl border border-dashed bg-card/50 p-5 shadow-sm sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/80">
              {tPayments('risk.heroEyebrow')}
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight">
              {tPayments('risk.heroQuietTitle')}
            </h2>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              {tPayments('risk.heroQuietDescription')}
            </p>
            <div className="mt-5 rounded-2xl border border-dashed bg-background/70 p-4">
              <p className="font-medium">{tPayments('risk.detailIdleTitle')}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {tPayments('risk.detailIdleDescription')}
              </p>
            </div>
          </section>
        )}
      </div>
    );
  } else if (activeWorkspace === 'operations') {
    workspaceContent = (
      <div className="space-y-6">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border bg-card/70 p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {fxLabels.missingTitle}
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {fxFlags.missingRates.length.toLocaleString(locale as AppLocale)}
            </p>
          </div>
          <div className="rounded-2xl border bg-card/70 p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {fxLabels.staleTitle}
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {fxFlags.staleRates.length.toLocaleString(locale as AppLocale)}
            </p>
          </div>
          <div className="rounded-2xl border bg-card/70 p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {artifactLabels.recentVersionsTitle}
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {artifactSummary.versions.length.toLocaleString(locale as AppLocale)}
            </p>
          </div>
          <div className="rounded-2xl border bg-card/70 p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {artifactLabels.recentDeliveriesTitle}
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {artifactSummary.deliveries.length.toLocaleString(locale as AppLocale)}
            </p>
          </div>
        </section>

        <div className="space-y-6">
          <FxRateManagementDashboard
            locale={locale as AppLocale}
            rates={fxRates}
            flags={fxFlags}
            labels={fxLabels}
            upsertAction={upsertFxRateFormAction}
            hideSummaryCards
          />
          <ArtifactGovernanceDashboard
            locale={locale as AppLocale}
            initialSummary={artifactSummary}
            labels={artifactLabels}
          />
        </div>

        <div className="rounded-2xl border border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
          {tPayments('sections.operationsNote')}
        </div>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border bg-card/60 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {tPayments('operationsGuidance.fxTitle')}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {tPayments('operationsGuidance.fxDescription')}
            </p>
          </div>
          <div className="rounded-2xl border bg-card/60 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {tPayments('operationsGuidance.artifactsTitle')}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {tPayments('operationsGuidance.artifactsDescription')}
            </p>
          </div>
        </section>
      </div>
    );
  } else if (activeWorkspace === 'investigation') {
    const investigationTools = [
      {
        id: 'lookup' as const,
        title: tPayments('investigation.tools.lookup.title'),
        description: tPayments('investigation.tools.lookup.description'),
        status:
          caseQuery.trim().length > 0
            ? tPayments('investigation.tools.lookup.activeState')
            : tPayments('investigation.tools.lookup.idleState'),
      },
      {
        id: 'trace' as const,
        title: tPayments('investigation.tools.trace.title'),
        description: tPayments('investigation.tools.trace.description'),
        status:
          evidenceTraceId.trim().length > 0
            ? tPayments('investigation.tools.trace.activeState')
            : tPayments('investigation.tools.trace.idleState'),
      },
    ];

    workspaceContent = (
      <div className="space-y-6">
        <section className="space-y-3">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/80">
              {tPayments('investigation.eyebrow')}
            </p>
            <h2 className="text-2xl font-semibold tracking-tight">
              {tPayments('investigation.title')}
            </h2>
            <p className="max-w-3xl text-sm text-muted-foreground">
              {tPayments('investigation.description')}
            </p>
          </div>

          <AdminInvestigationToolSwitcher
            items={investigationTools}
            activeTool={activeInvestigationTool}
          />
        </section>

        {activeInvestigationTool === 'lookup' ? (
          <div className="space-y-6">
            <FinancialCaseLookupDashboard
              locale={locale as AppLocale}
              selectedRange={selectedRange}
              searchQuery={caseQuery}
              result={caseLookupResult}
              labels={caseLookupLabels}
              summaryLabel={caseLookupSummaryLabel}
              summaryLimitedHint={caseLookupSummaryLimitedHint}
              workspace={activeWorkspace}
              selectedTraceId={evidenceTraceId}
              investigationTool={activeInvestigationTool}
            />
            {evidenceTraceId.trim().length > 0 ? (
              <section className="rounded-2xl border bg-card/70 p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {tPayments('investigation.evidenceReadyEyebrow')}
                </p>
                <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">
                      {tPayments('investigation.evidenceReadyTitle')}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {tPayments('investigation.evidenceReadyDescription')}
                    </p>
                  </div>
                  <AdminInvestigationOpenTraceButton
                    label={tPayments('investigation.openTraceLabel')}
                    caseQuery={caseQuery}
                    evidenceTraceId={evidenceTraceId}
                  />
                </div>
              </section>
            ) : null}
          </div>
        ) : (
          <EvidencePackReviewDashboard
            locale={locale as AppLocale}
            selectedRange={selectedRange}
            searchQuery={caseQuery}
            selectedTraceId={evidenceTraceId}
            evidencePack={evidencePack}
            labels={evidenceLabels}
            workspace={activeWorkspace}
            investigationTool={activeInvestigationTool}
          />
        )}

        <details className="rounded-2xl border bg-card/60 p-4 shadow-sm">
          <summary className="cursor-pointer list-none text-sm font-semibold">
            {tPayments('investigation.helpTitle')}
          </summary>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {tPayments('investigation.guidanceTitle')}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {tPayments('investigation.guidanceDescription')}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {tPayments('investigation.whereToFindIdsTitle')}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {tPayments('investigation.whereToFindIdsDescription')}
              </p>
            </div>
          </div>
        </details>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AdminPaymentsWorkspaceShell
        title={tPayments('title')}
        description={tPayments('description')}
        workspaceLabel={tPayments('workspaceLabel')}
        activeItemId={activeWorkspace}
        toolbar={
          (adminPaymentsRangeSelectorWorkspaceIds as readonly AdminPaymentsWorkspaceId[]).includes(
            activeWorkspace,
          ) ? (
            <AdminDashboardRangeSelector
              options={rangeOptions}
              selected={selectedRange}
              className="w-full max-w-[38rem]"
            />
          ) : null
        }
        items={workspaceItems}
      />
      {hasPayoutOnlyContext ? (
        <section className="rounded-2xl border bg-muted/20 p-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">{tPayments('contextBanner.title')}</p>
          <p className="mt-1">
            {tPayments('contextBanner.description', {
              payoutCount: contextSummary.payoutLifecycleCount,
            })}
          </p>
        </section>
      ) : null}
      {workspaceContent}
    </div>
  );
}
