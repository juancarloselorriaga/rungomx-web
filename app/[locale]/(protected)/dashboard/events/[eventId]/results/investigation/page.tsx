import { Badge } from '@/components/common/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  getInternalResultsInvestigationViewData,
  listResultTrustAuditLogsForEdition,
} from '@/lib/events/results/queries';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

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
  const auditAction = isTrustAuditActionOption(resolvedSearchParams?.auditAction)
    ? resolvedSearchParams?.auditAction
    : undefined;
  const auditFromDate = parseDateBoundary(resolvedSearchParams?.auditFrom, 'start');
  const auditToDate = parseDateBoundary(resolvedSearchParams?.auditTo, 'end');

  const [investigationData, auditLogs] = await Promise.all([
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

  const formatter = new Intl.DateTimeFormat(locale, {
    dateStyle: 'short',
    timeStyle: 'short',
  });

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight">{t('title')}</h2>
        <p className="text-muted-foreground">{t('description')}</p>
      </header>

      <section className="rounded-xl border bg-card p-4 shadow-sm">
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
                  fromStatus: investigationData.selectedDiff.fromStatus
                    ? t(`status.${investigationData.selectedDiff.fromStatus}` as const)
                    : t('fallback.unknown'),
                  toVersion: investigationData.selectedDiff.toVersionNumber ?? '?',
                  toStatus: investigationData.selectedDiff.toStatus
                    ? t(`status.${investigationData.selectedDiff.toStatus}` as const)
                    : t('fallback.unknown'),
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
      </section>

      <section className="rounded-xl border bg-card p-4 shadow-sm">
        <h3 className="text-sm font-semibold">{t('versions.title')}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{t('versions.description')}</p>

        {investigationData.versions.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{t('versions.empty')}</p>
        ) : (
          <div className="mt-3 space-y-3">
            {investigationData.versions.map((version) => (
              <article key={version.id} className="rounded-md border bg-background/50 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">
                    {t('versions.versionLabel', { version: version.versionNumber })}
                  </Badge>
                  <Badge variant="indigo">{t(`status.${version.status}` as const)}</Badge>
                  <Badge variant="outline">{t(`source.${version.source}` as const)}</Badge>
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
                    <dd>{formatDateTime(version.createdAt, formatter, t('fallback.notAvailable'))}</dd>
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
                    <dd>
                      {version.ingestion.sourceLane
                        ? t(`source.${version.ingestion.sourceLane}` as const)
                        : t('fallback.notAvailable')}
                    </dd>
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
      </section>

      <section className="rounded-xl border bg-card p-4 shadow-sm">
        <h3 className="text-sm font-semibold">{t('corrections.title')}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{t('corrections.description')}</p>

        {investigationData.corrections.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{t('corrections.empty')}</p>
        ) : (
          <div className="mt-3 space-y-3">
            {investigationData.corrections.map((item) => (
              <article key={item.requestId} className="rounded-md border bg-background/50 p-3">
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
                    <dd>{formatDateTime(item.reviewedAt, formatter, t('fallback.notAvailable'))}</dd>
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
                    href={encodeDiffLink(
                      item.sourceResultVersionId,
                      item.correctedResultVersionId,
                    )}
                    className="text-sm font-medium text-primary underline-offset-2 hover:underline"
                  >
                    {t('corrections.viewDiff')}
                  </a>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-card p-4 shadow-sm">
        <h3 className="text-sm font-semibold">{t('audit.title')}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{t('audit.description')}</p>

        <form className="mt-3 grid gap-3 md:grid-cols-4" method="get">
          <input
            type="hidden"
            name="fromVersionId"
            value={resolvedSearchParams?.fromVersionId ?? ''}
          />
          <input
            type="hidden"
            name="toVersionId"
            value={resolvedSearchParams?.toVersionId ?? ''}
          />
          <label className="grid gap-1 text-xs text-muted-foreground">
            <span>{t('audit.filters.action')}</span>
            <select
              name="auditAction"
              defaultValue={auditAction ?? ''}
              className="h-11 sm:h-10 rounded-md border bg-background px-3 text-sm text-foreground outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
            >
              <option value="">{t('audit.filters.allActions')}</option>
              {TRUST_AUDIT_ACTION_OPTIONS.map((action) => (
                <option key={action} value={action}>
                  {t(`audit.actions.${action}` as const)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            <span>{t('audit.filters.from')}</span>
            <Input
              type="date"
              name="auditFrom"
              defaultValue={resolvedSearchParams?.auditFrom ?? ''}
              className="shadow-none"
            />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            <span>{t('audit.filters.to')}</span>
            <Input
              type="date"
              name="auditTo"
              defaultValue={resolvedSearchParams?.auditTo ?? ''}
              className="shadow-none"
            />
          </label>
          <div className="flex items-end">
            <Button type="submit" className="min-w-0">
              {t('audit.filters.apply')}
            </Button>
          </div>
        </form>

        {auditLogs.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{t('audit.empty')}</p>
        ) : (
          <div className="mt-3 space-y-3">
            {auditLogs.map((item) => (
              <article key={item.id} className="rounded-md border bg-background/50 p-3">
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
      </section>
    </div>
  );
}
