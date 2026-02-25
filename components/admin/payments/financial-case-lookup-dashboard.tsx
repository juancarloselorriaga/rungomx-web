import type { FinancialCaseLookupResult } from '@/lib/payments/support/case-lookup';

type FinancialCaseLookupLabels = {
  sectionTitle: string;
  sectionDescription: string;
  searchTitle: string;
  searchDescription: string;
  queryFieldLabel: string;
  queryPlaceholder: string;
  searchButtonLabel: string;
  noQueryState: string;
  noResultsState: string;
  disambiguationTitle: string;
  disambiguationDescription: string;
  disambiguationEmpty: string;
  resultsTitle: string;
  resultsDescription: string;
  summaryLabel: string;
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
};

function formatDate(value: Date | null, locale: 'es' | 'en'): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
}

export function FinancialCaseLookupDashboard({
  locale,
  selectedRange,
  searchQuery,
  result,
  labels,
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
            <button
              type="submit"
              className="rounded-md border bg-foreground px-4 py-2 text-sm font-medium text-background"
            >
              {labels.searchButtonLabel}
            </button>
          </div>
        </form>
      </div>

      {!hasQuery ? (
        <div className="rounded-xl border bg-card/80 p-4 text-sm text-muted-foreground shadow-sm">
          {labels.noQueryState}
        </div>
      ) : !hasResults ? (
        <div className="rounded-xl border bg-card/80 p-4 text-sm text-muted-foreground shadow-sm">
          {labels.noResultsState}
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

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[72rem] text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="pb-2 pr-4">{labels.traceHeader}</th>
                    <th className="pb-2 pr-4">{labels.rootEntityHeader}</th>
                    <th className="pb-2 pr-4">{labels.organizerHeader}</th>
                    <th className="pb-2 pr-4 text-right">{labels.eventCountHeader}</th>
                    <th className="pb-2 pr-4">{labels.firstEventHeader}</th>
                    <th className="pb-2 pr-4">{labels.lastEventHeader}</th>
                    <th className="pb-2 pr-4">{labels.identifiersHeader}</th>
                    <th className="pb-2">{labels.sourcesHeader}</th>
                  </tr>
                </thead>
                <tbody>
                  {result?.cases.map((entry) => (
                    <tr key={entry.traceId} className="border-t align-top">
                      <td className="py-2 pr-4 font-mono text-xs">{entry.traceId}</td>
                      <td className="py-2 pr-4 text-xs">
                        {entry.rootEntityType}:{entry.rootEntityId}
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs">
                        {entry.organizerId ?? '—'}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">{entry.eventCount}</td>
                      <td className="py-2 pr-4 text-xs text-muted-foreground">
                        {formatDate(entry.firstOccurredAt, locale)}
                      </td>
                      <td className="py-2 pr-4 text-xs text-muted-foreground">
                        {formatDate(entry.lastOccurredAt, locale)}
                      </td>
                      <td className="py-2 pr-4 text-xs">{entry.matchedIdentifiers.join(', ')}</td>
                      <td className="py-2 text-xs text-muted-foreground">
                        {entry.matchSources.join(', ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
