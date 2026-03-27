import { Badge } from '@/components/common/badge';
import { Surface } from '@/components/ui/surface';
import {
  getInternalResultsInvestigationViewData,
  listResultTrustAuditLogsForEdition,
} from '@/lib/events/results/queries';
import type {
  ResultIngestionSourceLane,
  ResultVersionSource,
  ResultVersionStatus,
} from '@/lib/events/results/types';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { ResultsPageHero } from '../_results-page-hero';
import { ResultsInvestigationAuditFiltersForm } from './_audit-filters-form';

type ResultsInvestigationPageProps = LocalePageProps & {
  params: Promise<{ locale: string; eventId: string }>;
  searchParams?: Promise<{
    fromVersionId?: string;
    toVersionId?: string;
    auditAction?: string;
    auditFrom?: string;
    auditTo?: string;
  }>;
};

const TRUST_AUDIT_ACTION_OPTIONS = [
  'results.ingestion.initialize',
  'results.version.finalize',
  'results.correction.review.approve',
  'results.correction.publish',
] as const;

type TrustAuditActionOption = (typeof TRUST_AUDIT_ACTION_OPTIONS)[number];

function formatDateTime(
  value: Date | null,
  formatter: Intl.DateTimeFormat,
  fallback: string,
): string {
  if (!value) return fallback;
  return formatter.format(value);
}

function encodeDiffLink(sourceVersionId: string, targetVersionId: string): string {
  const params = new URLSearchParams({
    fromVersionId: sourceVersionId,
    toVersionId: targetVersionId,
  });
  return `?${params.toString()}`;
}

function parseDateBoundary(value: string | undefined, kind: 'start' | 'end'): Date | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T${kind === 'start' ? '00:00:00.000' : '23:59:59.999'}Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function isTrustAuditActionOption(value: string | undefined): value is TrustAuditActionOption {
  if (!value) return false;
  return TRUST_AUDIT_ACTION_OPTIONS.includes(value as TrustAuditActionOption);
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Results investigation | RunGoMX',
    robots: { index: false, follow: false },
  };
}

