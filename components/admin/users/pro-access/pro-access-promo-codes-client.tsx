'use client';

import { createPromotionAction, disablePromotionAction } from '@/app/actions/billing-admin';
import { Button } from '@/components/ui/button';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { FormField } from '@/components/ui/form-field';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Form, FormError, useForm } from '@/lib/forms';
import { Copy } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

type PromotionFormValues = {
  name: string;
  description: string;
  grantDurationDays: string;
  grantFixedEndsAt: string;
  validFrom: string;
  validTo: string;
  maxRedemptions: string;
  isActive: boolean;
};

type PromotionDisableFormValues = {
  promotionId: string;
};

function toOptionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function ProAccessPromoCodesClient() {
  const tPage = useTranslations('pages.adminProAccess.page.promoCodes');
  const t = useTranslations('pages.adminProAccess.billing');
  const tCommon = useTranslations('common');
  const locale = useLocale();

  const [latestPromoCode, setLatestPromoCode] = useState<string | null>(null);

  const promoForm = useForm<PromotionFormValues, { code: string }>({
    defaultValues: {
      name: '',
      description: '',
      grantDurationDays: '',
      grantFixedEndsAt: '',
      validFrom: '',
      validTo: '',
      maxRedemptions: '',
      isActive: true,
    },
    onSubmit: async (values) => {
      const payload = {
        name: values.name.trim() || null,
        description: values.description.trim() || null,
        grantDurationDays: toOptionalNumber(values.grantDurationDays),
        grantFixedEndsAt: values.grantFixedEndsAt ? values.grantFixedEndsAt : null,
        validFrom: values.validFrom ? values.validFrom : null,
        validTo: values.validTo ? values.validTo : null,
        maxRedemptions: toOptionalNumber(values.maxRedemptions),
        isActive: values.isActive,
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
        return { ok: false, error: result.error, message };
      }
      return result;
    },
    onSuccess: (data) => {
      setLatestPromoCode(data.code);
      toast.success(t('promotion.success.created'));
      promoForm.reset();
      promoForm.setFieldValue('isActive', true);
    },
  });

  const disablePromoForm = useForm<PromotionDisableFormValues, { promotionId: string }>({
    defaultValues: { promotionId: '' },
    onSubmit: async (values) => {
      const result = await disablePromotionAction({ promotionId: values.promotionId.trim() });
      if (!result.ok) {
        const message =
          result.error === 'UNAUTHENTICATED'
            ? t('promotion.errors.unauthenticated')
            : result.error === 'FORBIDDEN'
              ? t('promotion.errors.forbidden')
              : result.error === 'INVALID_INPUT'
                ? t('promotion.errors.invalidInput')
                : t('promotion.errors.generic');
        return { ok: false, error: result.error, message };
      }
      return result;
    },
    onSuccess: () => {
      toast.success(t('promotion.success.disabled'));
      disablePromoForm.reset();
    },
  });

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
          <Form form={promoForm} className="space-y-4">
            <FormError />
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
            <div className="grid gap-4 md:grid-cols-2">
              <FormField label={t('promotion.fields.duration')} error={promoForm.errors.grantDurationDays}>
                <input
                  type="number"
                  min="1"
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
                  {...promoForm.register('grantDurationDays')}
                />
              </FormField>
              <FormField label={t('promotion.fields.fixedEndsAt')} error={promoForm.errors.grantFixedEndsAt}>
                <DateTimePicker
                  value={promoForm.values.grantFixedEndsAt}
                  onChangeAction={(value) => promoForm.setFieldValue('grantFixedEndsAt', value)}
                  locale={locale}
                  clearLabel={tCommon('clear')}
                />
              </FormField>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField label={t('promotion.fields.validFrom')} error={promoForm.errors.validFrom}>
                <DateTimePicker
                  value={promoForm.values.validFrom}
                  onChangeAction={(value) => promoForm.setFieldValue('validFrom', value)}
                  locale={locale}
                  clearLabel={tCommon('clear')}
                />
              </FormField>
              <FormField label={t('promotion.fields.validTo')} error={promoForm.errors.validTo}>
                <DateTimePicker
                  value={promoForm.values.validTo}
                  onChangeAction={(value) => promoForm.setFieldValue('validTo', value)}
                  locale={locale}
                  clearLabel={tCommon('clear')}
                />
              </FormField>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField label={t('promotion.fields.maxRedemptions')} error={promoForm.errors.maxRedemptions}>
                <input
                  type="number"
                  min="1"
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
                  {...promoForm.register('maxRedemptions')}
                />
              </FormField>
              <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
                <div>
                  <p className="text-sm font-medium">{t('promotion.fields.isActive')}</p>
                  <p className="text-xs text-muted-foreground">{t('promotion.fields.isActiveHint')}</p>
                </div>
                <Switch
                  checked={promoForm.values.isActive}
                  onCheckedChange={(value) => promoForm.setFieldValue('isActive', value)}
                />
              </div>
            </div>
            <Button type="submit" disabled={promoForm.isSubmitting}>
              {promoForm.isSubmitting ? <Spinner className="mr-2 h-4 w-4" /> : null}
              {t('promotion.actions.create')}
            </Button>
          </Form>

          <Form form={disablePromoForm} className="space-y-4">
            <FormError />
            <p className="text-sm font-semibold text-foreground">{t('promotion.disable.title')}</p>
            <FormField
              label={t('promotion.disable.fields.promotionId')}
              required
              error={disablePromoForm.errors.promotionId}
            >
              <input
                type="text"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
                {...disablePromoForm.register('promotionId')}
              />
            </FormField>
            <Button type="submit" variant="outline" disabled={disablePromoForm.isSubmitting}>
              {disablePromoForm.isSubmitting ? <Spinner className="mr-2 h-4 w-4" /> : null}
              {t('promotion.disable.action')}
            </Button>
          </Form>
        </div>
      </section>
    </div>
  );
}

