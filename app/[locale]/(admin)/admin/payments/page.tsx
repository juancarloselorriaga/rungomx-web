import { upsertDailyFxRateAdminAction } from '@/app/actions/admin-payments-fx';
import {
  AdminPaymentsWorkspaceId,
  AdminPaymentsWorkspaceShell,
} from '@/components/admin/payments/admin-payments-workspace-shell';
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
import { getPathname } from '@/i18n/navigation';
import { getAuthContext } from '@/lib/auth/server';
import { db } from '@/db';
import { moneyEvents } from '@/db/schema';
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
import { type AppLocale } from '@/i18n/routing';
import { LocalePageProps } from '@/types/next';
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

function normalizeWorkspace(
  rawWorkspace: string | undefined,
): AdminPaymentsWorkspaceId {
  if (
    rawWorkspace === 'overview' ||
    rawWorkspace === 'risk' ||
    rawWorkspace === 'operations' ||
    rawWorkspace === 'investigation'
  ) {
    return rawWorkspace;
  }

  return 'overview';
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

function formatMoney(valueMinor: number, currency: string, locale: 'es' | 'en'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valueMinor / 100);
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
  const activeWorkspace = normalizeWorkspace(rawWorkspace);
  const activeInvestigationTool = normalizeInvestigationTool(
    rawInvestigationTool,
    evidenceTraceId.trim().length > 0,
  );
  const rangeDays = rangeToDays(selectedRange);
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
    currencyHeader: tPayments('currencyHeader'),
    netHeader: tPayments('netHeader'),
    capturedHeader: tPayments('capturedHeader'),
    adjustmentHeader: tPayments('adjustmentHeader'),
    countHeader: tPayments('countHeader'),
    adjustmentCodeHeader: tPayments('adjustmentCodeHeader'),
    emptyAdjustments: tPayments('emptyAdjustments'),
  };

  const rangeOptions = [
    { value: '7d' as const, label: tDashboardRanges('last7days') },
    { value: '14d' as const, label: tDashboardRanges('last14days') },
    { value: '30d' as const, label: tDashboardRanges('last30days') },
  ];
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
    summaryLabel: tPayments('caseLookup.summaryLabel'),
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
    artifactsVersionsTitle: tPayments('evidence.artifactsVersionsTitle'),
    artifactsDeliveriesTitle: tPayments('evidence.artifactsDeliveriesTitle'),
    artifactVersionHeader: tPayments('evidence.artifactVersionHeader'),
    artifactFingerprintHeader: tPayments('evidence.artifactFingerprintHeader'),
    artifactLineageHeader: tPayments('evidence.artifactLineageHeader'),
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

  if (activeWorkspace === 'overview') {
    workspaceContent = (
      <div className="space-y-6">
        <section className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
          <div className="rounded-3xl border bg-card/70 p-5 shadow-sm sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/80">
              {tPayments('overview.heroEyebrow')}
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">
              {formatMoney(
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
                  {formatMoney(
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
                  {formatMoney(
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
          <div className="grid gap-6 2xl:grid-cols-[1.15fr_0.85fr]">
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
        <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-3xl border bg-card/70 p-5 shadow-sm sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/80">
              {tPayments('risk.heroEyebrow')}
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight">
              {hasRiskAttention
                ? tPayments('risk.heroAttentionTitle')
                : tPayments('risk.heroQuietTitle')}
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              {hasRiskAttention
                ? tPayments('risk.heroAttentionDescription')
                : tPayments('risk.heroQuietDescription')}
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border bg-background/60 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {exposureLabels.summaryExposureTitle}
                </p>
                <p className="mt-2 text-xl font-semibold tabular-nums">
                  {formatMoney(
                    exposureMetrics.totals.headlineExposureScoreMinor,
                    exposureMetrics.totals.headlineCurrency,
                    locale as AppLocale,
                  )}
                </p>
              </div>
              <div className="rounded-2xl border bg-background/60 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {exposureLabels.summaryOpenCasesTitle}
                </p>
                <p className="mt-2 text-xl font-semibold tabular-nums">
                  {exposureMetrics.totals.openDisputeCaseCount.toLocaleString(locale as AppLocale)}
                </p>
              </div>
              <div className="rounded-2xl border bg-background/60 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {exposureLabels.summaryPolicyPausesTitle}
                </p>
                <p className="mt-2 text-xl font-semibold tabular-nums">
                  {exposureMetrics.totals.pauseRequiredCount.toLocaleString(locale as AppLocale)}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border bg-card/70 p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {tPayments('risk.reviewTitle')}
            </p>
            <div className="mt-4 space-y-4 text-sm text-muted-foreground">
              <div>
                <p className="font-medium text-foreground">{tPayments('risk.reviewExposureTitle')}</p>
                <p className="mt-1">{tPayments('risk.reviewExposureDescription')}</p>
              </div>
              <div>
                <p className="font-medium text-foreground">{tPayments('risk.reviewCasesTitle')}</p>
                <p className="mt-1">{tPayments('risk.reviewCasesDescription')}</p>
              </div>
              <div>
                <p className="font-medium text-foreground">{tPayments('risk.reviewPausesTitle')}</p>
                <p className="mt-1">{tPayments('risk.reviewPausesDescription')}</p>
              </div>
            </div>
          </div>
        </section>
        {hasRiskBreakdown ? (
          <DebtDisputeExposureDashboard
            locale={locale as AppLocale}
            metrics={exposureMetrics}
            labels={exposureLabels}
            hideSummaryCards
          />
        ) : (
          <section className="rounded-3xl border border-dashed bg-card/50 p-5 shadow-sm sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {exposureLabels.sectionTitle}
            </p>
            <h3 className="mt-3 text-lg font-semibold">
              {tPayments('risk.detailIdleTitle')}
            </h3>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              {tPayments('risk.detailIdleDescription')}
            </p>
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

        <div className="rounded-2xl border border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
          {tPayments('sections.operationsNote')}
        </div>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border bg-card/70 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {tPayments('operationsGuidance.fxTitle')}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {tPayments('operationsGuidance.fxDescription')}
            </p>
          </div>
          <div className="rounded-2xl border bg-card/70 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {tPayments('operationsGuidance.artifactsTitle')}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {tPayments('operationsGuidance.artifactsDescription')}
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
      </div>
    );
  } else if (activeWorkspace === 'investigation') {
    workspaceContent = (
      <div className="space-y-6">
        <section className="rounded-3xl border bg-card/70 p-5 shadow-sm sm:p-6">
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

          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {(
              [
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
              ] satisfies Array<{
                id: 'lookup' | 'trace';
                title: string;
                description: string;
                status: string;
              }>
            ).map((tool) => {
              const isActive = tool.id === activeInvestigationTool;
              const nextParams = new URLSearchParams();
              nextParams.set('workspace', activeWorkspace);
              nextParams.set('investigationTool', tool.id);
              nextParams.set('range', selectedRange);
              if (caseQuery.trim()) nextParams.set('caseQuery', caseQuery);
              if (evidenceTraceId.trim()) nextParams.set('evidenceTraceId', evidenceTraceId);

              return (
                <a
                  key={tool.id}
                  href={`?${nextParams.toString()}`}
                  aria-current={isActive ? 'page' : undefined}
                  className={[
                    'rounded-2xl border px-4 py-4 shadow-sm transition',
                    isActive
                      ? 'border-primary/40 bg-primary/10'
                      : 'bg-background/50 hover:border-primary/30 hover:bg-card',
                  ].join(' ')}
                >
                  <p className="text-sm font-semibold">{tool.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{tool.description}</p>
                  <p className="mt-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    {tool.status}
                  </p>
                </a>
              );
            })}
          </div>
        </section>

        <details className="rounded-2xl border bg-card/70 p-4 shadow-sm">
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

        {activeInvestigationTool === 'lookup' ? (
          <div className="space-y-6">
            <FinancialCaseLookupDashboard
              locale={locale as AppLocale}
              selectedRange={selectedRange}
              searchQuery={caseQuery}
              result={caseLookupResult}
              labels={caseLookupLabels}
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
                  <a
                    href={`?${new URLSearchParams({
                      workspace: activeWorkspace,
                      investigationTool: 'trace',
                      range: selectedRange,
                      ...(caseQuery.trim() ? { caseQuery } : {}),
                      evidenceTraceId,
                    }).toString()}`}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 px-4 text-sm font-medium text-foreground transition hover:bg-primary/15"
                  >
                    {tPayments('investigation.openTraceLabel')}
                  </a>
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
          (activeWorkspace === 'overview' || activeWorkspace === 'risk') ? (
            <AdminDashboardRangeSelector
              options={rangeOptions}
              selected={selectedRange}
              className="w-full max-w-[38rem]"
            />
          ) : null
        }
        items={[
          {
            id: 'overview',
            label: tPayments('nav.overviewLabel'),
            description: tPayments('nav.overviewDescription'),
          },
          {
            id: 'risk',
            label: tPayments('nav.riskLabel'),
            description: tPayments('nav.riskDescription'),
          },
          {
            id: 'operations',
            label: tPayments('nav.operationsLabel'),
            description: tPayments('nav.operationsDescription'),
          },
          {
            id: 'investigation',
            label: tPayments('nav.investigationLabel'),
            description: tPayments('nav.investigationDescription'),
          },
        ]}
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
