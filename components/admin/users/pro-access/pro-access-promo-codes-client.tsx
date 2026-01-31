'use client';

import {
  createPromotionAction,
  disablePromotionAction,
  enablePromotionAction,
} from '@/app/actions/billing-admin';
import type { NormalizedAdminPromotionsQuery } from '@/lib/admin-pro-access/promotions-query';
import { buildAdminUsersQueryObject } from '@/components/admin/users/search-params';
import { adminUsersTextInputClassName } from '@/components/admin/users/styles';
import { UsersTablePagination } from '@/components/admin/users/users-table-pagination';
import { GrantTypeSelector } from '@/components/admin/users/pro-access/grant-type-selector';
import { Badge } from '@/components/common/badge';
import { EntityListView } from '@/components/list-view/entity-list-view';
import type { ListViewColumn } from '@/components/list-view/types';
import { Button } from '@/components/ui/button';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { FormField } from '@/components/ui/form-field';
import { IconTooltipButton } from '@/components/ui/icon-tooltip-button';
import { Spinner } from '@/components/ui/spinner';
import { Form, FormError, useForm } from '@/lib/forms';
import { usePathname, useRouter } from '@/i18n/navigation';
import { Copy, Pause, Play, Search } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import type { FormEvent } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

type PromotionFormValues = {
  name: string;
  description: string;
  grantType: 'duration' | 'until';
  grantDurationDays: string;
  grantFixedEndsAt: string;
  validFrom: string;
  validTo: string;
  maxRedemptions: string;
};

export type SerializedAdminPromotionRow = {
  id: string;
  name: string | null;
  description: string | null;
  codePrefix: string | null;
  isActive: boolean;
  redemptionCount: number;
  maxRedemptions: number | null;
  validFrom: string | null;
  validTo: string | null;
  createdAt: string;
  updatedAt: string;
};

