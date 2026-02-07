import { Badge } from '@/components/common/badge';
import { HowItWorksBox } from '@/components/results/primitives/how-it-works-box';
import { TrustScanHeader } from '@/components/results/primitives/trust-scan-header';
import { Link } from '@/i18n/navigation';
import {
  getPublicResultIdentityPolicy,
  resolvePublicResultIdentityDisplay,
} from '@/lib/events/results/public-identity-policy';
import { getPublicOfficialResultsPageData } from '@/lib/events/results/queries';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { createLocalizedPageMetadata } from '@/utils/seo';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

type PublicOfficialResultsPageProps = LocalePageProps & {
  params: Promise<{ locale: string; seriesSlug: string; editionSlug: string }>;
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

function toDateTimeLabel(
  value: Date | null,
  locale: string,
  timezone: string,
  fallback: string,
): string {
  if (!value) return fallback;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(value);
}

function resolveRobotsDirectives(
  pageData: Awaited<ReturnType<typeof getPublicOfficialResultsPageData>>,
): Metadata['robots'] | undefined {
  if (pageData.state !== 'official') return { index: false, follow: false };
  if (pageData.edition.visibility !== 'published') return { index: false, follow: false };
  return undefined;
}

export async function generateMetadata({ params }: PublicOfficialResultsPageProps): Promise<Metadata> {
  const { locale, seriesSlug, editionSlug } = await params;
  const pageData = await getPublicOfficialResultsPageData(seriesSlug, editionSlug, { entryLimit: 1 });

  return createLocalizedPageMetadata(
    locale,
    '/results/[seriesSlug]/[editionSlug]',
    (messages) => messages.Pages?.Results?.metadata,
    {
      params: { seriesSlug, editionSlug },
      robots: resolveRobotsDirectives(pageData),
    },
  );
}

export default async function PublicOfficialResultsPage({ params }: PublicOfficialResultsPageProps) {
  const { locale, seriesSlug, editionSlug } = await params;
  await configPageLocale(params, { pathname: '/results/[seriesSlug]/[editionSlug]' });
  const t = await getTranslations('pages.results.official');
  const tResults = await getTranslations('pages.results');
  const identityPolicy = getPublicResultIdentityPolicy();

  const pageData = await getPublicOfficialResultsPageData(seriesSlug, editionSlug);
  if (pageData.state === 'not_found') notFound();

  const startsAtLabel = pageData.edition.startsAt
    ? new Intl.DateTimeFormat(locale, {
        dateStyle: 'long',
        timeZone: pageData.edition.timezone,
      }).format(pageData.edition.startsAt)
    : null;

  const resolveEntryStatusLabel = (status: 'finish' | 'dnf' | 'dns' | 'dq') => {
    switch (status) {
      case 'dnf':
        return t('entryStatus.dnf');
      case 'dns':
        return t('entryStatus.dns');
      case 'dq':
        return t('entryStatus.dq');
      default:
        return t('entryStatus.finish');
    }
  };

  if (pageData.state === 'not_finalized') {
    return (
      <div className="space-y-5">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold">
            {t('title', {
              seriesName: pageData.edition.seriesName,
              editionLabel: pageData.edition.editionLabel,
            })}
          </h1>
          <p className="text-muted-foreground">{t('nonOfficial.description')}</p>
        </header>

        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <Badge variant="outline">{t('nonOfficial.badge')}</Badge>
          <p className="mt-3 text-sm text-muted-foreground">{t('nonOfficial.noDraftDisclosure')}</p>
          {startsAtLabel ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {t('eventDate', { date: startsAtLabel })}
            </p>
          ) : null}
          <div className="mt-4">
            <Link
              href={{
                pathname: '/events/[seriesSlug]/[editionSlug]',
                params: {
                  seriesSlug: pageData.edition.seriesSlug,
                  editionSlug: pageData.edition.editionSlug,
                },
              }}
              className="text-sm font-medium text-primary underline-offset-2 hover:underline"
            >
              {t('viewEventLink')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const versionUpdatedAtLabel = toDateTimeLabel(
    pageData.activeVersion.updatedAt,
    locale,
    pageData.edition.timezone,
    t('fallback.notAvailable'),
  );
  const versionFinalizedAtLabel = toDateTimeLabel(
    pageData.activeVersion.finalizedAt,
    locale,
    pageData.edition.timezone,
    t('fallback.notAvailable'),
  );

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">
          {t('title', {
            seriesName: pageData.edition.seriesName,
            editionLabel: pageData.edition.editionLabel,
          })}
        </h1>
        <p className="text-muted-foreground">{t('subtitle')}</p>
      </header>

      <TrustScanHeader
        status={pageData.activeVersion.status}
        organizerName={pageData.edition.organizerName}
        scope={t('trustScan.scopeValue')}
        version={t('version', { versionNumber: pageData.activeVersion.versionNumber })}
        updatedAt={versionUpdatedAtLabel}
        labels={{
          title: t('trustScan.title'),
          description: t('trustScan.description'),
          fallback: t('fallback.notAvailable'),
          fields: {
            organizer: t('trustScan.fields.organizer'),
            scope: t('trustScan.fields.scope'),
            version: t('trustScan.fields.version'),
            updatedAt: t('trustScan.fields.updatedAt'),
            correction: t('trustScan.fields.correction'),
          },
          status: {
            official: t('status.official'),
            corrected: t('status.corrected'),
            unknown: t('trustScan.status.unknown'),
          },
          correction: {
            corrected: t('trustScan.correction.corrected'),
            none: t('trustScan.correction.none'),
          },
        }}
      />

      <HowItWorksBox
        title={tResults('howItWorks.panel.title')}
        description={tResults('howItWorks.panel.description')}
        bulletOne={tResults('howItWorks.panel.point1')}
        bulletTwo={tResults('howItWorks.panel.point2')}
        bulletThree={tResults('howItWorks.panel.point3')}
        ctaLabel={tResults('howItWorks.panel.cta')}
      />

      <section className="rounded-xl border bg-card p-4 text-sm text-muted-foreground shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {pageData.edition.visibility !== 'published' ? (
            <Badge variant="outline">{t('status.unlisted')}</Badge>
          ) : null}
          <p>{t('finalizedAt', { value: versionFinalizedAtLabel })}</p>
          {startsAtLabel ? <p>{t('eventDate', { date: startsAtLabel })}</p> : null}
        </div>
      </section>

      <section className="rounded-xl border bg-card shadow-sm">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">{t('table.title')}</h2>
          <p className="text-xs text-muted-foreground">{t('table.description')}</p>
        </div>

        {pageData.entries.length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">{t('table.empty')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-semibold">{t('table.headers.place')}</th>
                  <th className="px-4 py-2.5 font-semibold">{t('table.headers.runner')}</th>
                  <th className="px-4 py-2.5 font-semibold">{t('table.headers.bib')}</th>
                  <th className="px-4 py-2.5 font-semibold">{t('table.headers.distance')}</th>
                  <th className="px-4 py-2.5 font-semibold">{t('table.headers.status')}</th>
                  <th className="px-4 py-2.5 font-semibold">{t('table.headers.finishTime')}</th>
                </tr>
              </thead>
              <tbody>
                {pageData.entries.map((entry) => {
                  const identity = resolvePublicResultIdentityDisplay(
                    {
                      runnerFullName: entry.runnerFullName,
                      bibNumber: entry.bibNumber,
                    },
                    identityPolicy,
                  );

                  return (
                    <tr key={entry.id} className="border-b last:border-b-0">
                      <td className="px-4 py-3 text-foreground">
                        {entry.overallPlace ?? t('fallback.notAvailableShort')}
                      </td>
                      <td className="px-4 py-3 text-foreground">{identity.runnerLabel}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {identity.bibLabel ?? t('fallback.notAvailableShort')}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {entry.distanceLabel ?? t('fallback.notAvailableShort')}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" size="sm">
                          {resolveEntryStatusLabel(entry.status)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-foreground">
                        {formatFinishTime(entry.finishTimeMillis)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
