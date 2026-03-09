import { Button } from '@/components/ui/button';
import type { FinancialCaseLookupResult } from '@/lib/payments/support/case-lookup';
import Link from 'next/link';

type FinancialCaseLookupLabels = {
  sectionTitle: string;
  sectionDescription: string;
  searchTitle: string;
  searchDescription: string;
  queryFieldLabel: string;
  queryPlaceholder: string;
  searchButtonLabel: string;
  noQueryTitle: string;
  noQueryState: string;
  noResultsTitle: string;
  noResultsState: string;
  disambiguationTitle: string;
  disambiguationDescription: string;
  disambiguationEmpty: string;
  resultsTitle: string;
  resultsDescription: string;
  summaryLabel: string;
  loadEvidenceLabel: string;
  evidenceLoadedLabel: string;
  traceHeader: string;
  rootEntityHeader: string;
  organizerHeader: string;
  eventCountHeader: string;
  firstEventHeader: string;
  lastEventHeader: string;
  identifiersHeader: string;
  sourcesHeader: string;
};

type FinancialCaseLookupDashboardProps = {
  locale: 'es' | 'en';
  selectedRange: '7d' | '14d' | '30d';
  searchQuery: string;
  result: FinancialCaseLookupResult | null;
  labels: FinancialCaseLookupLabels;
  workspace?: string;
  selectedTraceId?: string;
  investigationTool?: 'lookup' | 'trace';
};

function formatDate(value: Date | string | null | undefined, locale: 'es' | 'en'): string {
  if (!value) return '—';
  const normalized = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(normalized.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(normalized);
}

function truncateMiddle(value: string | null | undefined, start = 10, end = 6): string {
  if (!value) return '—';
  if (value.length <= start + end + 1) return value;
  return `${value.slice(0, start)}…${value.slice(-end)}`;
}

export function FinancialCaseLookupDashboard({
  locale,
  selectedRange,
  searchQuery,
  result,
  labels,
  workspace,
  selectedTraceId,
  investigationTool,
}: FinancialCaseLookupDashboardProps) {
  const hasQuery = searchQuery.trim().length > 0;
  const hasResults = (result?.cases.length ?? 0) > 0;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold leading-tight">{labels.sectionTitle}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{labels.sectionDescription}</p>
      </div>

      <div className="rounded-xl border bg-card/80 p-4 shadow-sm">
        <h3 className="text-sm font-semibold">{labels.searchTitle}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{labels.searchDescription}</p>
        <form method="get" className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
          <input type="hidden" name="range" value={selectedRange} />
          {workspace ? <input type="hidden" name="workspace" value={workspace} /> : null}
          {investigationTool ? (
            <input type="hidden" name="investigationTool" value={investigationTool} />
          ) : null}
          <label className="space-y-1 text-xs">
            <span className="uppercase tracking-wide text-muted-foreground">
              {labels.queryFieldLabel}
            </span>
            <input
              name="caseQuery"
              defaultValue={searchQuery}
              maxLength={128}
              placeholder={labels.queryPlaceholder}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </label>
          <div className="self-end">
            <Button type="submit" className="w-full md:w-auto">
              {labels.searchButtonLabel}
            </Button>
          </div>
        </form>
      </div>

      {!hasQuery ? (
        <div className="rounded-xl border border-dashed bg-card/60 p-4 shadow-sm">
          <p className="text-sm font-medium">{labels.noQueryTitle}</p>
          <p className="mt-2 text-sm text-muted-foreground">{labels.noQueryState}</p>
        </div>
      ) : !hasResults ? (
        <div className="rounded-xl border border-dashed bg-card/60 p-4 shadow-sm">
          <p className="text-sm font-medium">{labels.noResultsTitle}</p>
          <p className="mt-2 text-sm text-muted-foreground">{labels.noResultsState}</p>
        </div>
      ) : (
        <>
          <div className="rounded-xl border bg-card/80 p-4 shadow-sm">
            <h3 className="text-sm font-semibold">{labels.disambiguationTitle}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{labels.disambiguationDescription}</p>
            {result?.disambiguationGroups.length ? (
              <div className="mt-3 space-y-2">
                {result.disambiguationGroups.map((group) => (
                  <div key={`${group.normalizedIdentifier}-${group.traceIds.join(':')}`} className="rounded border border-dashed p-3">
                    <p className="font-mono text-xs">{group.displayIdentifier}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{group.reason}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {group.traceIds.join(', ')}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">{labels.disambiguationEmpty}</p>
            )}
          </div>

          <div className="rounded-xl border bg-card/80 p-4 shadow-sm">
            <h3 className="text-sm font-semibold">{labels.resultsTitle}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{labels.resultsDescription}</p>
            <p className="mt-3 text-xs text-muted-foreground">
              {labels.summaryLabel}: {result?.totalCaseCount ?? 0}
            </p>

            <div className="mt-4 space-y-3">
              {result?.cases.map((entry) => {
                const isSelected = selectedTraceId === entry.traceId;
                const href = new URLSearchParams({
                  range: selectedRange,
                  caseQuery: searchQuery,
                  evidenceTraceId: entry.traceId,
                  investigationTool: 'trace',
                });

                if (workspace) {
                  href.set('workspace', workspace);
                }

                return (
                  <article
                    key={entry.traceId}
                    className="rounded-xl border bg-background/40 p-4 shadow-sm"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-2">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">
                            {labels.traceHeader}
                          </p>
                          <p className="mt-1 font-mono text-sm" title={entry.traceId}>
                            {truncateMiddle(entry.traceId, 18, 10)}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <span className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground">
                            {labels.eventCountHeader}: {entry.eventCount}
                          </span>
                          <span className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground">
                            {labels.firstEventHeader}: {formatDate(entry.firstOccurredAt, locale)}
                          </span>
                          <span className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground">
                            {labels.lastEventHeader}: {formatDate(entry.lastOccurredAt, locale)}
                          </span>
                        </div>
                      </div>

                      <Button asChild size="sm" variant={isSelected ? 'secondary' : 'outline'}>
                        <Link href={`?${href.toString()}`}>
                          {isSelected ? labels.evidenceLoadedLabel : labels.loadEvidenceLabel}
                        </Link>
                      </Button>
                    </div>

                    <dl className="mt-4 grid gap-4 md:grid-cols-2">
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                          {labels.rootEntityHeader}
                        </dt>
                        <dd className="mt-1 text-sm">
                          {entry.rootEntityType}:{truncateMiddle(entry.rootEntityId, 18, 10)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                          {labels.organizerHeader}
                        </dt>
                        <dd className="mt-1 font-mono text-sm" title={entry.organizerId ?? ''}>
                          {truncateMiddle(entry.organizerId, 12, 8)}
                        </dd>
                      </div>
                    </dl>

                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          {labels.identifiersHeader}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {entry.matchedIdentifiers.map((identifier) => (
                            <span
                              key={`${entry.traceId}:${identifier}`}
                              className="rounded-full border px-2.5 py-1 text-xs"
                              title={identifier}
                            >
                              {truncateMiddle(identifier, 12, 8)}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          {labels.sourcesHeader}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {entry.matchSources.map((source) => (
                            <span
                              key={`${entry.traceId}:${source}`}
                              className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground"
                            >
                              {source}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
