'use client';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from '@/i18n/navigation';
import type { OrganizerEventSummary } from '@/lib/events/queries';
import { hasOrganizerEventsFilters, type NormalizedOrganizerEventsQuery } from '@/lib/events/organizer-events';
import { cn } from '@/lib/utils';
import { Calendar, ChevronRight, MapPin, Plus, Users } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { OrganizerEventsFilters } from './organizer-events-filters';

type OrganizerEventsResultsProps = {
  query: NormalizedOrganizerEventsQuery;
  organizations: Array<{ id: string; name: string }>;
  totalEvents: number;
  filteredEvents: OrganizerEventSummary[];
  locale: string;
};

type VisibilityType = 'draft' | 'published' | 'unlisted' | 'archived';

const visibilityStyles: Record<VisibilityType, string> = {
  draft: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  published: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  unlisted: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  archived: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

const LIST_ITEMS = Array.from({ length: 5 });

function formatDate(date: Date | null, locale: string): string {
  if (!date) return '-';
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
  }).format(date);
}

function OrganizerEventsListSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      {LIST_ITEMS.map((_, index) => (
        <div
          key={`event-skeleton-${index}`}
          className="overflow-hidden rounded-xl border bg-card shadow-sm"
        >
          <div className="flex flex-col sm:flex-row">
            <Skeleton className="relative aspect-[16/9] w-full sm:aspect-auto sm:h-28 sm:w-44" />
            <div className="flex min-w-0 flex-1 items-start justify-between gap-4 p-4 sm:p-5">
              <div className="min-w-0 space-y-3 flex-1">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-5 w-20" />
                </div>
                <div className="flex flex-wrap gap-3">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-20" />
                </div>
                <Skeleton className="h-3 w-40" />
              </div>
              <Skeleton className="h-5 w-5" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function OrganizerEventsResults({
  query,
  organizations,
  totalEvents,
  filteredEvents,
  locale,
}: OrganizerEventsResultsProps) {
  const t = useTranslations('pages.dashboardEvents');
  const [isSearchPending, setIsSearchPending] = useState(false);
  const hasActiveFilters = hasOrganizerEventsFilters(query);

  if (totalEvents === 0) {
    return (
      <div className="rounded-lg border bg-card p-8 shadow-sm">
        <div className="flex flex-col items-center justify-center text-center space-y-4 py-8">
          <div className="rounded-full bg-muted p-4">
            <Calendar className="h-8 w-8 text-muted-foreground" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">{t('emptyState.title')}</h2>
            <p className="text-muted-foreground max-w-md">{t('emptyState.description')}</p>
          </div>
          <Button asChild className="w-full min-w-0 sm:w-auto">
            <Link href="/dashboard/events/new">
              <Plus className="h-4 w-4" />
              {t('emptyState.action')}
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <OrganizerEventsFilters
        query={query}
        organizations={organizations}
        totalEvents={totalEvents}
        filteredEvents={filteredEvents.length}
        onPendingChange={setIsSearchPending}
      />

      <div
        className="space-y-4"
        aria-live="polite"
        aria-busy={isSearchPending ? 'true' : 'false'}
      >
        {isSearchPending ? (
          <OrganizerEventsListSkeleton />
        ) : filteredEvents.length === 0 ? (
          <div className="rounded-lg border bg-card p-8 shadow-sm">
            <div className="flex flex-col items-center justify-center text-center space-y-4 py-8">
              <div className="rounded-full bg-muted p-4">
                <Calendar className="h-8 w-8 text-muted-foreground" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-semibold">{t('filters.noResults.title')}</h2>
                <p className="text-muted-foreground max-w-md">
                  {t('filters.noResults.description')}
                </p>
              </div>
              {hasActiveFilters ? (
                <Button asChild className="w-full min-w-0 sm:w-auto">
                  <Link href="/dashboard/events">{t('filters.noResults.action')}</Link>
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredEvents.map((event) => (
              <Link
                key={event.id}
                href={{ pathname: '/dashboard/events/[eventId]', params: { eventId: event.id } }}
                className="group block overflow-hidden rounded-xl border bg-card shadow-sm transition-all hover:border-primary/50 hover:shadow-md"
              >
                <div className="flex flex-col sm:flex-row">
                  <div className="relative aspect-[16/9] w-full bg-muted sm:aspect-auto sm:h-28 sm:w-44">
                    {event.heroImageUrl ? (
                      <Image
                        src={event.heroImageUrl}
                        alt={`${event.seriesName} ${event.editionLabel}`}
                        fill
                        sizes="(max-width: 640px) 100vw, 176px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-muted to-background" />
                    )}
                    <div className="absolute inset-0 ring-1 ring-inset ring-black/5" />
                  </div>

                  <div className="flex min-w-0 flex-1 items-start justify-between gap-4 p-4 sm:p-5">
                    <div className="min-w-0 space-y-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <h3 className="min-w-0 flex-1 truncate text-base font-semibold sm:text-lg">
                          {event.seriesName} {event.editionLabel}
                        </h3>
                        <span
                          className={cn(
                            'shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                            visibilityStyles[event.visibility as VisibilityType] ||
                              visibilityStyles.draft,
                          )}
                        >
                          {t(`visibility.${event.visibility as VisibilityType}`)}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        {event.startsAt ? (
                          <div className="flex items-center gap-1 whitespace-nowrap">
                            <Calendar className="h-4 w-4" />
                            <span>{formatDate(event.startsAt, locale)}</span>
                          </div>
                        ) : null}
                        {event.city || event.state ? (
                          <div className="flex items-center gap-1 min-w-0">
                            <MapPin className="h-4 w-4 shrink-0" />
                            <span className="truncate">
                              {[event.city, event.state].filter(Boolean).join(', ')}
                            </span>
                          </div>
                        ) : null}
                        <div className="flex items-center gap-1 whitespace-nowrap">
                          <Users className="h-4 w-4" />
                          <span>
                            {event.registrationCount} {t('registrationCount')}
                          </span>
                        </div>
                      </div>

                      <p className="text-xs text-muted-foreground">
                        {event.organizationName} &bull; {event.distanceCount}{' '}
                        {event.distanceCount === 1 ? t('distance') : t('distances')}
                      </p>
                    </div>

                    <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
