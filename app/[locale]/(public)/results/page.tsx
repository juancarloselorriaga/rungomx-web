import { Badge, Hero, Section, TextBlock } from '@/components/common';
import {
  publicFieldClassName,
  publicSelectClassName,
} from '@/components/common/public-form-styles';
import { CorrectionSummaryBlock } from '@/components/results/public/correction-summary-block';
import { HowItWorksBox } from '@/components/results/primitives/how-it-works-box';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Link } from '@/i18n/navigation';
import {
  listPublicOfficialResultsDirectory,
  listRecentPublicCorrectionSummaries,
  searchPublicOfficialResultEntries,
} from '@/lib/events/results/queries';
import {
  getPublicResultIdentityPolicy,
  resolvePublicResultIdentityDisplay,
} from '@/lib/events/results/public-identity-policy';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { createLocalizedPageMetadata } from '@/utils/seo';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { formatFinishTime } from '@/utils/format-finish-time';

import { ArrowRight } from 'lucide-react';

type ResultsPageProps = LocalePageProps & {
  searchParams: Promise<{ q?: string; bib?: string; series?: string }>;
};

export async function generateMetadata({ params }: LocalePageProps): Promise<Metadata> {
  const { locale } = await params;
  return createLocalizedPageMetadata(
    locale,
    '/results',
    (messages) => messages.Pages?.Results?.metadata,
  );
}

