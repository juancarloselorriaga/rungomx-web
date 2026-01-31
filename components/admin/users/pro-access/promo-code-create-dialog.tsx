'use client';

import { createPromotionAction } from '@/app/actions/billing-admin';
import { GrantTypeSelector } from '@/components/admin/users/pro-access/grant-type-selector';
import { Button } from '@/components/ui/button';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Spinner } from '@/components/ui/spinner';
import { Form, FormError, useForm } from '@/lib/forms';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
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

type PromoCodeCreateDialogProps = {
  open: boolean;
  onOpenChangeAction: (open: boolean) => void;
  onSuccessAction: (code: string) => void;
};

function toOptionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function PromoCodeCreateDialog({
  open,
  onOpenChangeAction,
  onSuccessAction,
}: PromoCodeCreateDialogProps) {
  const t = useTranslations('pages.adminProAccess.billing');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const [internalOpen, setInternalOpen] = useState(false);
  const resolvedOpen = open ?? internalOpen;

  const form = useForm<PromotionFormValues, { code: string }>({
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
      toast.success(t('promotion.success.created'));
      handleOpenChange(false);
      onSuccessAction(data.code);
    },
  });

  const handleOpenChange = (value: boolean) => {
    setInternalOpen(value);
    onOpenChangeAction(value);
    if (!value) {
      form.reset();
      form.setFieldValue('grantType', 'duration');
    }
  };

  return (
    <Dialog open={resolvedOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[calc(100%-1rem)] sm:max-w-2xl p-4 sm:p-6" onOpenAutoFocus={(event) => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{t('promotion.title')}</DialogTitle>
          <DialogDescription>{t('promotion.description')}</DialogDescription>
        </DialogHeader>

        <Form form={form} className="space-y-4">
          <FormError />

          <FormField label={t('promotion.fields.name')} error={form.errors.name}>
            <input
              type="text"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
              {...form.register('name')}
              disabled={form.isSubmitting}
            />
          </FormField>

          <FormField label={t('promotion.fields.description')} error={form.errors.description}>
            <textarea
              rows={3}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
              {...form.register('description')}
              disabled={form.isSubmitting}
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
                value={form.values.grantType}
                onChangeAction={(next) => {
                  form.setFieldValue('grantType', next);
                  if (next === 'duration') {
                    form.setFieldValue('grantFixedEndsAt', '');
                    form.clearError('grantFixedEndsAt');
                  } else {
                    form.setFieldValue('grantDurationDays', '');
                    form.clearError('grantDurationDays');
                  }
                }}
                disabled={form.isSubmitting}
                label={t('promotion.fields.grantTypeLabel')}
                durationLabel={t('promotion.fields.grantType.duration')}
                durationDescription={t('promotion.fields.grantTypeHint.duration')}
                untilLabel={t('promotion.fields.grantType.until')}
                untilDescription={t('promotion.fields.grantTypeHint.until')}
              />
            </div>

            {form.values.grantType === 'duration' ? (
              <FormField
                label={t('promotion.fields.duration')}
                required
                error={form.errors.grantDurationDays}
              >
                <input
                  type="number"
                  min="1"
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
                  {...form.register('grantDurationDays')}
                  disabled={form.isSubmitting}
                />
              </FormField>
            ) : (
              <FormField
                label={t('promotion.fields.fixedEndsAt')}
                required
                error={form.errors.grantFixedEndsAt}
              >
                <DateTimePicker
                  value={form.values.grantFixedEndsAt}
                  onChangeAction={(value) => form.setFieldValue('grantFixedEndsAt', value)}
                  locale={locale}
                  clearLabel={tCommon('clear')}
                  disabled={form.isSubmitting}
                />
              </FormField>
            )}
          </div>

          <div className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-3">
            <p className="text-sm font-semibold text-foreground">
              {t('promotion.validity.title')}
            </p>
            <p className="text-xs text-muted-foreground">{t('promotion.validity.description')}</p>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField label={t('promotion.fields.validFrom')} error={form.errors.validFrom}>
                <DateTimePicker
                  value={form.values.validFrom}
                  onChangeAction={(value) => form.setFieldValue('validFrom', value)}
                  locale={locale}
                  clearLabel={tCommon('clear')}
                  disabled={form.isSubmitting}
                />
              </FormField>
              <FormField label={t('promotion.fields.validTo')} error={form.errors.validTo}>
                <DateTimePicker
                  value={form.values.validTo}
                  onChangeAction={(value) => form.setFieldValue('validTo', value)}
                  locale={locale}
                  clearLabel={tCommon('clear')}
                  disabled={form.isSubmitting}
                />
              </FormField>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              label={t('promotion.fields.maxRedemptions')}
              error={form.errors.maxRedemptions}
            >
              <input
                type="number"
                min="1"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
                {...form.register('maxRedemptions')}
                disabled={form.isSubmitting}
              />
            </FormField>
            <p className="text-xs text-muted-foreground md:col-span-2">
              {t('promotion.fields.manageHint')}
            </p>
          </div>

          <DialogFooter className="flex justify-end gap-2 sm:justify-end">
            <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
              {tCommon('cancel')}
            </Button>
            <Button
              type="submit"
              disabled={form.isSubmitting}
              isLoading={form.isSubmitting}
              loadingPlacement="replace"
              className="justify-center min-w-[120px]"
            >
              {t('promotion.actions.create')}
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
