import type { CorrectionLifecycleMetrics } from '@/lib/events/results/types';

type CorrectionLifecycleMetricsProps = {
  metrics: CorrectionLifecycleMetrics;
  locale: string;
  labels: {
    title: string;
    description: string;
    generatedAtLabel: string;
    filtersTitle: string;
    summary: {
      total: string;
      pending: string;
      approved: string;
      rejected: string;
      medianResolutionHours: string;
      oldestPendingHours: string;
    };
    aging: {
      title: string;
      description: string;
      lessThan24Hours: string;
      oneToThreeDays: string;
      threeToSevenDays: string;
      moreThanSevenDays: string;
      highlightsTitle: string;
      highlightsEmpty: string;
      requestedAt: string;
      requestedBy: string;
      edition: string;
      ageHours: string;
    };
    export: {
      action: string;
      helper: string;
      empty: string;
      filePrefix: string;
    };
    fallback: {
      notAvailable: string;
      notSet: string;
    };
    filters: {
      editionId: string;
      organizationId: string;
      requestedFrom: string;
      requestedTo: string;
    };
  };
};

function escapeCsvCell(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n')) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

function buildExportCsv(rows: CorrectionLifecycleMetrics['exportRows']): string {
  const headers = [
    'request_id',
    'status',
    'reason',
    'edition_id',
    'edition_label',
    'organization_id',
    'requested_by_user_id',
    'reviewed_by_user_id',
    'requested_at',
    'reviewed_at',
    'resolution_millis',
    'pending_age_hours',
  ];

  const lines = rows.map((row) =>
    [
      row.requestId,
      row.status,
      row.reason,
      row.editionId,
      row.editionLabel,
      row.organizationId,
      row.requestedByUserId,
      row.reviewedByUserId ?? '',
      row.requestedAt.toISOString(),
      row.reviewedAt ? row.reviewedAt.toISOString() : '',
      row.resolutionMillis !== null ? String(row.resolutionMillis) : '',
      row.pendingAgeHours !== null ? String(row.pendingAgeHours) : '',
    ]
      .map((cell) => escapeCsvCell(cell))
      .join(','),
  );

  return [headers.join(','), ...lines].join('\n');
}

function toValueLabel(value: string | number | null | undefined, fallback: string): string {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'number') return value.toLocaleString();
  return value;
}

