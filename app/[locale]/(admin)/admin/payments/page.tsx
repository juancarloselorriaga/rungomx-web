import { upsertDailyFxRateAdminAction } from '@/app/actions/admin-payments-fx';
import { ArtifactGovernanceDashboard } from '@/components/admin/payments/artifact-governance-dashboard';
import { DebtDisputeExposureDashboard } from '@/components/admin/payments/debt-dispute-exposure-dashboard';
import { EvidencePackReviewDashboard } from '@/components/admin/payments/evidence-pack-review-dashboard';
import { FinancialCaseLookupDashboard } from '@/components/admin/payments/financial-case-lookup-dashboard';
import { FxRateManagementDashboard } from '@/components/admin/payments/fx-rate-management-dashboard';
import { MxnReportingDashboard } from '@/components/admin/payments/mxn-reporting-dashboard';
import { NetRecognizedFeeDashboard } from '@/components/admin/payments/net-recognized-fee-dashboard';
import { getPathname } from '@/i18n/navigation';
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
import { buildFinancialEvidencePack, type EvidencePackViewRole } from '@/lib/payments/support/evidence-pack';
import { type AppLocale } from '@/i18n/routing';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { createLocalizedPageMetadata } from '@/utils/seo';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

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

  const t = await getTranslations('pages.dashboard');
  const resolvedSearchParams: AdminPaymentsSearchParams = searchParams
    ? await searchParams
    : {};
  const rangeParam = resolvedSearchParams.range;
  const caseQueryParam = resolvedSearchParams.caseQuery;
  const evidenceTraceIdParam = resolvedSearchParams.evidenceTraceId;
  const rawRange =
    typeof rangeParam === 'string'
      ? rangeParam
      : Array.isArray(rangeParam)
        ? rangeParam[0]
        : undefined;
  const caseQuery =
    typeof caseQueryParam === 'string'
      ? caseQueryParam
      : Array.isArray(caseQueryParam)
        ? caseQueryParam[0] ?? ''
        : '';
  const evidenceTraceId =
    typeof evidenceTraceIdParam === 'string'
      ? evidenceTraceIdParam
      : Array.isArray(evidenceTraceIdParam)
        ? evidenceTraceIdParam[0] ?? ''
        : '';
  const evidenceViewRole: EvidencePackViewRole = authContext.permissions.canManageUsers
    ? 'admin'
    : 'support';
  const selectedRange = normalizeRange(rawRange);
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

  const labels = {
    sectionTitle: t('admin.payments.sectionTitle'),
    sectionDescription: t('admin.payments.sectionDescription'),
    primaryMetricTitle: t('admin.payments.primaryMetricTitle'),
    primaryMetricDescription: t('admin.payments.primaryMetricDescription'),
    capturedFeesLabel: t('admin.payments.capturedFeesLabel'),
    adjustmentsLabel: t('admin.payments.adjustmentsLabel'),
    currenciesTitle: t('admin.payments.currenciesTitle'),
    currenciesDescription: t('admin.payments.currenciesDescription'),
    adjustmentsTitle: t('admin.payments.adjustmentsTitle'),
    adjustmentsDescription: t('admin.payments.adjustmentsDescription'),
    traceabilityTitle: t('admin.payments.traceabilityTitle'),
    traceabilityDescription: t('admin.payments.traceabilityDescription'),
    traceabilityWindowLabel: t('admin.payments.traceabilityWindowLabel'),
    traceabilityEventsLabel: t('admin.payments.traceabilityEventsLabel'),
    traceabilityTracesLabel: t('admin.payments.traceabilityTracesLabel'),
    traceabilityFirstEventLabel: t('admin.payments.traceabilityFirstEventLabel'),
    traceabilityLastEventLabel: t('admin.payments.traceabilityLastEventLabel'),
    sampleTracesTitle: t('admin.payments.sampleTracesTitle'),
    sampleTracesEmpty: t('admin.payments.sampleTracesEmpty'),
    currencyHeader: t('admin.payments.currencyHeader'),
    netHeader: t('admin.payments.netHeader'),
    capturedHeader: t('admin.payments.capturedHeader'),
    adjustmentHeader: t('admin.payments.adjustmentHeader'),
    countHeader: t('admin.payments.countHeader'),
    adjustmentCodeHeader: t('admin.payments.adjustmentCodeHeader'),
    emptyAdjustments: t('admin.payments.emptyAdjustments'),
  };

  const rangeOptions = [
    { value: '7d' as const, label: t('admin.metrics.ranges.last7days') },
    { value: '14d' as const, label: t('admin.metrics.ranges.last14days') },
    { value: '30d' as const, label: t('admin.metrics.ranges.last30days') },
  ];

  const exposureLabels = {
    sectionTitle: t('admin.payments.exposure.sectionTitle'),
    sectionDescription: t('admin.payments.exposure.sectionDescription'),
    summaryExposureTitle: t('admin.payments.exposure.summaryExposureTitle'),
    summaryOpenCasesTitle: t('admin.payments.exposure.summaryOpenCasesTitle'),
    summaryPolicyPausesTitle: t('admin.payments.exposure.summaryPolicyPausesTitle'),
    organizerTableTitle: t('admin.payments.exposure.organizerTableTitle'),
    organizerTableDescription: t('admin.payments.exposure.organizerTableDescription'),
    eventTableTitle: t('admin.payments.exposure.eventTableTitle'),
    eventTableDescription: t('admin.payments.exposure.eventTableDescription'),
    groupHeader: t('admin.payments.exposure.groupHeader'),
    exposureHeader: t('admin.payments.exposure.exposureHeader'),
    openAtRiskHeader: t('admin.payments.exposure.openAtRiskHeader'),
    debtPostedHeader: t('admin.payments.exposure.debtPostedHeader'),
    openCasesHeader: t('admin.payments.exposure.openCasesHeader'),
    pauseHeader: t('admin.payments.exposure.pauseHeader'),
    resumeHeader: t('admin.payments.exposure.resumeHeader'),
    tracesHeader: t('admin.payments.exposure.tracesHeader'),
    disputeCasesHeader: t('admin.payments.exposure.disputeCasesHeader'),
    sampleTracesLabel: t('admin.payments.exposure.sampleTracesLabel'),
    sampleCasesLabel: t('admin.payments.exposure.sampleCasesLabel'),
    currenciesLabel: (count: number) => t('admin.payments.exposure.currenciesLabel', { count }),
    emptyState: t('admin.payments.exposure.emptyState'),
  };

  const mxnLabels = {
    sectionTitle: t('admin.payments.mxn.sectionTitle'),
    sectionDescription: t('admin.payments.mxn.sectionDescription'),
    headlineTitle: t('admin.payments.mxn.headlineTitle'),
    convertedEventsTitle: t('admin.payments.mxn.convertedEventsTitle'),
    missingSnapshotsTitle: t('admin.payments.mxn.missingSnapshotsTitle'),
    tableTitle: t('admin.payments.mxn.tableTitle'),
    tableDescription: t('admin.payments.mxn.tableDescription'),
    currencyHeader: t('admin.payments.mxn.currencyHeader'),
    sourceHeader: t('admin.payments.mxn.sourceHeader'),
    mxnHeader: t('admin.payments.mxn.mxnHeader'),
    convertedEventsHeader: t('admin.payments.mxn.convertedEventsHeader'),
    missingSnapshotsHeader: t('admin.payments.mxn.missingSnapshotsHeader'),
    snapshotsHeader: t('admin.payments.mxn.snapshotsHeader'),
    missingTraceHeader: t('admin.payments.mxn.missingTraceHeader'),
    emptyState: t('admin.payments.mxn.emptyState'),
    notConvertedLabel: t('admin.payments.mxn.notConvertedLabel'),
  };

  const fxLabels = {
    sectionTitle: t('admin.payments.fx.sectionTitle'),
    sectionDescription: t('admin.payments.fx.sectionDescription'),
    missingTitle: t('admin.payments.fx.missingTitle'),
    staleTitle: t('admin.payments.fx.staleTitle'),
    upsertTitle: t('admin.payments.fx.upsertTitle'),
    upsertDescription: t('admin.payments.fx.upsertDescription'),
    currencyFieldLabel: t('admin.payments.fx.currencyFieldLabel'),
    dateFieldLabel: t('admin.payments.fx.dateFieldLabel'),
    rateFieldLabel: t('admin.payments.fx.rateFieldLabel'),
    reasonFieldLabel: t('admin.payments.fx.reasonFieldLabel'),
    submitLabel: t('admin.payments.fx.submitLabel'),
    ratesTableTitle: t('admin.payments.fx.ratesTableTitle'),
    ratesTableDescription: t('admin.payments.fx.ratesTableDescription'),
    tableCurrencyHeader: t('admin.payments.fx.tableCurrencyHeader'),
    tableDateHeader: t('admin.payments.fx.tableDateHeader'),
    tableRateHeader: t('admin.payments.fx.tableRateHeader'),
    tableReasonHeader: t('admin.payments.fx.tableReasonHeader'),
    tableUpdatedHeader: t('admin.payments.fx.tableUpdatedHeader'),
    emptyRates: t('admin.payments.fx.emptyRates'),
    noActions: t('admin.payments.fx.noActions'),
    missingDatesLabel: t('admin.payments.fx.missingDatesLabel'),
  };

  const artifactLabels = {
    sectionTitle: t('admin.payments.artifacts.sectionTitle'),
    sectionDescription: t('admin.payments.artifacts.sectionDescription'),
    formTitle: t('admin.payments.artifacts.formTitle'),
    formDescription: t('admin.payments.artifacts.formDescription'),
    operationFieldLabel: t('admin.payments.artifacts.operationFieldLabel'),
    operationRebuildLabel: t('admin.payments.artifacts.operationRebuildLabel'),
    operationResendLabel: t('admin.payments.artifacts.operationResendLabel'),
    traceFieldLabel: t('admin.payments.artifacts.traceFieldLabel'),
    artifactTypeFieldLabel: t('admin.payments.artifacts.artifactTypeFieldLabel'),
    artifactTypePayoutStatementLabel: t(
      'admin.payments.artifacts.artifactTypePayoutStatementLabel',
    ),
    artifactVersionFieldLabel: t('admin.payments.artifacts.artifactVersionFieldLabel'),
    reasonFieldLabel: t('admin.payments.artifacts.reasonFieldLabel'),
    submitLabel: t('admin.payments.artifacts.submitLabel'),
    refreshLabel: t('admin.payments.artifacts.refreshLabel'),
    refreshingLabel: t('admin.payments.artifacts.refreshingLabel'),
    submittingLabel: t('admin.payments.artifacts.submittingLabel'),
    successPrefix: t('admin.payments.artifacts.successPrefix'),
    policyDeniedPrefix: t('admin.payments.artifacts.policyDeniedPrefix'),
    genericErrorMessage: t('admin.payments.artifacts.genericErrorMessage'),
    recentVersionsTitle: t('admin.payments.artifacts.recentVersionsTitle'),
    recentVersionsDescription: t('admin.payments.artifacts.recentVersionsDescription'),
    recentDeliveriesTitle: t('admin.payments.artifacts.recentDeliveriesTitle'),
    recentDeliveriesDescription: t('admin.payments.artifacts.recentDeliveriesDescription'),
    versionsEmpty: t('admin.payments.artifacts.versionsEmpty'),
    deliveriesEmpty: t('admin.payments.artifacts.deliveriesEmpty'),
    versionTraceHeader: t('admin.payments.artifacts.versionTraceHeader'),
    versionNumberHeader: t('admin.payments.artifacts.versionNumberHeader'),
    versionFingerprintHeader: t('admin.payments.artifacts.versionFingerprintHeader'),
    versionLineageHeader: t('admin.payments.artifacts.versionLineageHeader'),
    versionReasonHeader: t('admin.payments.artifacts.versionReasonHeader'),
    versionRequestedByHeader: t('admin.payments.artifacts.versionRequestedByHeader'),
    versionCreatedAtHeader: t('admin.payments.artifacts.versionCreatedAtHeader'),
    deliveryTraceHeader: t('admin.payments.artifacts.deliveryTraceHeader'),
    deliveryVersionHeader: t('admin.payments.artifacts.deliveryVersionHeader'),
    deliveryChannelHeader: t('admin.payments.artifacts.deliveryChannelHeader'),
    deliveryRecipientHeader: t('admin.payments.artifacts.deliveryRecipientHeader'),
    deliveryReasonHeader: t('admin.payments.artifacts.deliveryReasonHeader'),
    deliveryRequestedByHeader: t('admin.payments.artifacts.deliveryRequestedByHeader'),
    deliveryCreatedAtHeader: t('admin.payments.artifacts.deliveryCreatedAtHeader'),
  };

  const caseLookupLabels = {
    sectionTitle: t('admin.payments.caseLookup.sectionTitle'),
    sectionDescription: t('admin.payments.caseLookup.sectionDescription'),
    searchTitle: t('admin.payments.caseLookup.searchTitle'),
    searchDescription: t('admin.payments.caseLookup.searchDescription'),
    queryFieldLabel: t('admin.payments.caseLookup.queryFieldLabel'),
    queryPlaceholder: t('admin.payments.caseLookup.queryPlaceholder'),
    searchButtonLabel: t('admin.payments.caseLookup.searchButtonLabel'),
    noQueryState: t('admin.payments.caseLookup.noQueryState'),
    noResultsState: t('admin.payments.caseLookup.noResultsState'),
    disambiguationTitle: t('admin.payments.caseLookup.disambiguationTitle'),
    disambiguationDescription: t('admin.payments.caseLookup.disambiguationDescription'),
    disambiguationEmpty: t('admin.payments.caseLookup.disambiguationEmpty'),
    resultsTitle: t('admin.payments.caseLookup.resultsTitle'),
    resultsDescription: t('admin.payments.caseLookup.resultsDescription'),
    summaryLabel: t('admin.payments.caseLookup.summaryLabel'),
    traceHeader: t('admin.payments.caseLookup.traceHeader'),
    rootEntityHeader: t('admin.payments.caseLookup.rootEntityHeader'),
    organizerHeader: t('admin.payments.caseLookup.organizerHeader'),
    eventCountHeader: t('admin.payments.caseLookup.eventCountHeader'),
    firstEventHeader: t('admin.payments.caseLookup.firstEventHeader'),
    lastEventHeader: t('admin.payments.caseLookup.lastEventHeader'),
    identifiersHeader: t('admin.payments.caseLookup.identifiersHeader'),
    sourcesHeader: t('admin.payments.caseLookup.sourcesHeader'),
  };

  const evidenceLabels = {
    sectionTitle: t('admin.payments.evidence.sectionTitle'),
    sectionDescription: t('admin.payments.evidence.sectionDescription'),
    requestTitle: t('admin.payments.evidence.requestTitle'),
    requestDescription: t('admin.payments.evidence.requestDescription'),
    traceFieldLabel: t('admin.payments.evidence.traceFieldLabel'),
    tracePlaceholder: t('admin.payments.evidence.tracePlaceholder'),
    loadButtonLabel: t('admin.payments.evidence.loadButtonLabel'),
    noTraceState: t('admin.payments.evidence.noTraceState'),
    notFoundState: t('admin.payments.evidence.notFoundState'),
    summaryTitle: t('admin.payments.evidence.summaryTitle'),
    summaryDescription: t('admin.payments.evidence.summaryDescription'),
    traceCreatedLabel: t('admin.payments.evidence.traceCreatedLabel'),
    firstEventLabel: t('admin.payments.evidence.firstEventLabel'),
    lastEventLabel: t('admin.payments.evidence.lastEventLabel'),
    rootEntityLabel: t('admin.payments.evidence.rootEntityLabel'),
    redactionLabel: t('admin.payments.evidence.redactionLabel'),
    currentStateLabel: t('admin.payments.evidence.currentStateLabel'),
    currentOwnerLabel: t('admin.payments.evidence.currentOwnerLabel'),
    nextTransitionLabel: t('admin.payments.evidence.nextTransitionLabel'),
    policyContextTitle: t('admin.payments.evidence.policyContextTitle'),
    policyContextEmpty: t('admin.payments.evidence.policyContextEmpty'),
    eventsTitle: t('admin.payments.evidence.eventsTitle'),
    eventsDescription: t('admin.payments.evidence.eventsDescription'),
    eventTimeHeader: t('admin.payments.evidence.eventTimeHeader'),
    eventNameHeader: t('admin.payments.evidence.eventNameHeader'),
    eventEntityHeader: t('admin.payments.evidence.eventEntityHeader'),
    eventOwnershipStateHeader: t('admin.payments.evidence.eventOwnershipStateHeader'),
    eventOwnershipOwnerHeader: t('admin.payments.evidence.eventOwnershipOwnerHeader'),
    eventOwnershipNextHeader: t('admin.payments.evidence.eventOwnershipNextHeader'),
    eventPayloadHeader: t('admin.payments.evidence.eventPayloadHeader'),
    artifactsVersionsTitle: t('admin.payments.evidence.artifactsVersionsTitle'),
    artifactsDeliveriesTitle: t('admin.payments.evidence.artifactsDeliveriesTitle'),
    artifactVersionHeader: t('admin.payments.evidence.artifactVersionHeader'),
    artifactFingerprintHeader: t('admin.payments.evidence.artifactFingerprintHeader'),
    artifactLineageHeader: t('admin.payments.evidence.artifactLineageHeader'),
    artifactReasonHeader: t('admin.payments.evidence.artifactReasonHeader'),
    artifactCreatedHeader: t('admin.payments.evidence.artifactCreatedHeader'),
    deliveryChannelHeader: t('admin.payments.evidence.deliveryChannelHeader'),
    deliveryRecipientHeader: t('admin.payments.evidence.deliveryRecipientHeader'),
    deliveryReasonHeader: t('admin.payments.evidence.deliveryReasonHeader'),
    deliveryCreatedHeader: t('admin.payments.evidence.deliveryCreatedHeader'),
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('admin.payments.title')}</h1>
        <p className="mt-2 text-muted-foreground">{t('admin.payments.description')}</p>
      </div>
      <NetRecognizedFeeDashboard
        locale={locale as AppLocale}
        metrics={metrics}
        labels={labels}
        rangeOptions={rangeOptions}
        selectedRange={selectedRange}
      />
      <DebtDisputeExposureDashboard
        locale={locale as AppLocale}
        metrics={exposureMetrics}
        labels={exposureLabels}
      />
      <MxnReportingDashboard locale={locale as AppLocale} report={mxnReport} labels={mxnLabels} />
      <FxRateManagementDashboard
        locale={locale as AppLocale}
        rates={fxRates}
        flags={fxFlags}
        labels={fxLabels}
        upsertAction={upsertFxRateFormAction}
      />
      <ArtifactGovernanceDashboard
        locale={locale as AppLocale}
        initialSummary={artifactSummary}
        labels={artifactLabels}
      />
      <FinancialCaseLookupDashboard
        locale={locale as AppLocale}
        selectedRange={selectedRange}
        searchQuery={caseQuery}
        result={caseLookupResult}
        labels={caseLookupLabels}
      />
      <EvidencePackReviewDashboard
        locale={locale as AppLocale}
        selectedRange={selectedRange}
        searchQuery={caseQuery}
        selectedTraceId={evidenceTraceId}
        evidencePack={evidencePack}
        labels={evidenceLabels}
      />
    </div>
  );
}
