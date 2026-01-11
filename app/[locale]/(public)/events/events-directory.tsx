'use client';

import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { SPORT_TYPES, type SportType } from '@/lib/events/constants';
import { cn } from '@/lib/utils';
import { Calendar, ChevronLeft, ChevronRight, Loader2, MapPin, Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useCallback, useRef, useState, useTransition } from 'react';

type PublicEventSummary = {
  id: string;
  publicCode: string;
  slug: string;
  editionLabel: string;
  seriesName: string;
  seriesSlug: string;
  startsAt: string | null;
  endsAt: string | null;
  locationDisplay: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  sportType: string;
  heroImageUrl: string | null;
  isRegistrationOpen: boolean;
  minPriceCents: number | null;
  currency: string;
};

type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
};

type EventsDirectoryProps = {
  initialEvents: PublicEventSummary[];
  initialPagination: Pagination;
  locale: string;
};

// Mexican states for filter dropdown
const MEXICAN_STATES = [
  'Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche', 'Chiapas',
  'Chihuahua', 'Coahuila', 'Colima', 'CDMX', 'Durango', 'Estado de México',
  'Guanajuato', 'Guerrero', 'Hidalgo', 'Jalisco', 'Michoacán', 'Morelos', 'Nayarit',
  'Nuevo León', 'Oaxaca', 'Puebla', 'Querétaro', 'Quintana Roo', 'San Luis Potosí',
  'Sinaloa', 'Sonora', 'Tabasco', 'Tamaulipas', 'Tlaxcala', 'Veracruz', 'Yucatán', 'Zacatecas',
];