export function CorrectionLifecycleMetricsPanel({
  metrics,
  locale,
  labels,
}: CorrectionLifecycleMetricsProps) {
  const formatter = new Intl.DateTimeFormat(locale, {
    dateStyle: 'short',
    timeStyle: 'short',
  });

  const csv = buildExportCsv(metrics.exportRows);
  const csvHref = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
  const csvFileName = `${labels.export.filePrefix}-${metrics.generatedAt
    .toISOString()
    .slice(0, 19)
    .replaceAll(':', '-')}.csv`;

  return (
    <section className="space-y-4 rounded-xl border bg-card p-4 shadow-sm sm:p-5">
      <header className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground sm:text-base">{labels.title}</h3>
        <p className="text-xs text-muted-foreground sm:text-sm">{labels.description}</p>
        <p className="text-xs text-muted-foreground">
          {labels.generatedAtLabel}: {formatter.format(metrics.generatedAt)}
        </p>
      </header>

      <div className="space-y-2 rounded-md border border-border/70 bg-muted/30 px-3 py-2 dark:bg-muted/60">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {labels.filtersTitle}
        </p>
        <dl className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="font-semibold uppercase tracking-wide">{labels.filters.editionId}</dt>
            <dd>{toValueLabel(metrics.filters.editionId, labels.fallback.notSet)}</dd>
          </div>
          <div>
            <dt className="font-semibold uppercase tracking-wide">{labels.filters.organizationId}</dt>
            <dd>{toValueLabel(metrics.filters.organizationId, labels.fallback.notSet)}</dd>
          </div>
          <div>
            <dt className="font-semibold uppercase tracking-wide">{labels.filters.requestedFrom}</dt>
            <dd>
              {metrics.filters.requestedFrom
                ? formatter.format(metrics.filters.requestedFrom)
                : labels.fallback.notSet}
            </dd>
          </div>
          <div>
            <dt className="font-semibold uppercase tracking-wide">{labels.filters.requestedTo}</dt>
            <dd>
              {metrics.filters.requestedTo
                ? formatter.format(metrics.filters.requestedTo)
                : labels.fallback.notSet}
            </dd>
          </div>
        </dl>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <article className="rounded-md border bg-muted/30 p-3 dark:bg-muted/60">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{labels.summary.total}</p>
          <p className="text-xl font-semibold text-foreground">{metrics.statusCounts.total.toLocaleString()}</p>
        </article>
        <article className="rounded-md border bg-muted/30 p-3 dark:bg-muted/60">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{labels.summary.pending}</p>
          <p className="text-xl font-semibold text-foreground">
            {metrics.statusCounts.pending.toLocaleString()}
          </p>
        </article>
        <article className="rounded-md border bg-muted/30 p-3 dark:bg-muted/60">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{labels.summary.approved}</p>
          <p className="text-xl font-semibold text-foreground">
            {metrics.statusCounts.approved.toLocaleString()}
          </p>
        </article>
        <article className="rounded-md border bg-muted/30 p-3 dark:bg-muted/60">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{labels.summary.rejected}</p>
          <p className="text-xl font-semibold text-foreground">
            {metrics.statusCounts.rejected.toLocaleString()}
          </p>
        </article>
        <article className="rounded-md border bg-muted/30 p-3 dark:bg-muted/60">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {labels.summary.medianResolutionHours}
          </p>
          <p className="text-xl font-semibold text-foreground">
            {metrics.medianResolutionHours !== null
              ? metrics.medianResolutionHours.toLocaleString()
              : labels.fallback.notAvailable}
          </p>
        </article>
        <article className="rounded-md border bg-muted/30 p-3 dark:bg-muted/60">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {labels.summary.oldestPendingHours}
          </p>
          <p className="text-xl font-semibold text-foreground">
            {metrics.pendingAging.oldestPendingAgeHours !== null
              ? metrics.pendingAging.oldestPendingAgeHours.toLocaleString()
              : labels.fallback.notAvailable}
          </p>
        </article>
      </div>

      <section className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {labels.aging.title}
        </p>
        <p className="text-xs text-muted-foreground">{labels.aging.description}</p>
        <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
          <p className="rounded-md border bg-muted/30 px-3 py-2 dark:bg-muted/60">
            {labels.aging.lessThan24Hours}: {metrics.pendingAging.buckets.lessThan24Hours.toLocaleString()}
          </p>
          <p className="rounded-md border bg-muted/30 px-3 py-2 dark:bg-muted/60">
            {labels.aging.oneToThreeDays}: {metrics.pendingAging.buckets.oneToThreeDays.toLocaleString()}
          </p>
          <p className="rounded-md border bg-muted/30 px-3 py-2 dark:bg-muted/60">
            {labels.aging.threeToSevenDays}: {metrics.pendingAging.buckets.threeToSevenDays.toLocaleString()}
          </p>
          <p className="rounded-md border bg-muted/30 px-3 py-2 dark:bg-muted/60">
            {labels.aging.moreThanSevenDays}: {metrics.pendingAging.buckets.moreThanSevenDays.toLocaleString()}
          </p>
        </div>
      </section>

      <section className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {labels.aging.highlightsTitle}
        </p>
        {metrics.agingHighlights.length === 0 ? (
          <p className="rounded-md border border-border/70 bg-muted/40 px-3 py-2 text-sm text-muted-foreground dark:bg-muted/60">
            {labels.aging.highlightsEmpty}
          </p>
        ) : (
          <div className="space-y-2">
            {metrics.agingHighlights.map((item) => (
              <article key={item.requestId} className="rounded-md border bg-muted/30 p-3 dark:bg-muted/60">
                <dl className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <dt className="font-semibold uppercase tracking-wide">{labels.aging.edition}</dt>
                    <dd>{item.editionLabel}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold uppercase tracking-wide">{labels.aging.requestedBy}</dt>
                    <dd>{item.requestedByUserId}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold uppercase tracking-wide">{labels.aging.requestedAt}</dt>
                    <dd>{formatter.format(item.requestedAt)}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold uppercase tracking-wide">{labels.aging.ageHours}</dt>
                    <dd>{item.pendingAgeHours.toLocaleString()}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2">
        {metrics.exportRows.length === 0 ? (
          <p className="rounded-md border border-border/70 bg-muted/40 px-3 py-2 text-sm text-muted-foreground dark:bg-muted/60">
            {labels.export.empty}
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={csvHref}
              download={csvFileName}
              className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
            >
              {labels.export.action}
            </a>
            <p className="text-xs text-muted-foreground">
              {labels.export.helper}: {metrics.exportRows.length.toLocaleString()}
            </p>
          </div>
        )}
      </section>
    </section>
  );
}
