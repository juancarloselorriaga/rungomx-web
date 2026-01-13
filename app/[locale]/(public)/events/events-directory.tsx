'use client';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Link } from '@/i18n/navigation';
import { SPORT_TYPES, type SportType } from '@/lib/events/constants';
import { cn } from '@/lib/utils';
import type { PublicLocationValue } from '@/types/location';
import { format } from 'date-fns';
import { es, enUS } from 'date-fns/locale';
import { Calendar as CalendarIcon, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Filter, Loader2, MapPin, Ruler, Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { useCallback, useRef, useState, useTransition } from 'react';

// Date preset type
type DatePreset = 'any' | 'upcoming' | 'thisMonth' | 'nextMonth' | 'next3Months' | 'custom';

// Dynamic import for LocationField (uses Mapbox GL which requires browser APIs)
const LocationField = dynamic(
  () => import('@/components/location/location-field').then((mod) => mod.LocationField),
  { ssr: false, loading: () => <div className="h-10 rounded-md border bg-muted animate-pulse" /> },
);

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

  // New filter state
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [datePreset, setDatePreset] = useState<DatePreset>('any');
  const [customDateFrom, setCustomDateFrom] = useState<Date | undefined>(undefined);
  const [customDateTo, setCustomDateTo] = useState<Date | undefined>(undefined);
  const [openOnly, setOpenOnly] = useState(false);
  const [isVirtual, setIsVirtual] = useState<boolean | undefined>(undefined);
  const [distanceRange, setDistanceRange] = useState<[number, number]>([0, 200]);
  const [distanceRangeEnabled, setDistanceRangeEnabled] = useState(false);
  const [searchLocation, setSearchLocation] = useState<PublicLocationValue | null>(null);
  const [searchRadius, setSearchRadius] = useState(50);

  // Debounce timer refs
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const distanceDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch events with given parameters
  const fetchEvents = useCallback(async (params: {
    q?: string;
    sportType?: string;
    state?: string;
    dateFrom?: string; // ISO date string
    dateTo?: string; // ISO date string
    openOnly?: boolean;
    isVirtual?: boolean;
    distanceMin?: number;
    distanceMax?: number;
    lat?: number;
    lng?: number;
    radiusKm?: number;
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
    if (params.dateFrom) {
      searchParams.set('dateFrom', params.dateFrom);
    }
    if (params.dateTo) {
      searchParams.set('dateTo', params.dateTo);
    }
    if (params.openOnly) {
      searchParams.set('openOnly', 'true');
    }
    if (params.isVirtual !== undefined) {
      searchParams.set('isVirtual', String(params.isVirtual));
    }
    if (params.distanceMin !== undefined) {
      searchParams.set('distanceMin', String(params.distanceMin));
    }
    if (params.distanceMax !== undefined) {
      searchParams.set('distanceMax', String(params.distanceMax));
    }
    if (params.lat !== undefined) {
      searchParams.set('lat', String(params.lat));
    }
    if (params.lng !== undefined) {
      searchParams.set('lng', String(params.lng));
    }
    if (params.radiusKm !== undefined) {
      searchParams.set('radiusKm', String(params.radiusKm));
    }
    searchParams.set('page', params.page.toString());

    const response = await fetch(`/api/events?${searchParams.toString()}`);
    if (response.ok) {
      const data = await response.json();
      setEvents(data.events);
      setPagination(data.pagination);
    }
  }, []);

  // Helper to calculate date range from preset
  function getDateRangeFromPreset(preset: DatePreset, fromDate?: Date, toDate?: Date): { dateFrom?: string; dateTo?: string } {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (preset) {
      case 'any':
        return {}; // No date filter - backend defaults to future events
      case 'upcoming':
        return { dateFrom: today.toISOString() }; // From today onwards (explicit)
      case 'thisMonth': {
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        return { dateFrom: monthStart.toISOString(), dateTo: monthEnd.toISOString() };
      }
      case 'nextMonth': {
        const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const nextMonthEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59, 999);
        return { dateFrom: nextMonthStart.toISOString(), dateTo: nextMonthEnd.toISOString() };
      }
      case 'next3Months': {
        const threeMonthsEnd = new Date(now.getFullYear(), now.getMonth() + 3, 0, 23, 59, 59, 999);
        return { dateFrom: today.toISOString(), dateTo: threeMonthsEnd.toISOString() };
      }
      case 'custom':
        return {
          dateFrom: fromDate?.toISOString(),
          dateTo: toDate?.toISOString(),
        };
      default:
        return {};
    }
  }

  // Helper to build current filter params
  function buildFilterParams(overrides: Partial<Parameters<typeof fetchEvents>[0]> & { datePreset?: DatePreset; customFrom?: Date; customTo?: Date } = {}) {
    const effectivePreset = overrides.datePreset ?? datePreset;
    const effectiveFrom = overrides.customFrom ?? customDateFrom;
    const effectiveTo = overrides.customTo ?? customDateTo;
    const dateRange = getDateRangeFromPreset(effectivePreset, effectiveFrom, effectiveTo);

    return {
      q: search,
      sportType,
      state: stateFilter,
      ...dateRange,
      openOnly,
      isVirtual,
      distanceMin: distanceRangeEnabled ? distanceRange[0] : undefined,
      distanceMax: distanceRangeEnabled ? distanceRange[1] : undefined,
      lat: searchLocation?.lat,
      lng: searchLocation?.lng,
      radiusKm: searchLocation ? searchRadius : undefined,
      page: 1,
      ...overrides,
    };
  }

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
        fetchEvents(buildFilterParams({ q: value }));
      });
    }, 300);
  }

  // Handle filter changes
  function handleSportTypeChange(value: string) {
    setSportType(value);
    setPage(1);
    startTransition(() => {
      fetchEvents(buildFilterParams({ sportType: value }));
    });
  }

  function handleStateChange(value: string) {
    setStateFilter(value);
    setPage(1);
    startTransition(() => {
      fetchEvents(buildFilterParams({ state: value }));
    });
  }

  function handleDatePresetChange(preset: DatePreset) {
    setDatePreset(preset);
    // Clear custom dates when switching to a preset
    if (preset !== 'custom') {
      setCustomDateFrom(undefined);
      setCustomDateTo(undefined);
    }
    setPage(1);
    startTransition(() => {
      fetchEvents(buildFilterParams({ datePreset: preset }));
    });
  }

  function handleCustomDateFromChange(date: Date | undefined) {
    setCustomDateFrom(date);
    setPage(1);
    startTransition(() => {
      fetchEvents(buildFilterParams({ customFrom: date }));
    });
  }

  function handleCustomDateToChange(date: Date | undefined) {
    setCustomDateTo(date);
    setPage(1);
    startTransition(() => {
      fetchEvents(buildFilterParams({ customTo: date }));
    });
  }

  function handleOpenOnlyChange(checked: boolean) {
    setOpenOnly(checked);
    setPage(1);
    startTransition(() => {
      fetchEvents(buildFilterParams({ openOnly: checked }));
    });
  }

  function handleVirtualChange(value: boolean | undefined) {
    setIsVirtual(value);
    setPage(1);
    startTransition(() => {
      fetchEvents(buildFilterParams({ isVirtual: value }));
    });
  }

  function handleDistanceRangeEnabledChange(enabled: boolean) {
    setDistanceRangeEnabled(enabled);
    setPage(1);
    startTransition(() => {
      fetchEvents(buildFilterParams({
        distanceMin: enabled ? distanceRange[0] : undefined,
        distanceMax: enabled ? distanceRange[1] : undefined,
      }));
    });
  }

  function handleDistanceRangeChange(range: number[]) {
    setDistanceRange(range as [number, number]);
  }

  function handleDistanceRangeCommit(range: number[]) {
    // Clear existing timer
    if (distanceDebounceRef.current) {
      clearTimeout(distanceDebounceRef.current);
    }

    distanceDebounceRef.current = setTimeout(() => {
      setPage(1);
      startTransition(() => {
        fetchEvents(buildFilterParams({
          distanceMin: distanceRangeEnabled ? range[0] : undefined,
          distanceMax: distanceRangeEnabled ? range[1] : undefined,
        }));
      });
    }, 300);
  }

  function handleLocationChange(location: PublicLocationValue | null) {
    setSearchLocation(location);
    setPage(1);
    startTransition(() => {
      fetchEvents(buildFilterParams({
        lat: location?.lat,
        lng: location?.lng,
        radiusKm: location ? searchRadius : undefined,
      }));
    });
  }

  function handleRadiusChange(radius: number) {
    setSearchRadius(radius);
    if (searchLocation) {
      setPage(1);
      startTransition(() => {
        fetchEvents(buildFilterParams({ radiusKm: radius }));
      });
    }
  }

  function handlePageChange(newPage: number) {
    setPage(newPage);
    startTransition(() => {
      fetchEvents(buildFilterParams({ page: newPage }));
    });
  }

  function clearFilters() {
    setSearch('');
    setSportType('');
    setStateFilter('');
    setDatePreset('any');
    setCustomDateFrom(undefined);
    setCustomDateTo(undefined);
    setOpenOnly(false);
    setIsVirtual(undefined);
    setDistanceRange([0, 200]);
    setDistanceRangeEnabled(false);
    setSearchLocation(null);
    setSearchRadius(50);
    setPage(1);
    startTransition(() => {
      fetchEvents({ page: 1 });
    });
  }

  const hasFilters = search.trim() || sportType || stateFilter || datePreset !== 'any' ||
    openOnly || isVirtual !== undefined || distanceRangeEnabled || searchLocation;

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

          {/* More filters toggle */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className="gap-1"
          >
            <Filter className="h-4 w-4" />
            {t('filters.advanced')}
            {showAdvancedFilters ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </Button>
        </div>
      </div>

      {/* Advanced filters panel */}
      {showAdvancedFilters && (
        <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Date range filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('filters.dateRange')}</label>
              <select
                value={datePreset}
                onChange={(e) => handleDatePresetChange(e.target.value as DatePreset)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
              >
                <option value="any">{t('filters.anyDate')}</option>
                <option value="upcoming">{t('filters.upcoming')}</option>
                <option value="thisMonth">{t('filters.thisMonth')}</option>
                <option value="nextMonth">{t('filters.nextMonth')}</option>
                <option value="next3Months">{t('filters.next3Months')}</option>
                <option value="custom">{t('filters.customRange')}</option>
              </select>
            </div>

            {/* Custom date range pickers - shown only when 'custom' preset is selected */}
            {datePreset === 'custom' && (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('filters.from')}</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          'w-full justify-start text-left font-normal',
                          !customDateFrom && 'text-muted-foreground'
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {customDateFrom ? (
                          format(customDateFrom, 'PPP', { locale: locale === 'es' ? es : enUS })
                        ) : (
                          <span>{t('filters.selectDate')}</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={customDateFrom}
                        onSelect={handleCustomDateFromChange}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('filters.to')}</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          'w-full justify-start text-left font-normal',
                          !customDateTo && 'text-muted-foreground'
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {customDateTo ? (
                          format(customDateTo, 'PPP', { locale: locale === 'es' ? es : enUS })
                        ) : (
                          <span>{t('filters.selectDate')}</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={customDateTo}
                        onSelect={handleCustomDateToChange}
                        disabled={(date) => customDateFrom ? date < customDateFrom : false}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </>
            )}

            {/* Open registration toggle */}
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('filters.openOnly')}</label>
              <div className="flex items-center gap-2 pt-1">
                <Switch
                  id="open-only"
                  checked={openOnly}
                  onCheckedChange={handleOpenOnlyChange}
                />
                <label htmlFor="open-only" className="text-sm text-muted-foreground cursor-pointer">
                  {openOnly ? t('filters.openOnlyEnabled') : t('filters.openOnlyDisabled')}
                </label>
              </div>
            </div>

            {/* Virtual/In-person filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('filters.eventFormat')}</label>
              <select
                value={isVirtual === undefined ? '' : String(isVirtual)}
                onChange={(e) => handleVirtualChange(
                  e.target.value === '' ? undefined : e.target.value === 'true'
                )}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
              >
                <option value="">{t('filters.allFormats')}</option>
                <option value="false">{t('filters.inPerson')}</option>
                <option value="true">{t('filters.virtual')}</option>
              </select>
            </div>

            {/* Distance range filter */}
            <div className="space-y-2 sm:col-span-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Ruler className="h-4 w-4" />
                  {t('filters.distanceRange')}
                </label>
                <Switch
                  id="distance-range-enabled"
                  checked={distanceRangeEnabled}
                  onCheckedChange={handleDistanceRangeEnabledChange}
                />
              </div>
              {distanceRangeEnabled && (
                <div className="space-y-3 pt-2">
                  <Slider
                    value={distanceRange}
                    onValueChange={handleDistanceRangeChange}
                    onValueCommit={handleDistanceRangeCommit}
                    min={0}
                    max={200}
                    step={5}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{distanceRange[0]} km</span>
                    <span>{distanceRange[1]} km</span>
                  </div>
                </div>
              )}
            </div>

            {/* Location + radius filter */}
            <div className="space-y-2 sm:col-span-2 lg:col-span-3">
              <label className="text-sm font-medium">{t('filters.nearLocation')}</label>
              <div className="flex gap-2 items-start flex-wrap sm:flex-nowrap">
                <div className="flex-1 min-w-[200px]">
                  <LocationField
                    label=""
                    location={searchLocation}
                    country="MX"
                    language={locale}
                    onLocationChangeAction={handleLocationChange}
                  />
                </div>
                {searchLocation && (
                  <select
                    value={searchRadius}
                    onChange={(e) => handleRadiusChange(Number(e.target.value))}
                    className="rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
                  >
                    <option value="10">10 km</option>
                    <option value="25">25 km</option>
                    <option value="50">50 km</option>
                    <option value="100">100 km</option>
                    <option value="200">200 km</option>
                  </select>
                )}
              </div>
              {searchLocation && (
                <p className="text-xs text-muted-foreground">
                  {t('filters.searchingNear', { location: searchLocation.formattedAddress, radius: searchRadius })}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

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
          {datePreset !== 'any' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-sm text-primary">
              {datePreset === 'custom' ? (
                <>
                  {customDateFrom && format(customDateFrom, 'PP', { locale: locale === 'es' ? es : enUS })}
                  {customDateFrom && customDateTo && ' - '}
                  {customDateTo && format(customDateTo, 'PP', { locale: locale === 'es' ? es : enUS })}
                  {!customDateFrom && !customDateTo && t('filters.customRange')}
                </>
              ) : (
                t(`filters.${datePreset}`)
              )}
              <button type="button" onClick={() => handleDatePresetChange('any')}>
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {openOnly && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-sm text-primary">
              {t('filters.openOnly')}
              <button type="button" onClick={() => handleOpenOnlyChange(false)}>
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {isVirtual !== undefined && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-sm text-primary">
              {isVirtual ? t('filters.virtual') : t('filters.inPerson')}
              <button type="button" onClick={() => handleVirtualChange(undefined)}>
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {distanceRangeEnabled && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-sm text-primary">
              {distanceRange[0]}-{distanceRange[1]} km
              <button type="button" onClick={() => handleDistanceRangeEnabledChange(false)}>
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {searchLocation && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-sm text-primary">
              {searchRadius} km · {searchLocation.city || searchLocation.formattedAddress.split(',')[0]}
              <button type="button" onClick={() => handleLocationChange(null)}>
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