export function EventsDirectory({ initialEvents, initialPagination, locale }: EventsDirectoryProps) {
  const t = useTranslations('pages.events');
  const [isPending, startTransition] = useTransition();

  // State
  const [events, setEvents] = useState(initialEvents);
  const [pagination, setPagination] = useState(initialPagination);
  const [search, setSearch] = useState('');
  const [sportType, setSportType] = useState<string>('');
  const [stateFilter, setStateFilter] = useState('');
  const [page, setPage] = useState(1);

  // Debounce timer ref
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch events with given parameters
  const fetchEvents = useCallback(async (params: {
    q?: string;
    sportType?: string;
    state?: string;
    page: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (params.q && params.q.trim().length >= 2) {
      searchParams.set('q', params.q.trim());
    }
    if (params.sportType) {
      searchParams.set('sportType', params.sportType);
    }
    if (params.state) {
      searchParams.set('state', params.state);
    }
    searchParams.set('page', params.page.toString());

    const response = await fetch(`/api/events?${searchParams.toString()}`);
    if (response.ok) {
      const data = await response.json();
      setEvents(data.events);
      setPagination(data.pagination);
    }
  }, []);

  // Handle search input with debounce
  function handleSearchChange(value: string) {
    setSearch(value);

    // Clear existing timer
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Debounce the search
    debounceRef.current = setTimeout(() => {
      setPage(1);
      startTransition(() => {
        fetchEvents({ q: value, sportType, state: stateFilter, page: 1 });
      });
    }, 300);
  }

  // Handle filter changes
  function handleSportTypeChange(value: string) {
    setSportType(value);
    setPage(1);
    startTransition(() => {
      fetchEvents({ q: search, sportType: value, state: stateFilter, page: 1 });
    });
  }

  function handleStateChange(value: string) {
    setStateFilter(value);
    setPage(1);
    startTransition(() => {
      fetchEvents({ q: search, sportType, state: value, page: 1 });
    });
  }

  function handlePageChange(newPage: number) {
    setPage(newPage);
    startTransition(() => {
      fetchEvents({ q: search, sportType, state: stateFilter, page: newPage });
    });
  }

  function clearFilters() {
    setSearch('');
    setSportType('');
    setStateFilter('');
    setPage(1);
    startTransition(() => {
      fetchEvents({ page: 1 });
    });
  }

  const hasFilters = search.trim() || sportType || stateFilter;

  return (
    <div className="space-y-6">
      {/* Search and filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {/* Search input */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder={t('search.placeholder')}
            className="w-full rounded-md border bg-background pl-10 pr-10 py-2 text-sm shadow-sm outline-none transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
          />
          {search && (
            <button
              type="button"
              onClick={() => handleSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          {/* Sport type filter */}
          <select
            value={sportType}
            onChange={(e) => handleSportTypeChange(e.target.value)}
            className="rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            <option value="">{t('filters.allSports')}</option>
            {SPORT_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`sportTypes.${type}`)}
              </option>
            ))}
          </select>

          {/* State filter */}
          <select
            value={stateFilter}
            onChange={(e) => handleStateChange(e.target.value)}
            className="rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            <option value="">{t('filters.allStates')}</option>
            {MEXICAN_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Active filters */}
      {hasFilters && (
        <div className="flex items-center gap-2 flex-wrap">
          {sportType && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-sm text-primary">
              {t(`sportTypes.${sportType as SportType}`)}
              <button type="button" onClick={() => handleSportTypeChange('')}>
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {stateFilter && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-sm text-primary">
              {stateFilter}
              <button type="button" onClick={() => handleStateChange('')}>
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          <button
            type="button"
            onClick={clearFilters}
            className="text-sm text-muted-foreground hover:text-foreground underline"
          >
            {t('search.clearFilters')}
          </button>
        </div>
      )}

      {/* Loading state */}
      {isPending && (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Events grid */}
      {!isPending && events.length > 0 && (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => (
            <EventCard key={event.id} event={event} locale={locale} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isPending && events.length === 0 && (
        <div className="rounded-lg border bg-card p-12 text-center">
          {hasFilters ? (
            <>
              <h3 className="text-lg font-semibold mb-2">{t('search.noResults')}</h3>
              <p className="text-muted-foreground mb-4">{t('search.noResultsDescription')}</p>
              <Button variant="outline" onClick={clearFilters}>
                {t('search.clearFilters')}
              </Button>
            </>
          ) : (
            <>
              <h3 className="text-lg font-semibold mb-2">{t('emptyState.title')}</h3>
              <p className="text-muted-foreground">{t('emptyState.description')}</p>
            </>
          )}
        </div>
      )}

      {/* Pagination */}
      {!isPending && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between border-t pt-4">
          <p className="text-sm text-muted-foreground">
            {t('pagination.showing', {
              start: (pagination.page - 1) * pagination.limit + 1,
              end: Math.min(pagination.page * pagination.limit, pagination.total),
              total: pagination.total,
            })}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(Math.max(1, page - 1))}
              disabled={pagination.page <= 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              {t('pagination.previous')}
            </Button>
            <span className="text-sm text-muted-foreground px-2">
              {t('pagination.page', { current: pagination.page, total: pagination.totalPages })}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(page + 1)}
              disabled={!pagination.hasMore}
            >
              {t('pagination.next')}
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// Event card component
function EventCard({ event, locale }: { event: PublicEventSummary; locale: string }) {
  const t = useTranslations('pages.events');

  // Format date
  const eventDate = event.startsAt
    ? new Date(event.startsAt).toLocaleDateString(locale, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  // Format price
  const formatPrice = (cents: number, currency: string) => {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(cents / 100);
  };

  // Location display
  const location = event.locationDisplay || [event.city, event.state].filter(Boolean).join(', ');

  return (
    <Link
      href={{
        pathname: '/events/[seriesSlug]/[editionSlug]',
        params: { seriesSlug: event.seriesSlug, editionSlug: event.slug },
      }}
      className="group block rounded-lg border bg-card shadow-sm overflow-hidden transition-all hover:shadow-md hover:border-primary/50"
    >
      {/* Hero image placeholder */}
      <div className="aspect-[16/9] bg-muted relative overflow-hidden">
        {event.heroImageUrl ? (
          <Image
            src={event.heroImageUrl}
            alt={event.seriesName}
            fill
            className="object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
            <span className="text-2xl font-bold text-primary/30">
              {event.seriesName.substring(0, 2).toUpperCase()}
            </span>
          </div>
        )}
        {/* Sport type badge */}
        <span className="absolute top-3 left-3 rounded-full bg-background/90 px-2 py-1 text-xs font-medium backdrop-blur">
          {t(`sportTypes.${event.sportType as SportType}`)}
        </span>
      </div>

      <div className="p-4 space-y-3">
        {/* Title */}
        <div>
          <h3 className="font-semibold text-lg group-hover:text-primary transition-colors line-clamp-1">
            {event.seriesName}
          </h3>
          <p className="text-sm text-muted-foreground">{event.editionLabel}</p>
        </div>

        {/* Date and location */}
        <div className="space-y-1 text-sm">
          {eventDate && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4 flex-shrink-0" />
              <span>{eventDate}</span>
            </div>
          )}
          {location && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-4 w-4 flex-shrink-0" />
              <span className="line-clamp-1">{location}</span>
            </div>
          )}
        </div>

        {/* Registration status and price */}
        <div className="flex items-center justify-between pt-2 border-t">
          <span
            className={cn(
              'text-xs font-medium px-2 py-1 rounded-full',
              event.isRegistrationOpen
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-muted text-muted-foreground',
            )}
          >
            {event.isRegistrationOpen ? t('card.registrationOpen') : t('card.registrationClosed')}
          </span>
          {event.minPriceCents !== null ? (
            <span className="text-sm font-medium">
              {t('card.fromPrice', { price: formatPrice(event.minPriceCents, event.currency) })}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">{t('card.freeEvent')}</span>
          )}
        </div>
      </div>
    </Link>
  );
}
