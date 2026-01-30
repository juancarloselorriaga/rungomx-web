'use client';

import { createPendingGrantAction, disablePendingGrantAction } from '@/app/actions/billing-admin';
import { Button } from '@/components/ui/button';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { FormField } from '@/components/ui/form-field';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Form, FormError, useForm } from '@/lib/forms';
import { cn } from '@/lib/utils';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

type PendingGrantFormValues = {
  email: string;
  grantDurationDays: string;
  grantFixedEndsAt: string;
  claimValidFrom: string;
  claimValidTo: string;
  isActive: boolean;
};

type PendingGrantDisableFormValues = {
  pendingGrantId: string;
};

function toOptionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function ProAccessEmailGrantsClient() {
  const tPage = useTranslations('pages.adminProAccess.page.emailGrants');
  const t = useTranslations('pages.adminProAccess.billing');
  const tCommon = useTranslations('common');
  const locale = useLocale();

  const [latestPendingGrantId, setLatestPendingGrantId] = useState<string | null>(null);

  const pendingGrantForm = useForm<PendingGrantFormValues, { pendingGrantId: string }>({
    defaultValues: {
      email: '',
      grantDurationDays: '',
      grantFixedEndsAt: '',
      claimValidFrom: '',
      claimValidTo: '',
      isActive: true,
    },
    onSubmit: async (values) => {
      const payload = {
        email: values.email.trim(),
        grantDurationDays: toOptionalNumber(values.grantDurationDays),
        grantFixedEndsAt: values.grantFixedEndsAt ? values.grantFixedEndsAt : null,
        claimValidFrom: values.claimValidFrom ? values.claimValidFrom : null,
        claimValidTo: values.claimValidTo ? values.claimValidTo : null,
        isActive: values.isActive,
      };

      const result = await createPendingGrantAction(payload);
      if (!result.ok) {
        const message =
          result.error === 'UNAUTHENTICATED'
            ? t('pendingGrant.errors.unauthenticated')
            : result.error === 'FORBIDDEN'
              ? t('pendingGrant.errors.forbidden')
              : result.error === 'INVALID_INPUT'
                ? t('pendingGrant.errors.invalidInput')
                : t('pendingGrant.errors.generic');
        return { ok: false, error: result.error, message };
      }
      return result;
    },
    onSuccess: (data) => {
      setLatestPendingGrantId(data.pendingGrantId);
      toast.success(t('pendingGrant.success.created'));
      pendingGrantForm.reset();
      pendingGrantForm.setFieldValue('isActive', true);
    },
  });

  const disablePendingForm = useForm<PendingGrantDisableFormValues, { pendingGrantId: string }>({
    defaultValues: { pendingGrantId: '' },
    onSubmit: async (values) => {
      const result = await disablePendingGrantAction({ pendingGrantId: values.pendingGrantId.trim() });
      if (!result.ok) {
        const message =
          result.error === 'UNAUTHENTICATED'
            ? t('pendingGrant.errors.unauthenticated')
            : result.error === 'FORBIDDEN'
              ? t('pendingGrant.errors.forbidden')
              : result.error === 'INVALID_INPUT'
                ? t('pendingGrant.errors.invalidInput')
                : t('pendingGrant.errors.generic');
        return { ok: false, error: result.error, message };
      }
      return result;
    },
    onSuccess: () => {
      toast.success(t('pendingGrant.success.disabled'));
      disablePendingForm.reset();
    },
  });

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
            {t('pendingGrant.sectionLabel')}
          </p>
          <h2 className="text-lg font-semibold">{t('pendingGrant.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('pendingGrant.description')}</p>
        </div>

        {latestPendingGrantId ? (
          <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {t('pendingGrant.latestLabel')}
            </p>
            <p className="font-medium text-foreground">{latestPendingGrantId}</p>
          </div>
        ) : null}

        <div className="grid gap-6 border-t border-border/70 pt-4 lg:grid-cols-[2fr,1fr]">
          <Form form={pendingGrantForm} className="space-y-4">
            <FormError />
            <FormField label={t('pendingGrant.fields.email')} required error={pendingGrantForm.errors.email}>
              <input
                type="email"
                className={cn(
                  'h-10 w-full rounded-md border bg-background px-3 text-sm shadow-sm outline-none ring-0 transition',
                  'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30',
                  pendingGrantForm.errors.email && 'border-destructive focus-visible:border-destructive',
                )}
                {...pendingGrantForm.register('email')}
              />
            </FormField>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField label={t('pendingGrant.fields.duration')} error={pendingGrantForm.errors.grantDurationDays}>
                <input
                  type="number"
                  min="1"
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
                  {...pendingGrantForm.register('grantDurationDays')}
                />
              </FormField>
              <FormField label={t('pendingGrant.fields.fixedEndsAt')} error={pendingGrantForm.errors.grantFixedEndsAt}>
                <DateTimePicker
                  value={pendingGrantForm.values.grantFixedEndsAt}
                  onChangeAction={(value) => pendingGrantForm.setFieldValue('grantFixedEndsAt', value)}
                  locale={locale}
                  clearLabel={tCommon('clear')}
                />
              </FormField>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField label={t('pendingGrant.fields.claimValidFrom')} error={pendingGrantForm.errors.claimValidFrom}>
                <DateTimePicker
                  value={pendingGrantForm.values.claimValidFrom}
                  onChangeAction={(value) => pendingGrantForm.setFieldValue('claimValidFrom', value)}
                  locale={locale}
                  clearLabel={tCommon('clear')}
                />
              </FormField>
              <FormField label={t('pendingGrant.fields.claimValidTo')} error={pendingGrantForm.errors.claimValidTo}>
                <DateTimePicker
                  value={pendingGrantForm.values.claimValidTo}
                  onChangeAction={(value) => pendingGrantForm.setFieldValue('claimValidTo', value)}
                  locale={locale}
                  clearLabel={tCommon('clear')}
                />
              </FormField>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
              <div>
                <p className="text-sm font-medium">{t('pendingGrant.fields.isActive')}</p>
                <p className="text-xs text-muted-foreground">{t('pendingGrant.fields.isActiveHint')}</p>
              </div>
              <Switch
                checked={pendingGrantForm.values.isActive}
                onCheckedChange={(value) => pendingGrantForm.setFieldValue('isActive', value)}
              />
            </div>
            <Button type="submit" disabled={pendingGrantForm.isSubmitting}>
              {pendingGrantForm.isSubmitting ? <Spinner className="mr-2 h-4 w-4" /> : null}
              {t('pendingGrant.actions.create')}
            </Button>
          </Form>

          <Form form={disablePendingForm} className="space-y-4">
            <FormError />
            <p className="text-sm font-semibold text-foreground">{t('pendingGrant.disable.title')}</p>
            <FormField
              label={t('pendingGrant.disable.fields.pendingGrantId')}
              required
              error={disablePendingForm.errors.pendingGrantId}
            >
              <input
                type="text"
                className={cn(
                  'h-10 w-full rounded-md border bg-background px-3 text-sm shadow-sm outline-none ring-0 transition',
                  'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30',
                  disablePendingForm.errors.pendingGrantId && 'border-destructive focus-visible:border-destructive',
                )}
                {...disablePendingForm.register('pendingGrantId')}
              />
            </FormField>
            <Button type="submit" variant="outline" disabled={disablePendingForm.isSubmitting}>
              {disablePendingForm.isSubmitting ? <Spinner className="mr-2 h-4 w-4" /> : null}
              {t('pendingGrant.disable.action')}
            </Button>
          </Form>
        </div>
      </section>
    </div>
  );
}

