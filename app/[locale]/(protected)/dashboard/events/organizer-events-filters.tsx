'use client';

import { usePathname, useRouter } from '@/i18n/navigation';
import {
  buildOrganizerEventsQueryObject,
  hasOrganizerEventsFilters,
  normalizeOrganizerEventsQuery,
  type NormalizedOrganizerEventsQuery,
  type OrganizerEventsQuery,
} from '@/lib/events/organizer-events';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';

type OrganizerEventsFiltersProps = {
  query: NormalizedOrganizerEventsQuery;
  organizations: Array<{ id: string; name: string }>;
  totalEvents: number;
  filteredEvents: number;
  onPendingChange?: (pending: boolean) => void;
};

const inputClassName =
  'w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30';

const labelClassName = 'text-xs font-medium text-muted-foreground';

const SEARCH_THROTTLE_MS = 400;

export function OrganizerEventsFilters({
  query,
  organizations,
  totalEvents,
  filteredEvents,
  onPendingChange,
}: OrganizerEventsFiltersProps) {
  const t = useTranslations('pages.dashboardEvents');
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const hasFilters = hasOrganizerEventsFilters(query);
  const defaultFilters = useMemo(() => normalizeOrganizerEventsQuery({}), []);
  const [formState, setFormState] = useState<NormalizedOrganizerEventsQuery>(query);
  const latestStateRef = useRef(formState);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const shouldRestoreFocusRef = useRef(false);
  const isNavigatingRef = useRef(false);

  useEffect(() => {
    setFormState(query);
  }, [query]);

  useEffect(() => {
    latestStateRef.current = formState;
  }, [formState]);

  useEffect(() => {
    onPendingChange?.(isPending);
  }, [isPending, onPendingChange]);

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  const isSameQuery = useCallback(
    (nextQuery: NormalizedOrganizerEventsQuery) =>
      nextQuery.search === query.search &&
      nextQuery.visibility === query.visibility &&
      nextQuery.time === query.time &&
      nextQuery.registration === query.registration &&
      nextQuery.organizationId === query.organizationId &&
      nextQuery.sort === query.sort,
    [query],
  );

  const navigate = useCallback(
    (nextFilters: OrganizerEventsQuery) => {
      const normalizedNext = normalizeOrganizerEventsQuery(nextFilters);
      if (isSameQuery(normalizedNext)) return;
      const queryObject = buildOrganizerEventsQueryObject(normalizedNext);
      const href = { pathname, query: queryObject } as Parameters<typeof router.replace>[0];
      isNavigatingRef.current = true;
      startTransition(() => {
        router.replace(href, { scroll: false });
      });
    },
    [isSameQuery, pathname, router, startTransition],
  );

  const clearPendingSearch = useCallback(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }
  }, []);

  const scheduleSearchNavigation = useCallback(
    (nextSearch: string) => {
      clearPendingSearch();
      searchTimeoutRef.current = setTimeout(() => {
        const nextState = {
          ...latestStateRef.current,
          search: nextSearch,
        };
        navigate(nextState);
      }, SEARCH_THROTTLE_MS);
    },
    [clearPendingSearch, navigate],
  );

  const handleSearchChange = (value: string) => {
    setFormState((prev) => ({ ...prev, search: value }));
    scheduleSearchNavigation(value.trim());
  };

  const handleClearSearch = () => {
    const nextState = { ...formState, search: '' };
    setFormState(nextState);
    clearPendingSearch();
    navigate(nextState);
    requestAnimationFrame(() => {
      searchInputRef.current?.focus({ preventScroll: true });
    });
  };

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearPendingSearch();
    navigate({ ...formState, search: formState.search.trim() });
  };

  const handleSelectChange = (updates: Partial<OrganizerEventsQuery>) => {
    const nextState = { ...latestStateRef.current, ...updates };
    setFormState(nextState);
    clearPendingSearch();
    navigate(nextState);
  };

  const handleClearFilters = () => {
    setFormState(defaultFilters);
    clearPendingSearch();
    navigate(defaultFilters);
  };

  useEffect(() => {
    if (isPending) return;
    if (!isNavigatingRef.current) return;
    isNavigatingRef.current = false;
    if (!shouldRestoreFocusRef.current) return;
    const input = searchInputRef.current;
    if (!input) return;
    input.focus({ preventScroll: true });
    const length = input.value.length;
    try {
      input.setSelectionRange(length, length);
    } catch {
      // Some input types may not support selection range.
    }
  }, [isPending]);

  return (
    <div className="space-y-4 rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold">{t('filters.title')}</p>
          <p className="text-xs text-muted-foreground">
            {t('filters.summary', { filtered: filteredEvents, total: totalEvents })}
          </p>
        </div>
        {hasFilters ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-destructive"
            onClick={handleClearFilters}
            type="button"
          >
            {t('filters.clear')}
          </Button>
        ) : null}
      </div>

      <form
        onSubmit={handleSearchSubmit}
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        <div className="space-y-1 sm:col-span-2 lg:col-span-2">
          <label className={labelClassName} htmlFor="search">
            {t('filters.searchLabel')}
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              id="search"
              type="search"
              value={formState.search}
              onChange={(event) => handleSearchChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && formState.search) {
                  event.preventDefault();
                  handleClearSearch();
                }
              }}
              onFocus={() => {
                shouldRestoreFocusRef.current = true;
              }}
              onBlur={(event) => {
                if (!isNavigatingRef.current || event.relatedTarget) {
                  shouldRestoreFocusRef.current = false;
                }
              }}
              placeholder={t('filters.searchPlaceholder')}
              className={cn(inputClassName, 'pl-9 pr-12')}
              ref={searchInputRef}
            />
            <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
              {isPending ? (
                <Spinner className="size-4 text-muted-foreground" aria-hidden />
              ) : null}
              {formState.search ? (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="rounded-full p-1 text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  aria-label={t('filters.clearSearch')}
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="space-y-1">
          <label className={labelClassName} htmlFor="visibility">
            {t('filters.visibilityLabel')}
          </label>
          <select
            id="visibility"
            value={formState.visibility}
            onChange={(event) =>
              handleSelectChange({ visibility: event.target.value as OrganizerEventsQuery['visibility'] })
            }
            className={inputClassName}
            disabled={isPending}
          >
            <option value="all">{t('filters.visibilityAll')}</option>
            <option value="published">{t('visibility.published')}</option>
            <option value="draft">{t('visibility.draft')}</option>
            <option value="unlisted">{t('visibility.unlisted')}</option>
            <option value="archived">{t('visibility.archived')}</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className={labelClassName} htmlFor="time">
            {t('filters.timeLabel')}
          </label>
          <select
            id="time"
            value={formState.time}
            onChange={(event) =>
              handleSelectChange({ time: event.target.value as OrganizerEventsQuery['time'] })
            }
            className={inputClassName}
            disabled={isPending}
          >
            <option value="all">{t('filters.timeAll')}</option>
            <option value="upcoming">{t('filters.timeUpcoming')}</option>
            <option value="current">{t('filters.timeCurrent')}</option>
            <option value="past">{t('filters.timePast')}</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className={labelClassName} htmlFor="registration">
            {t('filters.registrationLabel')}
          </label>
          <select
            id="registration"
            value={formState.registration}
            onChange={(event) =>
              handleSelectChange({
                registration: event.target.value as OrganizerEventsQuery['registration'],
              })
            }
            className={inputClassName}
            disabled={isPending}
          >
            <option value="all">{t('filters.registrationAll')}</option>
            <option value="open">{t('filters.registrationOpen')}</option>
            <option value="upcoming">{t('filters.registrationUpcoming')}</option>
            <option value="closed">{t('filters.registrationClosed')}</option>
            <option value="paused">{t('filters.registrationPaused')}</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className={labelClassName} htmlFor="organization">
            {t('filters.organizationLabel')}
          </label>
          <select
            id="organization"
            value={formState.organizationId}
            onChange={(event) =>
              handleSelectChange({ organizationId: event.target.value })
            }
            className={inputClassName}
            disabled={isPending}
          >
            <option value="">{t('filters.organizationAll')}</option>
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className={labelClassName} htmlFor="sort">
            {t('filters.sortLabel')}
          </label>
          <select
            id="sort"
            value={formState.sort}
            onChange={(event) =>
              handleSelectChange({ sort: event.target.value as OrganizerEventsQuery['sort'] })
            }
            className={inputClassName}
            disabled={isPending}
          >
            <option value="priority">{t('filters.sortPriority')}</option>
            <option value="startsAt">{t('filters.sortStartsAtAsc')}</option>
            <option value="startsAtDesc">{t('filters.sortStartsAtDesc')}</option>
            <option value="createdAt">{t('filters.sortCreatedDesc')}</option>
            <option value="registrations">{t('filters.sortRegistrationsDesc')}</option>
          </select>
        </div>
      </form>

    </div>
  );
}
