import { Badge, Hero, Section, TextBlock } from '@/components/common';
import { HowItWorksBox } from '@/components/results/primitives/how-it-works-box';
import { TrustScanHeader } from '@/components/results/primitives/trust-scan-header';
import { Link } from '@/i18n/navigation';
import {
  getPublicResultIdentityPolicy,
  resolvePublicResultIdentityDisplay,
} from '@/lib/events/results/public-identity-policy';
import { resolvePublicOfficialResultsRobotsDirectives } from '@/lib/events/results/public-official-results-indexability';
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

export async function generateMetadata({ params }: PublicOfficialResultsPageProps): Promise<Metadata> {
  const { locale, seriesSlug, editionSlug } = await params;
  const pageData = await getPublicOfficialResultsPageData(seriesSlug, editionSlug, { entryLimit: 1 });

  return createLocalizedPageMetadata(
    locale,
    '/results/[seriesSlug]/[editionSlug]',
    (messages) => messages.Pages?.Results?.metadata,
    {
      params: { seriesSlug, editionSlug },
      robots: resolvePublicOfficialResultsRobotsDirectives(pageData),
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
      <div className="w-full">
        <Hero
          badge={t('nonOfficial.badge')}
          badgeVariant="outline"
          title={t('title', {
            seriesName: pageData.edition.seriesName,
            editionLabel: pageData.edition.editionLabel,
          })}
          description={t('nonOfficial.description')}
          variant="gradient-green"
          titleSize="lg"
          align="left"
        />

        <Section padding="md" size="lg">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-8">
            <div className="rounded-[1.5rem] border border-border/45 bg-[color-mix(in_oklch,var(--background)_80%,var(--background-surface)_20%)] p-5 md:p-6">
              <p className="text-sm leading-7 text-muted-foreground">
                {t('nonOfficial.noDraftDisclosure')}
              </p>
              <div className="mt-5 border-t border-border/70 pt-4 text-sm leading-7 text-muted-foreground">
                {startsAtLabel ? <p>{t('eventDate', { date: startsAtLabel })}</p> : null}
              </div>
              <p className="mt-5">
                <Link
                  href={{
                    pathname: '/events/[seriesSlug]/[editionSlug]',
                    params: {
                      seriesSlug: pageData.edition.seriesSlug,
                      editionSlug: pageData.edition.editionSlug,
                    },
                  }}
                  className="text-sm font-semibold text-foreground underline-offset-4 hover:underline"
                >
                  {t('viewEventLink')}
                </Link>
              </p>
            </div>

            <HowItWorksBox
              title={tResults('howItWorks.panel.title')}
              description={tResults('howItWorks.panel.description')}
              bulletOne={tResults('howItWorks.panel.point1')}
              bulletTwo={tResults('howItWorks.panel.point2')}
              bulletThree={tResults('howItWorks.panel.point3')}
              ctaLabel={tResults('howItWorks.panel.cta')}
            />
          </div>
        </Section>
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

  const statusBadgeVariant: 'green' | 'indigo' =
    pageData.activeVersion.status === 'corrected' ? 'indigo' : 'green';

  return (
    <div className="w-full">
      <Hero
        badge={
          pageData.activeVersion.status === 'corrected'
            ? t('status.corrected')
            : t('status.official')
        }
        badgeVariant={statusBadgeVariant}
        title={t('title', {
          seriesName: pageData.edition.seriesName,
          editionLabel: pageData.edition.editionLabel,
        })}
        description={t('subtitle')}
        variant="gradient-green"
        titleSize="lg"
        align="left"
      >
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-8">
          <div className="rounded-[1.5rem] border border-border/45 bg-[color-mix(in_oklch,var(--background)_78%,var(--background-surface)_22%)] p-5 md:p-6">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant={statusBadgeVariant}>{t('version', { versionNumber: pageData.activeVersion.versionNumber })}</Badge>
              {pageData.edition.visibility !== 'published' ? (
                <Badge variant="outline">{t('status.unlisted')}</Badge>
              ) : null}
            </div>

            <div className="mt-6 border-t border-border/70 pt-5 text-sm leading-7 text-muted-foreground">
              {startsAtLabel ? <p>{t('eventDate', { date: startsAtLabel })}</p> : null}
              <p>{t('updatedAt', { value: versionUpdatedAtLabel })}</p>
              <p>{t('finalizedAt', { value: versionFinalizedAtLabel })}</p>
            </div>

            <p className="mt-5">
              <Link
                href={{
                  pathname: '/events/[seriesSlug]/[editionSlug]',
                  params: {
                    seriesSlug: pageData.edition.seriesSlug,
                    editionSlug: pageData.edition.editionSlug,
                  },
                }}
                className="text-sm font-semibold text-foreground underline-offset-4 hover:underline"
              >
                {t('viewEventLink')}
              </Link>
            </p>
          </div>

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
        </div>
      </Hero>

      <Section variant="muted" padding="md" size="lg">
        <HowItWorksBox
          title={tResults('howItWorks.panel.title')}
          description={tResults('howItWorks.panel.description')}
          bulletOne={tResults('howItWorks.panel.point1')}
          bulletTwo={tResults('howItWorks.panel.point2')}
          bulletThree={tResults('howItWorks.panel.point3')}
          ctaLabel={tResults('howItWorks.panel.cta')}
        />
      </Section>

      <Section padding="lg" size="lg">
        <TextBlock
          title={t('table.title')}
          description={t('table.description')}
          size="md"
          className="max-w-[44rem]"
        />

        {pageData.entries.length === 0 ? (
          <div className="mt-12 rounded-[1.5rem] border border-border/45 bg-[color-mix(in_oklch,var(--background)_80%,var(--background-surface)_20%)] p-8 text-sm leading-7 text-muted-foreground">
            {t('table.empty')}
          </div>
        ) : (
          <div className="mt-12 overflow-x-auto rounded-[1.5rem] border border-border/45 bg-[color-mix(in_oklch,var(--background)_82%,var(--background-surface)_18%)]">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border/70 text-left text-[0.72rem] uppercase tracking-[0.16em] text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">{t('table.headers.place')}</th>
                  <th className="px-4 py-3 font-semibold">{t('table.headers.runner')}</th>
                  <th className="px-4 py-3 font-semibold">{t('table.headers.bib')}</th>
                  <th className="px-4 py-3 font-semibold">{t('table.headers.distance')}</th>
                  <th className="px-4 py-3 font-semibold">{t('table.headers.status')}</th>
                  <th className="px-4 py-3 font-semibold">{t('table.headers.finishTime')}</th>
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
                    <tr key={entry.id} className="border-b border-border/60 last:border-b-0">
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
                      <td className="px-4 py-3 text-foreground">
                        {resolveEntryStatusLabel(entry.status)}
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
      </Section>
    </div>
  );
}
