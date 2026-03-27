import { OrganizerResultsLane } from '@/components/results/organizer/organizer-results-lane';
import { Button } from '@/components/ui/button';
import { InsetSurface, Surface } from '@/components/ui/surface';
import { Link } from '@/i18n/navigation';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ChevronRight, Radio, Trophy } from 'lucide-react';

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
      icon: Trophy,
    },
    {
      label: t('stateRail.connectivity'),
      value:
        pageData.railState.connectivity === 'online'
          ? t('stateRail.connectivityOnline')
          : t('stateRail.connectivityOffline'),
      icon: Radio,
    },
    {
      label: t('stateRail.unsyncedCount'),
      value: String(pageData.railState.unsyncedCount),
      icon: ChevronRight,
    },
    {
      label: t('versionVisibility.title'),
      value: String(pageData.versionVisibility.items.length),
      icon: Trophy,
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
      <Surface className="overflow-hidden border-border/60 bg-[color-mix(in_oklch,var(--background)_82%,var(--background-surface)_18%)] p-6 sm:p-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          <div className="space-y-3">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('title')}</h2>
            <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
              {t('description')}
            </p>
          </div>

          <InsetSurface className="border-border/60 bg-background/80 p-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              {stats.map((stat) => {
                const Icon = stat.icon;

                return (
                  <div
                    key={stat.label}
                    className="rounded-xl border border-border/60 bg-background/70 p-3"
                  >
                    <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                      <Icon className="h-4 w-4" />
                      <p className="text-xs font-semibold uppercase tracking-[0.14em]">
                        {stat.label}
                      </p>
                    </div>
                    <p className="text-sm font-medium text-foreground">{stat.value}</p>
                  </div>
                );
              })}
            </div>
          </InsetSurface>
        </div>
      </Surface>

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
