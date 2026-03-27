'use client';

import { Button } from '@/components/ui/button';
import { useRouter } from '@/i18n/navigation';
import type { RegistrationListItem } from '@/lib/events/registrations';
import type { RegistrationStatus } from '@/lib/events/constants';
import { formatMoneyFromMinor } from '@/lib/utils/format-money';
import { DatePicker } from '@/components/ui/date-picker';
import { ChevronLeft, ChevronRight, Search, Users, X } from 'lucide-react';
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
  const tCommon = useTranslations('common');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [searchInput, setSearchInput] = useState(currentSearch || '');
  const [dateFromInput, setDateFromInput] = useState(currentDateFrom || '');
  const [dateToInput, setDateToInput] = useState(currentDateTo || '');

  const updateFilters = useCallback(
    (params: Record<string, string | undefined>) => {
      const query: Record<string, string> = {};

      const nextDistanceId =
        params.distanceId === undefined ? (currentDistanceId ?? '') : params.distanceId;
      if (nextDistanceId) query.distanceId = nextDistanceId;

      const nextStatus = params.status === undefined ? (currentStatus ?? '') : params.status;
      if (nextStatus) query.status = nextStatus;

      const nextSearch = params.search === undefined ? (currentSearch ?? '') : params.search;
      if (nextSearch) query.search = nextSearch;

      const nextDateFrom =
        params.dateFrom === undefined ? (currentDateFrom ?? '') : params.dateFrom;
      if (nextDateFrom) query.dateFrom = nextDateFrom;

      const nextDateTo = params.dateTo === undefined ? (currentDateTo ?? '') : params.dateTo;
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
    [
      router,
      eventId,
      currentDistanceId,
      currentStatus,
      currentSearch,
      currentDateFrom,
      currentDateTo,
    ],
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

  const handleDateFromChange = (value: string) => {
    setDateFromInput(value);

    const nextDateTo = dateToInput && value && dateToInput < value ? '' : dateToInput;
    if (nextDateTo !== dateToInput) setDateToInput(nextDateTo);

    updateFilters({ dateFrom: value, dateTo: nextDateTo, page: '1' });
  };

  const handleDateToChange = (value: string) => {
    setDateToInput(value);

    const nextDateFrom = dateFromInput && value && value < dateFromInput ? '' : dateFromInput;
    if (nextDateFrom !== dateFromInput) setDateFromInput(nextDateFrom);

    updateFilters({ dateFrom: nextDateFrom, dateTo: value, page: '1' });
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
    return formatMoneyFromMinor(cents, 'MXN', locale);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Filters */}
      <div className="border-b border-border/60 px-4 pt-4 sm:px-6 sm:pt-6">
        <div className="rounded-2xl border border-border/60 bg-background/70 p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">
                {total} {t('stats.total')}
              </p>
              <p className="text-xs text-muted-foreground">{t('description')}</p>
            </div>
          </div>

          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
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
                <span className="text-sm text-muted-foreground">{t('filters.dateFrom')}</span>
                <DatePicker
                  locale={locale}
                  value={dateFromInput}
                  onChangeAction={handleDateFromChange}
                  clearLabel={tCommon('clear')}
                  disabled={isPending}
                  max={dateToInput || undefined}
                  className="w-[170px]"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{t('filters.dateTo')}</span>
                <DatePicker
                  locale={locale}
                  value={dateToInput}
                  onChangeAction={handleDateToChange}
                  clearLabel={tCommon('clear')}
                  disabled={isPending}
                  min={dateFromInput || undefined}
                  className="w-[170px]"
                />
              </div>
              {(dateFromInput || dateToInput) && (
                <Button type="button" variant="outline" onClick={clearDates} disabled={isPending}>
                  {t('filters.clearDates')}
                </Button>
              )}
            </div>

            {/* Search */}
            <form
              onSubmit={handleSearch}
              className="relative flex flex-col gap-2 sm:flex-row sm:items-center"
            >
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
              <Button type="submit">{t('filters.search')}</Button>
            </form>
          </div>
        </div>
      </div>

      {/* Table */}
      {registrations.length === 0 ? (
        <div className="px-6 pb-6">
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-background/40 px-6 py-12 text-center">
            <div className="mb-4 rounded-full border border-border/60 bg-background p-3 text-muted-foreground">
              <Users className="h-5 w-5" />
            </div>
            <p className="max-w-md text-sm text-muted-foreground">{t('emptyState')}</p>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="border-b bg-muted/20 text-left text-sm text-muted-foreground">
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
                  className={`transition-colors hover:bg-muted/35 ${isPending ? 'opacity-50' : ''}`}
                >
                  <td className="px-4 py-4 sm:px-6">
                    <div>
                      <p className="font-medium">
                        {registration.buyer.id ? registration.buyer.name : t('table.unclaimed')}
                      </p>
                      {registration.buyer.id && registration.buyer.email ? (
                        <p className="text-sm text-muted-foreground">{registration.buyer.email}</p>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-4 sm:px-6">
                    {registration.registrant ? (
                      <div>
                        <p className="font-medium">
                          {registration.registrant.firstName} {registration.registrant.lastName}
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
        <div className="flex flex-col gap-3 border-t border-border/60 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-sm text-muted-foreground">
            {t('pagination.showing', {
              start: (currentPage - 1) * 25 + 1,
              end: Math.min(currentPage * 25, total),
              total,
            })}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => updateFilters({ page: String(currentPage - 1) })}
              disabled={currentPage === 1 || isPending}
            >
              <ChevronLeft className="h-4 w-4" />
              {t('pagination.previous')}
            </Button>
            <span className="text-sm text-muted-foreground">
              {t('pagination.page', { current: currentPage, total: totalPages })}
            </span>
            <Button
              type="button"
              variant="outline"
              onClick={() => updateFilters({ page: String(currentPage + 1) })}
              disabled={currentPage === totalPages || isPending}
            >
              {t('pagination.next')}
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
