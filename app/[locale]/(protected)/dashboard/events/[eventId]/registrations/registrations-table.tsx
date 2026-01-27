'use client';

import { useRouter } from '@/i18n/navigation';
import type { RegistrationListItem } from '@/lib/events/registrations';
import type { RegistrationStatus } from '@/lib/events/constants';
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useState, useTransition } from 'react';

type RegistrationsTableProps = {
  registrations: RegistrationListItem[];
  distances: Array<{ id: string; label: string }>;
  eventId: string;
  currentDistanceId?: string;
  currentStatus?: RegistrationStatus;
  currentSearch?: string;
  currentDateFrom?: string;
  currentDateTo?: string;
  currentPage: number;
  totalPages: number;
  total: number;
  locale: string;
};

const STATUS_COLORS: Record<RegistrationStatus, string> = {
  started: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  submitted: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  payment_pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  confirmed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  expired: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
};

export function RegistrationsTable({
  registrations,
  distances,
  eventId,
  currentDistanceId,
  currentStatus,
  currentSearch,
  currentDateFrom,
  currentDateTo,
  currentPage,
  totalPages,
  total,
  locale,
}: RegistrationsTableProps) {
  const t = useTranslations('pages.eventsRegistrations');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [searchInput, setSearchInput] = useState(currentSearch || '');
  const [dateFromInput, setDateFromInput] = useState(currentDateFrom || '');
  const [dateToInput, setDateToInput] = useState(currentDateTo || '');

  const updateFilters = useCallback(
    (params: Record<string, string | undefined>) => {
      const query: Record<string, string> = {};

      const nextDistanceId =
        params.distanceId === undefined ? currentDistanceId ?? '' : params.distanceId;
      if (nextDistanceId) query.distanceId = nextDistanceId;

      const nextStatus = params.status === undefined ? currentStatus ?? '' : params.status;
      if (nextStatus) query.status = nextStatus;

      const nextSearch = params.search === undefined ? currentSearch ?? '' : params.search;
      if (nextSearch) query.search = nextSearch;

      const nextDateFrom =
        params.dateFrom === undefined ? currentDateFrom ?? '' : params.dateFrom;
      if (nextDateFrom) query.dateFrom = nextDateFrom;

      const nextDateTo =
        params.dateTo === undefined ? currentDateTo ?? '' : params.dateTo;
      if (nextDateTo) query.dateTo = nextDateTo;

      // Handle page - reset to 1 when filters change unless explicitly set
      if (params.page) {
        query.page = params.page;
      }

      startTransition(() => {
        router.push(
          {
            pathname: '/dashboard/events/[eventId]/registrations',
            params: { eventId },
            query,
          },
          { scroll: false },
        );
      });
    },
    [router, eventId, currentDistanceId, currentStatus, currentSearch, currentDateFrom, currentDateTo],
  );

  const handleDistanceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    updateFilters({ distanceId: value, page: '1' });
  };

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    updateFilters({ status: value, page: '1' });
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    updateFilters({ search: searchInput.trim(), page: '1' });
  };

  const clearSearch = () => {
    setSearchInput('');
    updateFilters({ search: '', page: '1' });
  };

  const handleDateFromChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setDateFromInput(value);
    updateFilters({ dateFrom: value, page: '1' });
  };

  const handleDateToChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setDateToInput(value);
    updateFilters({ dateTo: value, page: '1' });
  };

  const clearDates = () => {
    setDateFromInput('');
    setDateToInput('');
    updateFilters({ dateFrom: '', dateTo: '', page: '1' });
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  };

  const formatCurrency = (cents: number | null) => {
    if (cents === null) return '-';
    return (cents / 100).toLocaleString(locale, {
      style: 'currency',
      currency: 'MXN',
    });
  };

  return (
    <div>
      {/* Filters */}
      <div className="border-b px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-3">
            {/* Distance filter */}
            <select
              value={currentDistanceId || ''}
              onChange={handleDistanceChange}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">{t('filters.allDistances')}</option>
              {distances.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>

            {/* Status filter */}
            <select
              value={currentStatus || ''}
              onChange={handleStatusChange}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">{t('filters.allStatuses')}</option>
              <option value="confirmed">{t('status.confirmed')}</option>
              <option value="payment_pending">{t('status.payment_pending')}</option>
              <option value="submitted">{t('status.submitted')}</option>
              <option value="started">{t('status.started')}</option>
              <option value="cancelled">{t('status.cancelled')}</option>
              <option value="expired">{t('status.expired')}</option>
            </select>

            {/* Date range filter */}
            <div className="flex items-center gap-2">
              <label htmlFor="date-from" className="text-sm text-muted-foreground">
                {t('filters.dateFrom')}
              </label>
              <input
                id="date-from"
                type="date"
                value={dateFromInput}
                onChange={handleDateFromChange}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                disabled={isPending}
              />
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="date-to" className="text-sm text-muted-foreground">
                {t('filters.dateTo')}
              </label>
              <input
                id="date-to"
                type="date"
                value={dateToInput}
                onChange={handleDateToChange}
                min={dateFromInput || undefined}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                disabled={isPending}
              />
            </div>
            {(dateFromInput || dateToInput) && (
              <button
                type="button"
                onClick={clearDates}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isPending}
              >
                {t('filters.clearDates')}
              </button>
            )}
          </div>

          {/* Search */}
          <form onSubmit={handleSearch} className="relative flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={t('filters.searchPlaceholder')}
                className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-ring sm:w-64"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <button
              type="submit"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              {t('filters.search')}
            </button>
          </form>
        </div>
      </div>

      {/* Table */}
      {registrations.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <p className="text-muted-foreground">{t('emptyState')}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="border-b text-left text-sm text-muted-foreground">
                <th className="px-4 py-3 font-medium sm:px-6">{t('table.buyer')}</th>
                <th className="px-4 py-3 font-medium sm:px-6">{t('table.registrant')}</th>
                <th className="px-4 py-3 font-medium sm:px-6">{t('table.distance')}</th>
                <th className="px-4 py-3 font-medium sm:px-6">{t('table.status')}</th>
                <th className="px-4 py-3 font-medium sm:px-6">{t('table.total')}</th>
                <th className="px-4 py-3 font-medium sm:px-6">{t('table.date')}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {registrations.map((registration) => (
                <tr
                  key={registration.id}
                  className={`hover:bg-muted/50 transition-colors ${isPending ? 'opacity-50' : ''}`}
                >
                  <td className="px-4 py-4 sm:px-6">
                    <div>
                      <p className="font-medium">
                        {registration.buyer.id ? registration.buyer.name : t('table.unclaimed')}
                      </p>
                      {registration.buyer.id && registration.buyer.email ? (
                        <p className="text-sm text-muted-foreground">
                          {registration.buyer.email}
                        </p>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-4 sm:px-6">
                    {registration.registrant ? (
                      <div>
                        <p className="font-medium">
                          {registration.registrant.firstName}{' '}
                          {registration.registrant.lastName}
                        </p>
                        {registration.registrant.email && (
                          <p className="text-sm text-muted-foreground">
                            {registration.registrant.email}
                          </p>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="px-4 py-4 sm:px-6">
                    <span className="text-sm">{registration.distance.label}</span>
                  </td>
                  <td className="px-4 py-4 sm:px-6">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                        STATUS_COLORS[registration.status]
                      }`}
                    >
                      {t(`status.${registration.status}`)}
                    </span>
                  </td>
                  <td className="px-4 py-4 sm:px-6">
                    <span className="text-sm font-medium">
                      {formatCurrency(registration.totalCents)}
                    </span>
                  </td>
                  <td className="px-4 py-4 sm:px-6">
                    <span className="text-sm text-muted-foreground">
                      {formatDate(registration.createdAt)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col gap-3 border-t px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-sm text-muted-foreground">
            {t('pagination.showing', {
              start: (currentPage - 1) * 25 + 1,
              end: Math.min(currentPage * 25, total),
              total,
            })}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => updateFilters({ page: String(currentPage - 1) })}
              disabled={currentPage === 1 || isPending}
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-4 w-4" />
              {t('pagination.previous')}
            </button>
            <span className="text-sm text-muted-foreground">
              {t('pagination.page', { current: currentPage, total: totalPages })}
            </span>
            <button
              onClick={() => updateFilters({ page: String(currentPage + 1) })}
              disabled={currentPage === totalPages || isPending}
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('pagination.next')}
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
