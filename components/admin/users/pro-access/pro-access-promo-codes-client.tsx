'use client';

import {
  createPromotionAction,
  disablePromotionAction,
  enablePromotionAction,
  searchPromotionOptionsAction,
} from '@/app/actions/billing-admin';
import { GrantTypeSelector } from '@/components/admin/users/pro-access/grant-type-selector';
import { Badge } from '@/components/common/badge';
import { Button } from '@/components/ui/button';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { FormField } from '@/components/ui/form-field';
import { SearchablePicker } from '@/components/ui/searchable-picker';
import { Spinner } from '@/components/ui/spinner';
import { Form, FormError, useForm } from '@/lib/forms';
import { Copy } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
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

type PromotionManageFormValues = {
  promotionId: string;
};

type PromotionSearchOption = {
  id: string;
  name: string | null;
  description: string | null;
  codePrefix: string | null;
  isActive: boolean;
  redemptionCount: number;
  createdAt: string;
};

function toOptionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

const DEFAULT_GRANT_DURATION_DAYS = '7';

export function ProAccessPromoCodesClient() {
  const tPage = useTranslations('pages.adminProAccess.page.promoCodes');
  const t = useTranslations('pages.adminProAccess.billing');
  const tCommon = useTranslations('common');
  const format = useFormatter();
  const locale = useLocale();

  const [latestPromoCode, setLatestPromoCode] = useState<string | null>(null);
  const [selectedPromotion, setSelectedPromotion] = useState<PromotionSearchOption | null>(null);

  const promoForm = useForm<PromotionFormValues, { code: string }>({
    defaultValues: {
      name: '',
      description: '',
      grantType: 'duration',
      grantDurationDays: DEFAULT_GRANT_DURATION_DAYS,
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
    },
  });

  const managePromoForm = useForm<PromotionManageFormValues, { promotionId: string }>({
    defaultValues: { promotionId: '' },
    onSubmit: async (values) => {
      const promotionId = values.promotionId.trim();
      const isActive = selectedPromotion?.isActive ?? null;

      if (!promotionId || isActive === null) {
        return {
          ok: false,
          error: 'INVALID_INPUT',
          fieldErrors: { promotionId: [t('promotion.manage.errors.selectPromotion')] },
          message: t('promotion.manage.errors.selectPromotion'),
        };
      }

      const result =
        isActive === true
          ? await disablePromotionAction({ promotionId })
          : await enablePromotionAction({ promotionId });
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
    onSuccess: () => {
      toast.success(
        selectedPromotion?.isActive ? t('promotion.success.disabled') : t('promotion.success.enabled'),
      );
      managePromoForm.reset();
      setSelectedPromotion(null);
    },
  });

  const promotionIdField = managePromoForm.register('promotionId');

  const loadPromotionOptions = useCallback(
    async (query: string) => {
      const result = await searchPromotionOptionsAction({ query });
      if (!result.ok) return [];

      return result.data.options.map((option) => ({
        value: option.id,
        label: option.name ?? option.codePrefix ?? option.id,
        description: [
          option.description,
          option.codePrefix,
          t('promotion.search.summary.redemptions', { count: option.redemptionCount }),
          format.dateTime(new Date(option.createdAt), {
            dateStyle: 'medium',
            timeStyle: 'short',
            timeZone: 'UTC',
          }),
          option.id,
        ]
          .filter(Boolean)
          .join(' · '),
        meta: option.isActive ? (
          <Badge variant="green" size="sm">
            {t('promotion.search.badges.active')}
          </Badge>
        ) : (
          <Badge variant="outline" size="sm">
            {t('promotion.search.badges.inactive')}
          </Badge>
        ),
        data: option,
      }));
    },
    [format, t],
  );

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

        <div className="grid gap-6 border-t border-border/70 pt-4 lg:grid-cols-[2fr,1fr]">
          <Form form={promoForm} className="flex h-full flex-col">
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
                        promoForm.setFieldValue('grantDurationDays', DEFAULT_GRANT_DURATION_DAYS);
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

            <div className="mt-auto flex flex-col gap-3 border-t border-border/70 pt-4 sm:flex-row sm:justify-end">
              <Button type="submit" className="w-full sm:w-auto" disabled={promoForm.isSubmitting}>
                {promoForm.isSubmitting ? <Spinner className="mr-2 h-4 w-4" /> : null}
                {t('promotion.actions.create')}
              </Button>
            </div>
          </Form>

          <Form form={managePromoForm} className="flex h-full flex-col">
            <FormError />
            <p className="text-sm font-semibold text-foreground">{t('promotion.manage.title')}</p>
            <p className="text-xs text-muted-foreground">{t('promotion.manage.description')}</p>
            <FormField
              label={t('promotion.manage.fields.promotionId')}
              required
              error={managePromoForm.errors.promotionId}
            >
              <SearchablePicker
                value={promotionIdField.value}
                onChangeAction={(value) => {
                  setSelectedPromotion(null);
                  promotionIdField.onChange(value);
                }}
                loadOptionsAction={loadPromotionOptions}
                onSelectOptionAction={(option) => {
                  setSelectedPromotion((option.data as PromotionSearchOption | undefined) ?? null);
                }}
                placeholder={t('promotion.manage.fields.promotionIdPlaceholder')}
                emptyLabel={tCommon('searchPicker.noResults')}
                errorLabel={tCommon('searchPicker.loadFailed')}
                loadingLabel={tCommon('loading')}
                disabled={managePromoForm.isSubmitting}
                invalid={Boolean(managePromoForm.errors.promotionId)}
                name={promotionIdField.name as string}
              />
            </FormField>

            {selectedPromotion ? (
              <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-foreground">
                    {selectedPromotion.name ?? selectedPromotion.codePrefix ?? selectedPromotion.id}
                  </p>
                  {selectedPromotion.isActive ? (
                    <Badge variant="green" size="sm">
                      {t('promotion.search.badges.active')}
                    </Badge>
                  ) : (
                    <Badge variant="outline" size="sm">
                      {t('promotion.search.badges.inactive')}
                    </Badge>
                  )}
                </div>
                <p className="mt-1">
                  {t('promotion.search.summary.redemptions', { count: selectedPromotion.redemptionCount })} ·{' '}
                  {format.dateTime(new Date(selectedPromotion.createdAt), {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                    timeZone: 'UTC',
                  })}{' '}
                  UTC
                </p>
              </div>
            ) : null}

            <div className="mt-auto flex flex-col gap-3 border-t border-border/70 pt-4 sm:flex-row sm:justify-end">
              <Button
                type="submit"
                variant={selectedPromotion?.isActive ? 'destructive' : 'default'}
                className="w-full sm:w-auto"
                disabled={managePromoForm.isSubmitting || !selectedPromotion}
              >
                {managePromoForm.isSubmitting ? <Spinner className="mr-2 h-4 w-4" /> : null}
                {selectedPromotion?.isActive ? t('promotion.manage.actions.disable') : t('promotion.manage.actions.enable')}
              </Button>
            </div>
          </Form>
        </div>
      </section>
    </div>
  );
}
