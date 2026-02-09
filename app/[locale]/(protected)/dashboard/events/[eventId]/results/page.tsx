import { OrganizerResultsLane } from '@/components/results/organizer/organizer-results-lane';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ChevronRight } from 'lucide-react';

import { getResultsWorkspacePageData } from './_results-workspace';

type ResultsWorkspacePageProps = LocalePageProps & {
  params: Promise<{ locale: string; eventId: string }>;
};

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Results workspace | RunGoMX',
    robots: { index: false, follow: false },
  };
}

export default async function ResultsWorkspacePage({ params }: ResultsWorkspacePageProps) {
  const { locale, eventId } = await params;
  await configPageLocale(params, { pathname: '/dashboard/events/[eventId]/results' });
  const t = await getTranslations('pages.dashboardEvents.resultsWorkspace');

  const pageData = await getResultsWorkspacePageData(eventId, locale, 'review');

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight">{t('title')}</h2>
        <p className="text-muted-foreground">{t('description')}</p>
      </header>

      <OrganizerResultsLane
        eventId={eventId}
        densityStorageKey={pageData.densityStorageKey}
        railState={pageData.railState}
        nextActionHref={pageData.nextActionHref}
        versionVisibility={pageData.versionVisibility}
        rows={pageData.rows}
        feedbackItems={pageData.feedbackItems}
        labels={pageData.labels}
      />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <article className="flex flex-col rounded-xl border bg-card p-4 shadow-sm">
          <h3 className="text-sm font-semibold">{t('lanes.capture.title')}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('lanes.capture.description')}
          </p>
          <div className="mt-auto pt-4">
            <Button
              asChild
              variant="outline"
              className="h-auto min-w-0 w-full !whitespace-normal px-5 py-3"
            >
              <Link
                href={{
                  pathname: '/dashboard/events/[eventId]/results/capture',
                  params: { eventId },
                }}
                className="min-w-0 !items-start !justify-between"
              >
                <span className="min-w-0 flex-1 break-words whitespace-normal text-left leading-snug">
                  {t('lanes.capture.action')}
                </span>
                <span className="mt-0.5 flex h-4 w-4 items-center justify-center">
                  <ChevronRight className="h-4 w-4 shrink-0 opacity-70" />
                </span>
              </Link>
            </Button>
          </div>
        </article>

        <article className="flex flex-col rounded-xl border bg-card p-4 shadow-sm">
          <h3 className="text-sm font-semibold">{t('lanes.import.title')}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('lanes.import.description')}
          </p>
          <div className="mt-auto pt-4">
            <Button
              asChild
              variant="outline"
              className="h-auto min-w-0 w-full !whitespace-normal px-5 py-3"
            >
              <Link
                href={{
                  pathname: '/dashboard/events/[eventId]/results/import',
                  params: { eventId },
                }}
                className="min-w-0 !items-start !justify-between"
              >
                <span className="min-w-0 flex-1 break-words whitespace-normal text-left leading-snug">
                  {t('lanes.import.action')}
                </span>
                <span className="mt-0.5 flex h-4 w-4 items-center justify-center">
                  <ChevronRight className="h-4 w-4 shrink-0 opacity-70" />
                </span>
              </Link>
            </Button>
          </div>
        </article>

        <article className="flex flex-col rounded-xl border bg-card p-4 shadow-sm">
          <h3 className="text-sm font-semibold">{t('lanes.review.title')}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('lanes.review.description')}
          </p>
          <div className="mt-auto pt-4">
            <Button
              asChild
              variant="outline"
              className="h-auto min-w-0 w-full !whitespace-normal px-5 py-3"
            >
              <Link
                href={{
                  pathname: '/dashboard/events/[eventId]/results/review',
                  params: { eventId },
                }}
                className="min-w-0 !items-start !justify-between"
              >
                <span className="min-w-0 flex-1 break-words whitespace-normal text-left leading-snug">
                  {t('lanes.review.action')}
                </span>
                <span className="mt-0.5 flex h-4 w-4 items-center justify-center">
                  <ChevronRight className="h-4 w-4 shrink-0 opacity-70" />
                </span>
              </Link>
            </Button>
          </div>
        </article>

        <article className="flex flex-col rounded-xl border bg-card p-4 shadow-sm">
          <h3 className="text-sm font-semibold">{t('lanes.corrections.title')}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('lanes.corrections.description')}
          </p>
          <div className="mt-auto pt-4">
            <Button
              asChild
              variant="outline"
              className="h-auto min-w-0 w-full !whitespace-normal px-5 py-3"
            >
              <Link
                href={{
                  pathname: '/dashboard/events/[eventId]/results/corrections',
                  params: { eventId },
                }}
                className="min-w-0 !items-start !justify-between"
              >
                <span className="min-w-0 flex-1 break-words whitespace-normal text-left leading-snug">
                  {t('lanes.corrections.action')}
                </span>
                <span className="mt-0.5 flex h-4 w-4 items-center justify-center">
                  <ChevronRight className="h-4 w-4 shrink-0 opacity-70" />
                </span>
              </Link>
            </Button>
          </div>
        </article>

        <article className="flex flex-col rounded-xl border bg-card p-4 shadow-sm">
          <h3 className="text-sm font-semibold">{t('lanes.investigation.title')}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('lanes.investigation.description')}
          </p>
          <div className="mt-auto pt-4">
            <Button
              asChild
              variant="outline"
              className="h-auto min-w-0 w-full !whitespace-normal px-5 py-3"
            >
              <Link
                href={{
                  pathname: '/dashboard/events/[eventId]/results/investigation',
                  params: { eventId },
                }}
                className="min-w-0 !items-start !justify-between"
              >
                <span className="min-w-0 flex-1 break-words whitespace-normal text-left leading-snug">
                  {t('lanes.investigation.action')}
                </span>
                <span className="mt-0.5 flex h-4 w-4 items-center justify-center">
                  <ChevronRight className="h-4 w-4 shrink-0 opacity-70" />
                </span>
              </Link>
            </Button>
          </div>
        </article>
      </section>
    </div>
  );
}
