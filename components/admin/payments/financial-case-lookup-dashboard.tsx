'use client';

import { SampledReferenceList } from '@/components/admin/payments/sampled-reference-list';
import { LoadingSurface, LoadingTextBlock } from '@/components/dashboard/page-skeleton';
import { PaymentsCountPill } from '@/components/payments/payments-typography';
import { PaymentsInsetPanel, PaymentsPanel } from '@/components/payments/payments-surfaces';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { FinancialCaseLookupResult } from '@/lib/payments/support/case-lookup';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

type FinancialCaseLookupUiResult = Omit<FinancialCaseLookupResult, 'disambiguationGroups'> & {
  disambiguationGroups: Array<
    FinancialCaseLookupResult['disambiguationGroups'][number] & {
      uiReason: string;
    }
  >;
};

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
  result: FinancialCaseLookupUiResult | null;
  labels: FinancialCaseLookupLabels;
  summaryLabel: string | null;
  summaryLimitedHint: string | null;
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
  summaryLabel,
  summaryLimitedHint,
  workspace,
  selectedTraceId,
  investigationTool,
}: FinancialCaseLookupDashboardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const hasQuery = searchQuery.trim().length > 0;
  const hasResults = (result?.cases.length ?? 0) > 0;

  function navigateWithParams(mutator: (params: URLSearchParams) => void): void {
    const next = new URLSearchParams(searchParams?.toString());
    mutator(next);
    startTransition(() => {
      router.replace(`${pathname}?${next.toString()}`);
    });
  }

  function handleSearchSubmit(formData: FormData): void {
    const submittedQuery = String(formData.get('caseQuery') ?? '').trim();
    navigateWithParams((params) => {
      params.set('range', selectedRange);
      if (workspace) params.set('workspace', workspace);
      if (investigationTool) params.set('investigationTool', investigationTool);
      params.delete('lookupQuery');
      params.delete('evidenceTraceId');
      if (submittedQuery) {
        params.set('caseQuery', submittedQuery);
      } else {
        params.delete('caseQuery');
      }
    });
  }

  function handleLoadEvidence(traceId: string): void {
    navigateWithParams((params) => {
      params.set('range', selectedRange);
      params.set('caseQuery', searchQuery);
      params.set('evidenceTraceId', traceId);
      params.set('investigationTool', 'trace');
      if (workspace) params.set('workspace', workspace);
    });
  }

  return (
    <section
      className="space-y-4"
      aria-busy={isPending}
      data-testid="admin-payments-case-lookup-dashboard"
    >
      <div>
        <h2 className="text-lg font-semibold leading-tight">{labels.sectionTitle}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{labels.sectionDescription}</p>
      </div>

      <PaymentsPanel>
        <h3 className="text-sm font-semibold">{labels.searchTitle}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{labels.searchDescription}</p>
        <form action={handleSearchSubmit} className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
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
              disabled={isPending}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </label>
          <div className="self-end">
            <Button type="submit" disabled={isPending} className="w-full md:w-auto">
              {labels.searchButtonLabel}
            </Button>
          </div>
        </form>
      </PaymentsPanel>

      {isPending ? (
        <div className="space-y-4">
          <LoadingSurface variant="muted" className="border-dashed p-4">
            <LoadingTextBlock lines={['w-40', 'w-72']} lineClassName="h-4" className="space-y-3" />
          </LoadingSurface>
          <LoadingSurface className="p-4">
            <LoadingTextBlock lines={['w-44', 'w-80']} lineClassName="h-4" className="space-y-3" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 2 }).map((_, index) => (
                <PaymentsInsetPanel key={`case-lookup-pending-${index}`}>
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="mt-3 h-3 w-64" />
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Skeleton className="h-7 w-24 rounded-full" />
                    <Skeleton className="h-7 w-28 rounded-full" />
                    <Skeleton className="h-7 w-32 rounded-full" />
                  </div>
                </PaymentsInsetPanel>
              ))}
            </div>
          </LoadingSurface>
        </div>
      ) : !hasQuery ? (
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
          <PaymentsPanel>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold">{labels.disambiguationTitle}</h3>
              <PaymentsCountPill>{result?.disambiguationGroups.length ?? 0}</PaymentsCountPill>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{labels.disambiguationDescription}</p>
            {result?.disambiguationGroups.length ? (
              <div className="mt-3 space-y-2">
                {result.disambiguationGroups.map((group) => (
                  <PaymentsInsetPanel
                    key={`${group.normalizedIdentifier}-${group.traceIds.join(':')}`}
                    className="border-dashed"
                  >
                    <p className="font-mono text-xs">{group.displayIdentifier}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{group.uiReason}</p>
                    <SampledReferenceList
                      compact
                      items={group.traceIds}
                      countLabel={(count) => String(count)}
                      moreLabel={(count) => `+${count}`}
                      initialVisibleCount={2}
                    />
                  </PaymentsInsetPanel>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">{labels.disambiguationEmpty}</p>
            )}
          </PaymentsPanel>

          <PaymentsPanel>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold">{labels.resultsTitle}</h3>
              <PaymentsCountPill>
                {result?.returnedCaseCount ?? result?.cases.length ?? 0}
              </PaymentsCountPill>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{labels.resultsDescription}</p>
            {summaryLabel ? (
              <p className="mt-3 text-xs text-muted-foreground">{summaryLabel}</p>
            ) : null}
            {result?.isResultLimitApplied && summaryLimitedHint ? (
              <p className="mt-1 text-xs text-muted-foreground">{summaryLimitedHint}</p>
            ) : null}

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
                  <PaymentsInsetPanel key={entry.traceId} className="bg-background/40">
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
                          <PaymentsCountPill>{`${labels.eventCountHeader}: ${entry.eventCount}`}</PaymentsCountPill>
                          <PaymentsCountPill>{`${labels.firstEventHeader}: ${formatDate(entry.firstOccurredAt, locale)}`}</PaymentsCountPill>
                          <PaymentsCountPill>{`${labels.lastEventHeader}: ${formatDate(entry.lastOccurredAt, locale)}`}</PaymentsCountPill>
                        </div>
                      </div>

                      <Button
                        size="sm"
                        variant={isSelected ? 'secondary' : 'outline'}
                        onClick={() => handleLoadEvidence(entry.traceId)}
                        disabled={isPending}
                      >
                        {isSelected ? labels.evidenceLoadedLabel : labels.loadEvidenceLabel}
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
                        <SampledReferenceList
                          compact
                          items={entry.matchedIdentifiers}
                          countLabel={(count) => String(count)}
                          moreLabel={(count) => `+${count}`}
                          initialVisibleCount={2}
                        />
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
                  </PaymentsInsetPanel>
                );
              })}
            </div>
          </PaymentsPanel>
        </>
      )}
    </section>
  );
}
