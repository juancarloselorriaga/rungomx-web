import { upsertDailyFxRateAdminAction } from '@/app/actions/admin-payments-fx';
import {
  AdminPaymentsWorkspaceSection,
  AdminPaymentsWorkspaceShell,
} from '@/components/admin/payments/admin-payments-workspace-shell';
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

  const tDashboardRanges = await getTranslations('pages.dashboard.admin.metrics.ranges');
  const tPayments = await getTranslations('pages.adminPayments.admin.payments');
  const resolvedSearchParams: AdminPaymentsSearchParams = searchParams
    ? await searchParams
    : {};
  const rangeParam = resolvedSearchParams.range;
  const caseQueryParam = resolvedSearchParams.caseQuery;
  const lookupQueryParam = resolvedSearchParams.lookupQuery;
  const evidenceTraceIdParam = resolvedSearchParams.evidenceTraceId;
  const rawRange =
    typeof rangeParam === 'string'
      ? rangeParam
      : Array.isArray(rangeParam)
        ? rangeParam[0]
        : undefined;
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
    noQueryState: tPayments('caseLookup.noQueryState'),
    noResultsState: tPayments('caseLookup.noResultsState'),
    disambiguationTitle: tPayments('caseLookup.disambiguationTitle'),
    disambiguationDescription: tPayments('caseLookup.disambiguationDescription'),
    disambiguationEmpty: tPayments('caseLookup.disambiguationEmpty'),
    resultsTitle: tPayments('caseLookup.resultsTitle'),
    resultsDescription: tPayments('caseLookup.resultsDescription'),
    summaryLabel: tPayments('caseLookup.summaryLabel'),
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
    noTraceState: tPayments('evidence.noTraceState'),
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

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold">{tPayments('title')}</h1>
        <p className="max-w-3xl text-muted-foreground">{tPayments('description')}</p>
      </div>

      <AdminPaymentsWorkspaceShell
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
            id: 'fx',
            label: tPayments('nav.fxLabel'),
            description: tPayments('nav.fxDescription'),
          },
          {
            id: 'artifacts',
            label: tPayments('nav.artifactsLabel'),
            description: tPayments('nav.artifactsDescription'),
          },
          {
            id: 'cases',
            label: tPayments('nav.casesLabel'),
            description: tPayments('nav.casesDescription'),
          },
          {
            id: 'evidence',
            label: tPayments('nav.evidenceLabel'),
            description: tPayments('nav.evidenceDescription'),
          },
        ]}
      />

      <AdminPaymentsWorkspaceSection
        id="overview"
        eyebrow={tPayments('sections.overview.eyebrow')}
        title={tPayments('sections.overview.title')}
        description={tPayments('sections.overview.description')}
      >
        <div className="space-y-6">
          <NetRecognizedFeeDashboard
            locale={locale as AppLocale}
            metrics={metrics}
            labels={labels}
            rangeOptions={rangeOptions}
            selectedRange={selectedRange}
          />
          <MxnReportingDashboard
            locale={locale as AppLocale}
            report={mxnReport}
            labels={mxnLabels}
          />
        </div>
      </AdminPaymentsWorkspaceSection>

      <AdminPaymentsWorkspaceSection
        id="risk"
        eyebrow={tPayments('sections.risk.eyebrow')}
        title={tPayments('sections.risk.title')}
        description={tPayments('sections.risk.description')}
      >
        <DebtDisputeExposureDashboard
          locale={locale as AppLocale}
          metrics={exposureMetrics}
          labels={exposureLabels}
        />
      </AdminPaymentsWorkspaceSection>

      <AdminPaymentsWorkspaceSection
        id="fx"
        eyebrow={tPayments('sections.fx.eyebrow')}
        title={tPayments('sections.fx.title')}
        description={tPayments('sections.fx.description')}
        tone="caution"
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-amber-200 bg-background/80 p-4 text-sm text-muted-foreground">
            {tPayments('sections.operationsNote')}
          </div>
          <FxRateManagementDashboard
            locale={locale as AppLocale}
            rates={fxRates}
            flags={fxFlags}
            labels={fxLabels}
            upsertAction={upsertFxRateFormAction}
          />
        </div>
      </AdminPaymentsWorkspaceSection>

      <AdminPaymentsWorkspaceSection
        id="artifacts"
        eyebrow={tPayments('sections.artifacts.eyebrow')}
        title={tPayments('sections.artifacts.title')}
        description={tPayments('sections.artifacts.description')}
        tone="caution"
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-amber-200 bg-background/80 p-4 text-sm text-muted-foreground">
            {tPayments('sections.operationsNote')}
          </div>
          <ArtifactGovernanceDashboard
            locale={locale as AppLocale}
            initialSummary={artifactSummary}
            labels={artifactLabels}
          />
        </div>
      </AdminPaymentsWorkspaceSection>

      <AdminPaymentsWorkspaceSection
        id="cases"
        eyebrow={tPayments('sections.cases.eyebrow')}
        title={tPayments('sections.cases.title')}
        description={tPayments('sections.cases.description')}
      >
        <FinancialCaseLookupDashboard
          locale={locale as AppLocale}
          selectedRange={selectedRange}
          searchQuery={caseQuery}
          result={caseLookupResult}
          labels={caseLookupLabels}
        />
      </AdminPaymentsWorkspaceSection>

      <AdminPaymentsWorkspaceSection
        id="evidence"
        eyebrow={tPayments('sections.evidence.eyebrow')}
        title={tPayments('sections.evidence.title')}
        description={tPayments('sections.evidence.description')}
      >
        <EvidencePackReviewDashboard
          locale={locale as AppLocale}
          selectedRange={selectedRange}
          searchQuery={caseQuery}
          selectedTraceId={evidenceTraceId}
          evidencePack={evidencePack}
          labels={evidenceLabels}
        />
      </AdminPaymentsWorkspaceSection>
    </div>
  );
}