type AdminPromotionRow = {
  id: string;
  name: string | null;
  description: string | null;
  codePrefix: string | null;
  isActive: boolean;
  redemptionCount: number;
  maxRedemptions: number | null;
  validFrom: Date | null;
  validTo: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type ProAccessPromoCodesClientProps = {
  initialPromotions: SerializedAdminPromotionRow[];
  initialError: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'SERVER_ERROR' | null;
  initialQuery: NormalizedAdminPromotionsQuery;
  paginationMeta: {
    page: number;
    pageSize: number;
    total: number;
    pageCount: number;
  };
};

function toOptionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function deserializePromotions(rows: SerializedAdminPromotionRow[]): AdminPromotionRow[] {
  return rows.map((row) => ({
    ...row,
    validFrom: row.validFrom ? new Date(row.validFrom) : null,
    validTo: row.validTo ? new Date(row.validTo) : null,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  }));
}

function formatRedemptions({ count, max }: { count: number; max: number | null }) {
  if (typeof max === 'number') return `${count} / ${max}`;
  return String(count);
}

function PromotionsListTable({
  promotions,
  query,
  paginationMeta,
  isLoading,
  onLoadingChangeAction,
}: {
  promotions: AdminPromotionRow[];
  query: NormalizedAdminPromotionsQuery;
  paginationMeta: ProAccessPromoCodesClientProps['paginationMeta'];
  isLoading: boolean;
  onLoadingChangeAction: (loading: boolean) => void;
}) {
  const t = useTranslations('pages.adminProAccess.billing');
  const tCommon = useTranslations('common');
  const format = useFormatter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const [searchValue, setSearchValue] = useState(query.search);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    onLoadingChangeAction(false);
  }, [promotions, query, onLoadingChangeAction]);

  const navigate = (
    updates: Record<string, string | null | undefined>,
    options?: { replace?: boolean },
  ) => {
    const queryObject = buildAdminUsersQueryObject(searchParams.toString(), updates);
    const href = { pathname, query: queryObject } as unknown as Parameters<typeof router.push>[0];
    onLoadingChangeAction(true);
    if (options?.replace) {
      router.replace(href, { scroll: false });
    } else {
      router.push(href, { scroll: false });
    }
  };

  const hasActiveFilters = query.search.trim() !== '' || query.status !== 'all';

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    navigate({ search: searchValue.trim() || null, page: '1' });
  };

  const handleClearFilters = () => {
    setSearchValue('');
    navigate({ status: 'all', search: null, page: '1' });
  };

  const copyPromotionId = useCallback(
    async (promotionId: string) => {
      try {
        await navigator.clipboard.writeText(promotionId);
        toast.success(t('promotion.success.copied'));
      } catch {
        toast.error(t('promotion.errors.copyFailed'));
      }
    },
    [t],
  );

  const togglePromotion = useCallback(
    async (promotion: AdminPromotionRow) => {
      setTogglingId(promotion.id);

      const result = promotion.isActive
        ? await disablePromotionAction({ promotionId: promotion.id })
        : await enablePromotionAction({ promotionId: promotion.id });

      if (!result.ok) {
        const message =
          result.error === 'UNAUTHENTICATED'
            ? t('promotion.errors.unauthenticated')
            : result.error === 'FORBIDDEN'
              ? t('promotion.errors.forbidden')
              : result.error === 'INVALID_INPUT'
                ? t('promotion.errors.invalidInput')
                : t('promotion.errors.generic');
        toast.error(message);
        setTogglingId(null);
        return;
      }

      toast.success(
        promotion.isActive ? t('promotion.success.disabled') : t('promotion.success.enabled'),
      );
      router.refresh();
      setTogglingId(null);
    },
    [router, t],
  );

  const rowPadding: 'py-2' | 'py-3' = 'py-3';

  const columns = useMemo(() => {
    const formatUtc = (value: Date) =>
      format.dateTime(value, {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'UTC',
      });

    return [
      {
        key: 'promotion',
        header: t('promotion.list.columns.promotion'),
        sortKey: 'name',
        defaultSortDir: 'asc',
        cell: (promotion) => (
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-foreground">
                {promotion.name ?? promotion.codePrefix ?? promotion.id}
              </span>
              {promotion.isActive ? (
                <Badge variant="green" size="sm">
                  {t('promotion.search.badges.active')}
                </Badge>
              ) : (
                <Badge variant="outline" size="sm">
                  {t('promotion.search.badges.inactive')}
                </Badge>
              )}
            </div>
            {promotion.description ? (
              <span className="text-xs text-muted-foreground">{promotion.description}</span>
            ) : null}
          </div>
        ),
      },
      {
        key: 'prefix',
        header: t('promotion.list.columns.prefix'),
        cell: (promotion) => (
          <span className="font-mono text-xs text-muted-foreground">
            {promotion.codePrefix ?? t('promotion.list.values.missing')}
          </span>
        ),
      },
      {
        key: 'redemptions',
        header: t('promotion.list.columns.redemptions'),
        sortKey: 'redemptions',
        defaultSortDir: 'desc',
        cell: (promotion) => (
          <span className="text-sm text-muted-foreground">
            {formatRedemptions({ count: promotion.redemptionCount, max: promotion.maxRedemptions })}
          </span>
        ),
      },
      {
        key: 'created',
        header: t('promotion.list.columns.created'),
        sortKey: 'createdAt',
        defaultSortDir: 'desc',
        cell: (promotion) => (
          <span className="text-sm text-muted-foreground" suppressHydrationWarning>
            {formatUtc(promotion.createdAt)}
          </span>
        ),
      },
      {
        key: 'actions',
        header: t('promotion.list.columns.actions'),
        align: 'right',
        cell: (promotion) => (
          <div className="flex items-center justify-end gap-1">
            <IconTooltipButton
              type="button"
              variant="ghost"
              size="icon"
              label={
                promotion.isActive
                  ? t('promotion.list.actions.disable')
                  : t('promotion.list.actions.enable')
              }
              disabled={togglingId === promotion.id}
              onClick={() => togglePromotion(promotion)}
            >
              {togglingId === promotion.id ? (
                <Spinner className="size-4" />
              ) : promotion.isActive ? (
                <Pause className="size-4" />
              ) : (
                <Play className="size-4" />
              )}
            </IconTooltipButton>

            <IconTooltipButton
              type="button"
              variant="ghost"
              size="icon"
              label={t('promotion.list.actions.copyId')}
              onClick={() => copyPromotionId(promotion.id)}
              disabled={togglingId === promotion.id}
            >
              <Copy className="size-4" />
            </IconTooltipButton>
          </div>
        ),
      },
    ] satisfies Array<ListViewColumn<AdminPromotionRow, string, NormalizedAdminPromotionsQuery['sortBy']>>;
  }, [copyPromotionId, format, t, togglePromotion, togglingId]);

  const emptyContent = (
    <div className="flex flex-col items-center gap-3">
      <div>
        <p className="font-semibold text-foreground">{t('promotion.list.empty.title')}</p>
        <p className="text-xs text-muted-foreground">{t('promotion.list.empty.description')}</p>
      </div>
      <Button size="sm" variant="outline" onClick={handleClearFilters}>
        {t('promotion.list.empty.clearButton')}
      </Button>
    </div>
  );

  return (
    <EntityListView
      items={promotions}
      getRowIdAction={(promotion) => promotion.id}
      columns={columns}
      sort={{ key: query.sortBy, dir: query.sortDir }}
      onSortChangeAction={(next) => navigate({ sort: next.key, dir: next.dir, page: '1' })}
      isLoading={isLoading}
      emptyContent={emptyContent}
      rowPadding={rowPadding}
      minWidthClassName="min-w-[760px]"
      renderSkeletonRowsAction={({ rows, visibleColumns, rowPadding }) => (
        <>
          {Array.from({ length: rows }).map((_, index) => (
            <tr key={`promotion-skeleton-${index}`} className="border-t">
              {visibleColumns.map((column) => (
                <td key={column.key} className={`px-4 align-top ${rowPadding}`}>
                  <div className="h-4 w-24 rounded bg-muted animate-pulse" />
                </td>
              ))}
            </tr>
          ))}
        </>
      )}
      skeletonRows={Math.max(3, Math.min(paginationMeta.pageSize ?? 10, 8))}
      controls={
        <div className="space-y-3">
          <div className="rounded-lg border bg-card p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Search className="size-3.5" />
              <span>{tCommon('search')}</span>
            </div>
            <form onSubmit={handleSearch} className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  value={searchValue}
                  onChange={(event) => setSearchValue(event.target.value)}
                  placeholder={t('promotion.list.search.placeholder')}
                  className={`min-w-[180px] pl-10 pr-3 ${adminUsersTextInputClassName}`}
                />
              </div>
              <Button type="submit" size="sm" variant="secondary" className="w-full shrink-0 sm:w-auto">
                {t('promotion.list.search.apply')}
              </Button>
            </form>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1 rounded-lg border bg-card p-3">
              <div className="mb-2 flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
                <div className="flex gap-2">
                  <span>{t('promotion.list.filters.label')}</span>
                </div>
                <Button
                  variant="ghost"
                  type="button"
                  disabled={!hasActiveFilters}
                  onClick={handleClearFilters}
                  className="h-auto min-w-auto p-0 text-xs text-destructive hover:bg-destructive/80 hover:text-destructive"
                >
                  {t('promotion.list.filters.clear')}
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {(['all', 'active', 'inactive'] as const).map((status) => (
                  <Button
                    key={status}
                    type="button"
                    size="sm"
                    variant={query.status === status ? 'default' : 'outline'}
                    onClick={() => navigate({ status, page: '1' })}
                    className="h-8 flex-1"
                  >
                    {t(`promotion.list.filters.status.${status}`)}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </div>
      }
      pagination={
        <UsersTablePagination
          page={paginationMeta.page}
          pageCount={paginationMeta.pageCount}
          pageSize={paginationMeta.pageSize}
          total={paginationMeta.total}
          basePath={pathname}
          filters={Object.fromEntries(searchParams.entries())}
          onNavigateAction={() => onLoadingChangeAction(true)}
          translationNamespace="pages.adminProAccess.billing.promotion.list.pagination"
        />
      }
    />
  );
}

export function ProAccessPromoCodesClient({
  initialPromotions,
  initialError,
  initialQuery,
  paginationMeta,
}: ProAccessPromoCodesClientProps) {
  const tPage = useTranslations('pages.adminProAccess.page.promoCodes');
  const t = useTranslations('pages.adminProAccess.billing');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();

  const promotions = useMemo(() => deserializePromotions(initialPromotions), [initialPromotions]);
  const [isTableLoading, setIsTableLoading] = useState(false);

  const [latestPromoCode, setLatestPromoCode] = useState<string | null>(null);

  const promoForm = useForm<PromotionFormValues, { code: string }>({
    defaultValues: {
      name: '',
      description: '',
      grantType: 'duration',
      grantDurationDays: '',
      grantFixedEndsAt: '',
      validFrom: '',
      validTo: '',
      maxRedemptions: '',
    },
    onSubmit: async (values) => {
      const payload = {
        name: values.name.trim() || null,
        description: values.description.trim() || null,
        grantDurationDays:
          values.grantType === 'duration' ? toOptionalNumber(values.grantDurationDays) : null,
        grantFixedEndsAt:
          values.grantType === 'until' && values.grantFixedEndsAt ? values.grantFixedEndsAt : null,
        validFrom: values.validFrom ? values.validFrom : null,
        validTo: values.validTo ? values.validTo : null,
        maxRedemptions: toOptionalNumber(values.maxRedemptions),
      };

      const result = await createPromotionAction(payload);
      if (!result.ok) {
        const message =
          result.error === 'UNAUTHENTICATED'
            ? t('promotion.errors.unauthenticated')
            : result.error === 'FORBIDDEN'
              ? t('promotion.errors.forbidden')
              : result.error === 'INVALID_INPUT'
                ? t('promotion.errors.invalidInput')
                : t('promotion.errors.generic');
        const fieldErrors =
          result.error === 'INVALID_INPUT' && 'fieldErrors' in result && result.fieldErrors
            ? Object.fromEntries(
                Object.keys(result.fieldErrors).map((field) => [field, [message]]),
              )
            : undefined;
        return fieldErrors ? { ...result, fieldErrors, message } : { ...result, message };
      }
      return result;
    },
    onSuccess: (data) => {
      setLatestPromoCode(data.code);
      toast.success(t('promotion.success.created'));
      promoForm.reset();
      promoForm.setFieldValue('grantType', 'duration');
      setIsTableLoading(true);
      router.refresh();
    },
  });

  const bannerMessage = useMemo(() => {
    if (!initialError) return null;
    switch (initialError) {
      case 'UNAUTHENTICATED':
        return t('promotion.errors.unauthenticated');
      case 'FORBIDDEN':
        return t('promotion.errors.forbidden');
      default:
        return t('promotion.errors.generic');
    }
  }, [initialError, t]);

  const copyPromoCode = async () => {
    if (!latestPromoCode) return;
    try {
      await navigator.clipboard.writeText(latestPromoCode);
      toast.success(t('promotion.success.copied'));
    } catch {
      toast.error(t('promotion.errors.copyFailed'));
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary/80">
          {tPage('sectionLabel')}
        </p>
        <div className="space-y-1">
          <h1 className="text-3xl font-bold leading-tight">{tPage('title')}</h1>
          <p className="text-muted-foreground">{tPage('description')}</p>
        </div>
      </div>

      {bannerMessage ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {bannerMessage}
        </div>
      ) : null}

      <section className="space-y-5 rounded-lg border bg-card p-5 shadow-sm">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('promotion.sectionLabel')}
          </p>
          <h2 className="text-lg font-semibold">{t('promotion.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('promotion.description')}</p>
        </div>

        {latestPromoCode ? (
          <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {t('promotion.latestLabel')}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="font-mono text-base font-semibold text-foreground">
                {latestPromoCode}
              </span>
              <Button type="button" size="sm" variant="outline" onClick={copyPromoCode}>
                <Copy className="size-4" />
                {t('promotion.actions.copy')}
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{t('promotion.codeHint')}</p>
          </div>
        ) : null}

        <Form form={promoForm} className="flex flex-col">
          <FormError />
          <div className="flex-1 space-y-4">
            <FormField label={t('promotion.fields.name')} error={promoForm.errors.name}>
              <input
                type="text"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
                {...promoForm.register('name')}
              />
            </FormField>
            <FormField label={t('promotion.fields.description')} error={promoForm.errors.description}>
              <textarea
                rows={3}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
                {...promoForm.register('description')}
              />
            </FormField>

            <div className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-3">
              <p className="text-sm font-semibold text-foreground">{t('promotion.grant.title')}</p>
              <p className="text-xs text-muted-foreground">{t('promotion.grant.description')}</p>

              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">
                  {t('promotion.fields.grantTypeLabel')}
                </p>
                <GrantTypeSelector
                  value={promoForm.values.grantType}
                  onChangeAction={(next) => {
                    promoForm.setFieldValue('grantType', next);
                    if (next === 'duration') {
                      promoForm.setFieldValue('grantFixedEndsAt', '');
                      promoForm.clearError('grantFixedEndsAt');
                    } else {
                      promoForm.setFieldValue('grantDurationDays', '');
                      promoForm.clearError('grantDurationDays');
                    }
                  }}
                  disabled={promoForm.isSubmitting}
                  label={t('promotion.fields.grantTypeLabel')}
                  durationLabel={t('promotion.fields.grantType.duration')}
                  durationDescription={t('promotion.fields.grantTypeHint.duration')}
                  untilLabel={t('promotion.fields.grantType.until')}
                  untilDescription={t('promotion.fields.grantTypeHint.until')}
                />
              </div>

              {promoForm.values.grantType === 'duration' ? (
                <FormField
                  label={t('promotion.fields.duration')}
                  required
                  error={promoForm.errors.grantDurationDays}
                >
                  <input
                    type="number"
                    min="1"
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
                    {...promoForm.register('grantDurationDays')}
                    disabled={promoForm.isSubmitting}
                  />
                </FormField>
              ) : (
                <FormField
                  label={t('promotion.fields.fixedEndsAt')}
                  required
                  error={promoForm.errors.grantFixedEndsAt}
                >
                  <DateTimePicker
                    value={promoForm.values.grantFixedEndsAt}
                    onChangeAction={(value) => promoForm.setFieldValue('grantFixedEndsAt', value)}
                    locale={locale}
                    clearLabel={tCommon('clear')}
                    disabled={promoForm.isSubmitting}
                  />
                </FormField>
              )}
            </div>

            <div className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-3">
              <p className="text-sm font-semibold text-foreground">{t('promotion.validity.title')}</p>
              <p className="text-xs text-muted-foreground">{t('promotion.validity.description')}</p>
              <div className="grid gap-4 md:grid-cols-2">
                <FormField label={t('promotion.fields.validFrom')} error={promoForm.errors.validFrom}>
                  <DateTimePicker
                    value={promoForm.values.validFrom}
                    onChangeAction={(value) => promoForm.setFieldValue('validFrom', value)}
                    locale={locale}
                    clearLabel={tCommon('clear')}
                    disabled={promoForm.isSubmitting}
                  />
                </FormField>
                <FormField label={t('promotion.fields.validTo')} error={promoForm.errors.validTo}>
                  <DateTimePicker
                    value={promoForm.values.validTo}
                    onChangeAction={(value) => promoForm.setFieldValue('validTo', value)}
                    locale={locale}
                    clearLabel={tCommon('clear')}
                    disabled={promoForm.isSubmitting}
                  />
                </FormField>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <FormField label={t('promotion.fields.maxRedemptions')} error={promoForm.errors.maxRedemptions}>
                <input
                  type="number"
                  min="1"
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
                  {...promoForm.register('maxRedemptions')}
                  disabled={promoForm.isSubmitting}
                />
              </FormField>
              <p className="text-xs text-muted-foreground md:col-span-2">
                {t('promotion.fields.manageHint')}
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 border-t border-border/70 pt-4 sm:flex-row sm:justify-end">
            <Button type="submit" className="w-full sm:w-auto" disabled={promoForm.isSubmitting}>
              {promoForm.isSubmitting ? <Spinner className="mr-2 h-4 w-4" /> : null}
              {t('promotion.actions.create')}
            </Button>
          </div>
        </Form>
      </section>

      <section className="space-y-5 rounded-lg border bg-card p-5 shadow-sm">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('promotion.list.sectionLabel')}
          </p>
          <h2 className="text-lg font-semibold">{t('promotion.list.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('promotion.list.description')}</p>
        </div>

        <PromotionsListTable
          promotions={promotions}
          query={initialQuery}
          paginationMeta={paginationMeta}
          isLoading={isTableLoading}
          onLoadingChangeAction={setIsTableLoading}
        />
      </section>
    </div>
  );
}