export default async function ResultsInvestigationPage({
  params,
  searchParams,
}: ResultsInvestigationPageProps) {
  const { locale, eventId } = await params;
  const resolvedSearchParams = await searchParams;
  await configPageLocale(params, {
    pathname: '/dashboard/events/[eventId]/results/investigation',
  });
  const t = await getTranslations('pages.dashboardEvents.resultsWorkspace.investigation');
  const tCommon = await getTranslations('common');
  const auditAction = isTrustAuditActionOption(resolvedSearchParams?.auditAction)
    ? resolvedSearchParams?.auditAction
    : undefined;
  const auditFromDate = parseDateBoundary(resolvedSearchParams?.auditFrom, 'start');
  const auditToDate = parseDateBoundary(resolvedSearchParams?.auditTo, 'end');

  type InvestigationData = Awaited<ReturnType<typeof getInternalResultsInvestigationViewData>>;

  const investigationFallback: InvestigationData = {
    editionId: eventId,
    versions: [],
    corrections: [],
    selectedDiff: null,
  };

  let investigationData: InvestigationData = investigationFallback;
  let auditLogs: Awaited<ReturnType<typeof listResultTrustAuditLogsForEdition>> = [];
  let loadFailed = false;

  const [investigationResult, auditLogsResult] = await Promise.allSettled([
    getInternalResultsInvestigationViewData({
      editionId: eventId,
      fromVersionId: resolvedSearchParams?.fromVersionId,
      toVersionId: resolvedSearchParams?.toVersionId,
    }),
    listResultTrustAuditLogsForEdition({
      editionId: eventId,
      action: auditAction,
      createdFrom: auditFromDate,
      createdTo: auditToDate,
      limit: 80,
    }),
  ]);

  if (investigationResult.status === 'fulfilled') {
    investigationData = investigationResult.value;
  } else {
    loadFailed = true;
    console.error('[ResultsInvestigationPage] Failed to load investigation view data', {
      editionId: eventId,
      error: investigationResult.reason,
    });
  }

  if (auditLogsResult.status === 'fulfilled') {
    auditLogs = auditLogsResult.value;
  } else {
    loadFailed = true;
    console.error('[ResultsInvestigationPage] Failed to load trust audit logs', {
      editionId: eventId,
      error: auditLogsResult.reason,
    });
  }

  const formatter = new Intl.DateTimeFormat(locale, {
    dateStyle: 'short',
    timeStyle: 'short',
  });

  const statusLabel = (status: ResultVersionStatus | null | undefined, fallback: string) => {
    if (!status) return fallback;
    switch (status) {
      case 'draft':
        return t('status.draft');
      case 'official':
        return t('status.official');
      case 'corrected':
        return t('status.corrected');
    }
  };

  const sourceLabel = (
    source: ResultVersionSource | ResultIngestionSourceLane | null | undefined,
    fallback: string,
  ) => {
    if (!source) return fallback;
    switch (source) {
      case 'manual_offline':
        return t('source.manual_offline');
      case 'csv_excel':
        return t('source.csv_excel');
      case 'correction':
        return t('source.correction');
    }
  };

  return (
    <div className="space-y-6">
      <ResultsPageHero
        title={t('title')}
        description={t('description')}
        stats={[
          {
            label: t('versions.title'),
            value: String(investigationData.versions.length),
          },
          {
            label: t('corrections.title'),
            value: String(investigationData.corrections.length),
          },
          {
            label: t('audit.title'),
            value: String(auditLogs.length),
          },
        ]}
      />

      {loadFailed ? (
        <Surface className="border-destructive/30 bg-destructive/5 p-4 text-sm shadow-none">
          <p className="font-semibold text-destructive">{tCommon('error')}</p>
          <p className="mt-1 text-muted-foreground">{t('loadError')}</p>
        </Surface>
      ) : null}

      <Surface>
        <h3 className="text-sm font-semibold">{t('selectedDiff.title')}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{t('selectedDiff.description')}</p>

        {investigationData.selectedDiff ? (
          <dl className="mt-3 grid gap-3 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="font-semibold uppercase tracking-wide">
                {t('selectedDiff.fields.fromVersion')}
              </dt>
              <dd className="font-mono text-foreground">
                {investigationData.selectedDiff.fromVersionId}
              </dd>
            </div>
            <div>
              <dt className="font-semibold uppercase tracking-wide">
                {t('selectedDiff.fields.toVersion')}
              </dt>
              <dd className="font-mono text-foreground">
                {investigationData.selectedDiff.toVersionId}
              </dd>
            </div>
            <div>
              <dt className="font-semibold uppercase tracking-wide">
                {t('selectedDiff.fields.transition')}
              </dt>
              <dd className="text-foreground">
                {t('selectedDiff.transitionValue', {
                  fromVersion: investigationData.selectedDiff.fromVersionNumber ?? '?',
                  fromStatus: statusLabel(
                    investigationData.selectedDiff.fromStatus,
                    t('fallback.unknown'),
                  ),
                  toVersion: investigationData.selectedDiff.toVersionNumber ?? '?',
                  toStatus: statusLabel(
                    investigationData.selectedDiff.toStatus,
                    t('fallback.unknown'),
                  ),
                })}
              </dd>
            </div>
            <div>
              <dt className="font-semibold uppercase tracking-wide">
                {t('selectedDiff.fields.approver')}
              </dt>
              <dd>
                {investigationData.selectedDiff.approverDisplayName ??
                  investigationData.selectedDiff.approverUserId ??
                  t('fallback.notAvailable')}
              </dd>
            </div>
            <div>
              <dt className="font-semibold uppercase tracking-wide">
                {t('selectedDiff.fields.reviewedAt')}
              </dt>
              <dd>
                {formatDateTime(
                  investigationData.selectedDiff.reviewedAt,
                  formatter,
                  t('fallback.notAvailable'),
                )}
              </dd>
            </div>
            <div>
              <dt className="font-semibold uppercase tracking-wide">
                {t('selectedDiff.fields.publishedAt')}
              </dt>
              <dd>
                {formatDateTime(
                  investigationData.selectedDiff.publishedAt,
                  formatter,
                  t('fallback.notAvailable'),
                )}
              </dd>
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <dt className="font-semibold uppercase tracking-wide">
                {t('selectedDiff.fields.reason')}
              </dt>
              <dd className="text-sm text-foreground">{investigationData.selectedDiff.reason}</dd>
            </div>
          </dl>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">{t('selectedDiff.empty')}</p>
        )}
      </Surface>

      <Surface>
        <h3 className="text-sm font-semibold">{t('versions.title')}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{t('versions.description')}</p>

        {investigationData.versions.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{t('versions.empty')}</p>
        ) : (
          <div className="mt-3 space-y-3">
            {investigationData.versions.map((version) => (
              <article
                key={version.id}
                className="rounded-md border bg-muted/20 p-3 dark:bg-muted/40"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">
                    {t('versions.versionLabel', { version: version.versionNumber })}
                  </Badge>
                  <Badge variant="indigo">
                    {statusLabel(version.status, t('fallback.unknown'))}
                  </Badge>
                  <Badge variant="outline">
                    {sourceLabel(version.source, t('fallback.unknown'))}
                  </Badge>
                </div>

                <dl className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <dt className="font-semibold uppercase tracking-wide">
                      {t('versions.fields.versionId')}
                    </dt>
                    <dd className="font-mono text-[11px] text-foreground">{version.id}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold uppercase tracking-wide">
                      {t('versions.fields.parentVersionId')}
                    </dt>
                    <dd className="font-mono text-[11px] text-foreground">
                      {version.parentVersionId ?? t('fallback.notAvailable')}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold uppercase tracking-wide">
                      {t('versions.fields.createdAt')}
                    </dt>
                    <dd>
                      {formatDateTime(version.createdAt, formatter, t('fallback.notAvailable'))}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold uppercase tracking-wide">
                      {t('versions.fields.finalizedAt')}
                    </dt>
                    <dd>
                      {formatDateTime(version.finalizedAt, formatter, t('fallback.notAvailable'))}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold uppercase tracking-wide">
                      {t('versions.fields.createdBy')}
                    </dt>
                    <dd>
                      {version.createdByDisplayName ??
                        version.createdByUserId ??
                        t('fallback.notAvailable')}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold uppercase tracking-wide">
                      {t('versions.fields.finalizedBy')}
                    </dt>
                    <dd>
                      {version.finalizedByDisplayName ??
                        version.finalizedByUserId ??
                        t('fallback.notAvailable')}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold uppercase tracking-wide">
                      {t('versions.fields.sourceReference')}
                    </dt>
                    <dd>{version.sourceReference ?? t('fallback.notAvailable')}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold uppercase tracking-wide">
                      {t('versions.fields.sourceChecksum')}
                    </dt>
                    <dd className="font-mono text-[11px]">
                      {version.sourceFileChecksum ?? t('fallback.notAvailable')}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold uppercase tracking-wide">
                      {t('versions.fields.ingestionLane')}
                    </dt>
                    <dd>{sourceLabel(version.ingestion.sourceLane, t('fallback.notAvailable'))}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold uppercase tracking-wide">
                      {t('versions.fields.ingestionStartedAt')}
                    </dt>
                    <dd>
                      {formatDateTime(
                        version.ingestion.startedAt,
                        formatter,
                        t('fallback.notAvailable'),
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold uppercase tracking-wide">
                      {t('versions.fields.ingestionStartedBy')}
                    </dt>
                    <dd>
                      {version.ingestion.startedByDisplayName ??
                        version.ingestion.startedByUserId ??
                        t('fallback.notAvailable')}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold uppercase tracking-wide">
                      {t('versions.fields.ingestionSessionId')}
                    </dt>
                    <dd className="font-mono text-[11px]">
                      {version.ingestion.sessionId ?? t('fallback.notAvailable')}
                    </dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        )}
      </Surface>

      <Surface>
        <h3 className="text-sm font-semibold">{t('corrections.title')}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{t('corrections.description')}</p>

        {investigationData.corrections.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{t('corrections.empty')}</p>
        ) : (
          <div className="mt-3 space-y-3">
            {investigationData.corrections.map((item) => (
              <article
                key={item.requestId}
                className="rounded-md border bg-muted/20 p-3 dark:bg-muted/40"
              >
                <dl className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <dt className="font-semibold uppercase tracking-wide">
                      {t('corrections.fields.requestId')}
                    </dt>
                    <dd className="font-mono text-[11px] text-foreground">{item.requestId}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold uppercase tracking-wide">
                      {t('corrections.fields.transition')}
                    </dt>
                    <dd className="font-mono text-[11px] text-foreground">
                      {item.sourceResultVersionId} {'->'} {item.correctedResultVersionId}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold uppercase tracking-wide">
                      {t('corrections.fields.requestedBy')}
                    </dt>
                    <dd>
                      {item.requestedByDisplayName ??
                        item.requestedByUserId ??
                        t('fallback.notAvailable')}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold uppercase tracking-wide">
                      {t('corrections.fields.reviewedBy')}
                    </dt>
                    <dd>
                      {item.reviewedByDisplayName ??
                        item.reviewedByUserId ??
                        t('fallback.notAvailable')}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold uppercase tracking-wide">
                      {t('corrections.fields.reviewedAt')}
                    </dt>
                    <dd>
                      {formatDateTime(item.reviewedAt, formatter, t('fallback.notAvailable'))}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold uppercase tracking-wide">
                      {t('corrections.fields.publishedAt')}
                    </dt>
                    <dd>
                      {formatDateTime(item.publishedAt, formatter, t('fallback.notAvailable'))}
                    </dd>
                  </div>
                  <div className="sm:col-span-2 lg:col-span-4">
                    <dt className="font-semibold uppercase tracking-wide">
                      {t('corrections.fields.reason')}
                    </dt>
                    <dd className="text-sm text-foreground">{item.reason}</dd>
                  </div>
                </dl>

                <div className="mt-3">
                  <a
                    href={encodeDiffLink(item.sourceResultVersionId, item.correctedResultVersionId)}
                    className="text-sm font-medium text-primary underline-offset-2 hover:underline"
                  >
                    {t('corrections.viewDiff')}
                  </a>
                </div>
              </article>
            ))}
          </div>
        )}
      </Surface>

      <Surface>
        <h3 className="text-sm font-semibold">{t('audit.title')}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{t('audit.description')}</p>

        <ResultsInvestigationAuditFiltersForm
          locale={locale}
          fromVersionId={resolvedSearchParams?.fromVersionId ?? ''}
          toVersionId={resolvedSearchParams?.toVersionId ?? ''}
          auditAction={auditAction}
          auditFrom={resolvedSearchParams?.auditFrom}
          auditTo={resolvedSearchParams?.auditTo}
          clearLabel={tCommon('clear')}
          labels={{
            action: t('audit.filters.action'),
            allActions: t('audit.filters.allActions'),
            from: t('audit.filters.from'),
            to: t('audit.filters.to'),
            apply: t('audit.filters.apply'),
          }}
          actionOptions={TRUST_AUDIT_ACTION_OPTIONS.map((action) => ({
            value: action,
            label: t(`audit.actions.${action}` as const),
          }))}
        />

        {auditLogs.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{t('audit.empty')}</p>
        ) : (
          <div className="mt-3 space-y-3">
            {auditLogs.map((item) => (
              <article key={item.id} className="rounded-md border bg-muted/20 p-3 dark:bg-muted/40">
                <dl className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <dt className="font-semibold uppercase tracking-wide">
                      {t('audit.fields.action')}
                    </dt>
                    <dd className="text-foreground">
                      {t(`audit.actions.${item.action}` as const)}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold uppercase tracking-wide">
                      {t('audit.fields.actor')}
                    </dt>
                    <dd>{item.actorDisplayName ?? item.actorUserId}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold uppercase tracking-wide">
                      {t('audit.fields.entity')}
                    </dt>
                    <dd className="font-mono text-[11px] text-foreground">
                      {item.entityType}:{item.entityId}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold uppercase tracking-wide">
                      {t('audit.fields.timestamp')}
                    </dt>
                    <dd>{formatter.format(item.createdAt)}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        )}
      </Surface>
    </div>
  );
}
