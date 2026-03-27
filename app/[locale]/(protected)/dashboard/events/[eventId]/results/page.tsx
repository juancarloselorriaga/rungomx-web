import { OrganizerResultsLane } from '@/components/results/organizer/organizer-results-lane';
import { Button } from '@/components/ui/button';
import { Surface } from '@/components/ui/surface';
import { Link } from '@/i18n/navigation';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ChevronRight } from 'lucide-react';

import { ResultsPageHero } from './_results-page-hero';
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
  const stats = [
    {
      label: t('stateRail.lifecycle'),
      value:
        pageData.railState.lifecycle === 'official'
          ? t('stateRail.lifecycleOfficial')
          : t('stateRail.lifecycleDraft'),
    },
    {
      label: t('stateRail.connectivity'),
      value:
        pageData.railState.connectivity === 'online'
          ? t('stateRail.connectivityOnline')
          : t('stateRail.connectivityOffline'),
    },
    {
      label: t('stateRail.unsyncedCount'),
      value: String(pageData.railState.unsyncedCount),
    },
    {
      label: t('versionVisibility.title'),
      value: String(pageData.versionVisibility.items.length),
    },
  ] as const;

  const lanes = [
    {
      title: t('lanes.capture.title'),
      description: t('lanes.capture.description'),
      action: t('lanes.capture.action'),
      href: {
        pathname: '/dashboard/events/[eventId]/results/capture',
        params: { eventId },
      } as const,
    },
    {
      title: t('lanes.import.title'),
      description: t('lanes.import.description'),
      action: t('lanes.import.action'),
      href: {
        pathname: '/dashboard/events/[eventId]/results/import',
        params: { eventId },
      } as const,
    },
    {
      title: t('lanes.review.title'),
      description: t('lanes.review.description'),
      action: t('lanes.review.action'),
      href: {
        pathname: '/dashboard/events/[eventId]/results/review',
        params: { eventId },
      } as const,
    },
    {
      title: t('lanes.corrections.title'),
      description: t('lanes.corrections.description'),
      action: t('lanes.corrections.action'),
      href: {
        pathname: '/dashboard/events/[eventId]/results/corrections',
        params: { eventId },
      } as const,
    },
    {
      title: t('lanes.investigation.title'),
      description: t('lanes.investigation.description'),
      action: t('lanes.investigation.action'),
      href: {
        pathname: '/dashboard/events/[eventId]/results/investigation',
        params: { eventId },
      } as const,
    },
  ] as const;

  return (
    <div className="space-y-6">
      <ResultsPageHero title={t('title')} description={t('description')} stats={stats} />

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
        {lanes.map((lane) => (
          <Surface key={lane.title} className="flex flex-col p-4">
            <h3 className="text-sm font-semibold">{lane.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{lane.description}</p>
            <div className="mt-auto pt-4">
              <Button
                asChild
                variant="outline"
                className="h-auto min-w-0 w-full !whitespace-normal px-5 py-3"
              >
                <Link href={lane.href} className="min-w-0 !items-start !justify-between">
                  <span className="min-w-0 flex-1 break-words whitespace-normal text-left leading-snug">
                    {lane.action}
                  </span>
                  <span className="mt-0.5 flex h-4 w-4 items-center justify-center">
                    <ChevronRight className="h-4 w-4 shrink-0 opacity-70" />
                  </span>
                </Link>
              </Button>
            </div>
          </Surface>
        ))}
      </section>
    </div>
  );
}
