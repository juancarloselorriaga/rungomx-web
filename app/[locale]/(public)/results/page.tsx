import { CorrectionSummaryBlock } from '@/components/results/public/correction-summary-block';
import { Badge } from '@/components/common/badge';
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
import { getTranslations } from 'next-intl/server';

type ResultsPageProps = LocalePageProps & {
  searchParams: Promise<{ q?: string; bib?: string; series?: string }>;
};

function formatFinishTime(milliseconds: number | null): string {
  if (milliseconds === null || milliseconds < 0) return '-';

  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export async function generateMetadata({ params }: LocalePageProps): Promise<Metadata> {
  const { locale } = await params;
  return createLocalizedPageMetadata(
    locale,
    '/results',
    (messages) => messages.Pages?.Results?.metadata,
  );
}

export default async function ResultsPage({ params, searchParams }: ResultsPageProps) {
  const { locale } = await params;
  const { q, bib, series } = await searchParams;
  await configPageLocale(params, { pathname: '/results' });
  const t = await getTranslations('pages.results');
  const normalizedQuery = q?.trim() ?? '';
  const normalizedBib = bib?.trim() ?? '';
  const normalizedSeries = series?.trim() ?? '';
  const hasSearchInput = normalizedQuery.length > 0 || normalizedBib.length > 0;
  const identityPolicy = getPublicResultIdentityPolicy();

  const [summaries, directory] = await Promise.all([
    listRecentPublicCorrectionSummaries(8),
    listPublicOfficialResultsDirectory({ limit: 80 }),
  ]);
  const searchResults = hasSearchInput
    ? await searchPublicOfficialResultEntries({
        query: normalizedQuery || undefined,
        bib: normalizedBib || undefined,
        seriesSlug: normalizedSeries || undefined,
        limit: 80,
      })
    : [];

  const availableSeries = [...new Map(
    directory.map((item) => [item.seriesSlug, item.seriesName]),
  ).entries()]
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
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="mb-4 text-3xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </header>

      <HowItWorksBox
        title={t('howItWorks.panel.title')}
        description={t('howItWorks.panel.description')}
        bulletOne={t('howItWorks.panel.point1')}
        bulletTwo={t('howItWorks.panel.point2')}
        bulletThree={t('howItWorks.panel.point3')}
        ctaLabel={t('howItWorks.panel.cta')}
      />

      <section className="rounded-xl border bg-card p-4 shadow-sm">
        <h2 className="text-sm font-semibold">{t('discovery.title')}</h2>
        <p className="text-xs text-muted-foreground">{t('discovery.description')}</p>

        <form className="mt-4 grid gap-3 md:grid-cols-4" method="get">
          <label className="grid gap-1 text-xs text-muted-foreground md:col-span-2">
            <span>{t('discovery.searchNameLabel')}</span>
            <Input
              type="search"
              name="q"
              defaultValue={normalizedQuery}
              placeholder={t('discovery.searchNamePlaceholder')}
              className="shadow-none"
            />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            <span>{t('discovery.searchBibLabel')}</span>
            <Input
              type="search"
              name="bib"
              defaultValue={normalizedBib}
              placeholder={t('discovery.searchBibPlaceholder')}
              className="shadow-none"
            />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            <span>{t('discovery.seriesFilterLabel')}</span>
            <select
              name="series"
              defaultValue={normalizedSeries}
              className="h-11 sm:h-10 rounded-md border bg-background px-3 text-sm text-foreground outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
            >
              <option value="">{t('discovery.seriesFilterAll')}</option>
              {availableSeries.map((seriesOption) => (
                <option key={seriesOption.slug} value={seriesOption.slug}>
                  {seriesOption.name}
                </option>
              ))}
            </select>
          </label>

          <div className="md:col-span-4 flex flex-wrap gap-2">
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
      </section>

      <section className="rounded-xl border bg-card shadow-sm">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">{t('directory.title')}</h2>
          <p className="text-xs text-muted-foreground">{t('directory.description')}</p>
        </div>

        {filteredDirectory.length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">{t('directory.empty')}</div>
        ) : (
          <ul className="divide-y">
            {filteredDirectory.map((item) => (
              <li key={item.editionId} className="px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-foreground">
                      {item.seriesName} {item.editionLabel}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {[item.city, item.state].filter(Boolean).join(', ') ||
                        t('official.fallback.notAvailable')}
                    </p>
                    {item.startsAt ? (
                      <p className="text-xs text-muted-foreground">
                        {t('directory.eventDate', { date: dateFormatter.format(item.startsAt) })}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-end gap-2">
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
                      className="text-sm font-medium text-primary underline-offset-2 hover:underline"
                    >
                      {t('directory.openOfficial')}
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {hasSearchInput ? (
        <section className="rounded-xl border bg-card shadow-sm">
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-semibold">{t('searchResults.title')}</h2>
            <p className="text-xs text-muted-foreground">{t('searchResults.description')}</p>
          </div>

          {searchResults.length === 0 ? (
            <div className="px-4 py-6 text-sm text-muted-foreground">{t('searchResults.empty')}</div>
          ) : (
            <ul className="divide-y">
              {searchResults.map((row, index) => {
                const identity = resolvePublicResultIdentityDisplay(
                  {
                    runnerFullName: row.runnerFullName,
                    bibNumber: row.bibNumber,
                  },
                  identityPolicy,
                );

                return (
                  <li
                    key={`${row.editionId}-${row.bibNumber ?? 'no-bib'}-${row.runnerFullName}-${index}`}
                    className="px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-foreground">{identity.runnerLabel}</p>
                        <p className="text-sm text-muted-foreground">
                          {row.seriesName} {row.editionLabel}
                        </p>
                        <p className="text-xs text-muted-foreground">
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
                        className="text-sm font-medium text-primary underline-offset-2 hover:underline"
                      >
                        {t('searchResults.openOfficial')}
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

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
    </div>
  );
}