export default async function ResultsPage({ params, searchParams }: ResultsPageProps) {
  await connection();

  const { locale } = await params;
  const { q, bib, series } = await searchParams;
  await configPageLocale(params, { pathname: '/results' });
  const t = await getTranslations('pages.results');
  const normalizedQuery = q?.trim() ?? '';
  const normalizedBib = bib?.trim() ?? '';
  const normalizedSeries = series?.trim() ?? '';
  const hasSearchInput = normalizedQuery.length > 0 || normalizedBib.length > 0;
  const identityPolicy = getPublicResultIdentityPolicy();

  let summaries: Awaited<ReturnType<typeof listRecentPublicCorrectionSummaries>> = [];
  let directory: Awaited<ReturnType<typeof listPublicOfficialResultsDirectory>> = [];

  try {
    [summaries, directory] = await Promise.all([
      listRecentPublicCorrectionSummaries(8),
      listPublicOfficialResultsDirectory({ limit: 80 }),
    ]);
  } catch (error) {
    console.error('[ResultsPage] Failed to load public results discovery data', error);
  }

  let searchResults: Awaited<ReturnType<typeof searchPublicOfficialResultEntries>> = [];
  if (hasSearchInput) {
    try {
      searchResults = await searchPublicOfficialResultEntries({
        query: normalizedQuery || undefined,
        bib: normalizedBib || undefined,
        seriesSlug: normalizedSeries || undefined,
        limit: 80,
      });
    } catch (error) {
      console.error('[ResultsPage] Failed to search public official result entries', {
        query: normalizedQuery,
        bib: normalizedBib,
        series: normalizedSeries,
        error,
      });
      searchResults = [];
    }
  }

  const availableSeries = [
    ...new Map(directory.map((item) => [item.seriesSlug, item.seriesName])).entries(),
  ]
    .map(([slug, name]) => ({ slug, name }))
    .sort((left, right) => left.name.localeCompare(right.name));

  const filteredDirectory =
    normalizedSeries.length > 0
      ? directory.filter((item) => item.seriesSlug === normalizedSeries)
      : directory;

  const resolveEntryStatusLabel = (status: 'finish' | 'dnf' | 'dns' | 'dq') => {
    switch (status) {
      case 'dnf':
        return t('official.entryStatus.dnf');
      case 'dns':
        return t('official.entryStatus.dns');
      case 'dq':
        return t('official.entryStatus.dq');
      default:
        return t('official.entryStatus.finish');
    }
  };

  const formatter = new Intl.DateTimeFormat(locale, {
    dateStyle: 'short',
    timeStyle: 'short',
  });
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
  });

  return (
    <div className="w-full">
      <Hero
        badgeVariant="blue"
        title={t('title')}
        description={t('description')}
        variant="gradient-blue"
        titleSize="xl"
        align="left"
      />

      <Section variant="muted" padding="md" size="lg">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-start">
          <div>
            <TextBlock
              title={t('discovery.title')}
              description={t('discovery.description')}
              size="md"
              className="max-w-[46rem]"
            />

            <form
              className="mt-8 rounded-[1.5rem] border border-border/45 bg-[color-mix(in_oklch,var(--background)_72%,var(--background-surface)_28%)] p-5 md:p-6"
              method="get"
            >
              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-1.5 text-xs text-muted-foreground md:col-span-2">
                  <span>{t('discovery.searchNameLabel')}</span>
                  <Input
                    type="search"
                    name="q"
                    defaultValue={normalizedQuery}
                    placeholder={t('discovery.searchNamePlaceholder')}
                    className={publicFieldClassName}
                  />
                </label>
                <label className="grid gap-1.5 text-xs text-muted-foreground">
                  <span>{t('discovery.searchBibLabel')}</span>
                  <Input
                    type="search"
                    name="bib"
                    defaultValue={normalizedBib}
                    placeholder={t('discovery.searchBibPlaceholder')}
                    className={publicFieldClassName}
                  />
                </label>
                <label className="grid gap-1.5 text-xs text-muted-foreground">
                  <span>{t('discovery.seriesFilterLabel')}</span>
                  <select
                    name="series"
                    defaultValue={normalizedSeries}
                    className={publicSelectClassName}
                  >
                    <option value="">{t('discovery.seriesFilterAll')}</option>
                    {availableSeries.map((seriesOption) => (
                      <option key={seriesOption.slug} value={seriesOption.slug}>
                        {seriesOption.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-6 flex flex-wrap gap-2 border-t border-border/70 pt-5">
                <Button type="submit" className="min-w-0">
                  {t('discovery.searchAction')}
                </Button>
                {normalizedQuery || normalizedBib || normalizedSeries ? (
                  <Button asChild variant="outline" className="min-w-0">
                    <Link href="/results">{t('discovery.resetAction')}</Link>
                  </Button>
                ) : null}
              </div>
            </form>
          </div>

          <HowItWorksBox
            title={t('howItWorks.panel.title')}
            description={t('howItWorks.panel.description')}
            bulletOne={t('howItWorks.panel.point1')}
            bulletTwo={t('howItWorks.panel.point2')}
            bulletThree={t('howItWorks.panel.point3')}
            ctaLabel={t('howItWorks.panel.cta')}
          />
        </div>
      </Section>

      {hasSearchInput ? (
        <Section padding="lg" size="lg">
          <TextBlock
            title={t('searchResults.title')}
            description={t('searchResults.description')}
            size="md"
            className="max-w-[46rem]"
          />

          <div className="mt-12 border-t border-border/70">
            {searchResults.length === 0 ? (
              <p className="py-7 text-sm text-muted-foreground">{t('searchResults.empty')}</p>
            ) : (
              searchResults.map((row, index) => {
                const identity = resolvePublicResultIdentityDisplay(
                  {
                    runnerFullName: row.runnerFullName,
                    bibNumber: row.bibNumber,
                  },
                  identityPolicy,
                );

                return (
                  <div
                    key={`${row.editionId}-${row.bibNumber ?? 'no-bib'}-${row.runnerFullName}-${index}`}
                    className="grid gap-5 border-b border-border/70 py-7 md:grid-cols-[minmax(0,1fr)_auto] md:items-start md:gap-6 md:py-8"
                  >
                    <div className="min-w-0">
                      <h2 className="font-display text-[clamp(1.45rem,2.5vw,1.9rem)] font-medium leading-tight tracking-[-0.03em] text-foreground">
                        {identity.runnerLabel}
                      </h2>
                      <p className="mt-2 text-sm leading-7 text-muted-foreground">
                        {row.seriesName} {row.editionLabel}
                      </p>
                      <p className="mt-2 text-sm leading-7 text-muted-foreground">
                        {t('searchResults.context', {
                          bib: identity.bibLabel ?? t('official.fallback.notAvailableShort'),
                          place: row.overallPlace ?? t('official.fallback.notAvailableShort'),
                          status: resolveEntryStatusLabel(row.resultStatus),
                          finishTime: formatFinishTime(row.finishTimeMillis),
                        })}
                      </p>
                    </div>
                    <Link
                      href={{
                        pathname: '/results/[seriesSlug]/[editionSlug]',
                        params: { seriesSlug: row.seriesSlug, editionSlug: row.editionSlug },
                      }}
                      className="group inline-flex items-center gap-2 self-start text-sm font-semibold text-foreground transition-colors hover:text-[var(--brand-blue)]"
                    >
                      <span>{t('searchResults.openOfficial')}</span>
                      <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                    </Link>
                  </div>
                );
              })
            )}
          </div>
        </Section>
      ) : null}

      <Section padding="md" size="lg">
        <TextBlock
          title={t('directory.title')}
          description={t('directory.description')}
          size="md"
          className="max-w-[46rem]"
        />

        <div className="mt-12 border-t border-border/70">
          {filteredDirectory.length === 0 ? (
            <p className="py-7 text-sm text-muted-foreground">{t('directory.empty')}</p>
          ) : (
            filteredDirectory.map((item) => (
              <div
                key={item.editionId}
                className="grid gap-5 border-b border-border/70 py-7 md:grid-cols-[minmax(0,1fr)_auto] md:items-start md:gap-6 md:py-8"
              >
                <div className="min-w-0">
                  <h2 className="font-display text-[clamp(1.45rem,2.5vw,1.9rem)] font-medium leading-tight tracking-[-0.03em] text-foreground">
                    {item.seriesName} {item.editionLabel}
                  </h2>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">
                    {[item.city, item.state].filter(Boolean).join(', ') ||
                      t('official.fallback.notAvailable')}
                  </p>
                  {item.startsAt ? (
                    <p className="mt-2 text-sm leading-7 text-muted-foreground">
                      {t('directory.eventDate', { date: dateFormatter.format(item.startsAt) })}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-col items-start gap-3 md:items-end">
                  <Badge variant={item.activeVersionStatus === 'corrected' ? 'indigo' : 'green'}>
                    {item.activeVersionStatus === 'corrected'
                      ? t('official.status.corrected')
                      : t('official.status.official')}
                  </Badge>
                  <Link
                    href={{
                      pathname: '/results/[seriesSlug]/[editionSlug]',
                      params: { seriesSlug: item.seriesSlug, editionSlug: item.editionSlug },
                    }}
                    className="group inline-flex items-center gap-2 text-sm font-semibold text-foreground transition-colors hover:text-[var(--brand-blue)]"
                  >
                    <span>{t('directory.openOfficial')}</span>
                    <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      </Section>

      <Section variant="muted" padding="md" size="lg">
        <CorrectionSummaryBlock
          summaries={summaries.map((summary) => ({
            ...summary,
            approvedAtLabel: summary.approvedAt ? formatter.format(summary.approvedAt) : null,
          }))}
          labels={{
            title: t('corrections.title'),
            description: t('corrections.description'),
            empty: t('corrections.empty'),
            fields: {
              reason: t('corrections.fields.reason'),
              changes: t('corrections.fields.changes'),
              approvedBy: t('corrections.fields.approvedBy'),
              approvedAt: t('corrections.fields.approvedAt'),
              versionTransition: t('corrections.fields.versionTransition'),
            },
            fallback: {
              unknownApprover: t('corrections.fallback.unknownApprover'),
              unknownTime: t('corrections.fallback.unknownTime'),
              noChanges: t('corrections.fallback.noChanges'),
            },
          }}
        />
      </Section>
    </div>
  );
}
