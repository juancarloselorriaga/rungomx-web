'use client';

import {
  createPendingGrantAction,
  searchUserEmailOptionsAction,
} from '@/app/actions/billing-admin';
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
import { SearchablePicker } from '@/components/ui/searchable-picker';
import { Form, FormError, useForm } from '@/lib/forms';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

type PendingGrantFormValues = {
  email: string;
  grantType: 'duration' | 'until';
  grantDurationDays: string;
  grantFixedEndsAt: string;
  claimValidFrom: string;
  claimValidTo: string;
};

type EmailGrantCreateDialogProps = {
  open: boolean;
  onOpenChangeAction: (open: boolean) => void;
  onSuccessAction: (pendingGrantId: string) => void;
};

function toOptionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function EmailGrantCreateDialog({
  open,
  onOpenChangeAction,
  onSuccessAction,
}: EmailGrantCreateDialogProps) {
  const t = useTranslations('pages.adminProAccess.billing');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const [internalOpen, setInternalOpen] = useState(false);
  const resolvedOpen = open ?? internalOpen;

  const form = useForm<PendingGrantFormValues, { pendingGrantId: string }>({
    defaultValues: {
      email: '',
      grantType: 'duration',
      grantDurationDays: '',
      grantFixedEndsAt: '',
      claimValidFrom: '',
      claimValidTo: '',
    },
    onSubmit: async (values) => {
      const payload = {
        email: values.email.trim(),
        grantDurationDays:
          values.grantType === 'duration' ? toOptionalNumber(values.grantDurationDays) : null,
        grantFixedEndsAt:
          values.grantType === 'until' && values.grantFixedEndsAt ? values.grantFixedEndsAt : null,
        claimValidFrom: values.claimValidFrom ? values.claimValidFrom : null,
        claimValidTo: values.claimValidTo ? values.claimValidTo : null,
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
      toast.success(t('pendingGrant.success.created'));
      handleOpenChange(false);
      onSuccessAction(data.pendingGrantId);
    },
  });

  const emailField = form.register('email');

  const loadUserEmailOptions = useCallback(async (query: string) => {
    const result = await searchUserEmailOptionsAction({ query });
    if (!result.ok) return [];

    return result.data.options.map((option) => ({
      value: option.email,
      label: option.email,
      description: option.name,
    }));
  }, []);

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
          <DialogTitle>{t('pendingGrant.title')}</DialogTitle>
          <DialogDescription>{t('pendingGrant.description')}</DialogDescription>
        </DialogHeader>

        <Form form={form} className="space-y-4">
          <FormError />

          <FormField
            label={t('pendingGrant.fields.email')}
            required
            error={form.errors.email}
          >
            <SearchablePicker
              value={emailField.value}
              onChangeAction={emailField.onChange}
              loadOptionsAction={loadUserEmailOptions}
              inputType="email"
              placeholder={t('pendingGrant.fields.emailPlaceholder')}
              emptyLabel={tCommon('searchPicker.noResults')}
              errorLabel={tCommon('searchPicker.loadFailed')}
              disabled={form.isSubmitting}
              invalid={Boolean(form.errors.email)}
              name={emailField.name as string}
              loadingLabel={tCommon('loading')}
            />
          </FormField>

          <div className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-3">
            <p className="text-sm font-semibold text-foreground">
              {t('pendingGrant.grant.title')}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('pendingGrant.grant.description')}
            </p>

            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                {t('pendingGrant.fields.grantTypeLabel')}
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
                label={t('pendingGrant.fields.grantTypeLabel')}
                durationLabel={t('pendingGrant.fields.grantType.duration')}
                durationDescription={t('pendingGrant.fields.grantTypeHint.duration')}
                untilLabel={t('pendingGrant.fields.grantType.until')}
                untilDescription={t('pendingGrant.fields.grantTypeHint.until')}
              />
            </div>

            {form.values.grantType === 'duration' ? (
              <FormField
                label={t('pendingGrant.fields.duration')}
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
                label={t('pendingGrant.fields.fixedEndsAt')}
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
              {t('pendingGrant.claim.title')}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('pendingGrant.claim.description')}
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                label={t('pendingGrant.fields.claimValidFrom')}
                error={form.errors.claimValidFrom}
              >
                <DateTimePicker
                  value={form.values.claimValidFrom}
                  onChangeAction={(value) => form.setFieldValue('claimValidFrom', value)}
                  locale={locale}
                  clearLabel={tCommon('clear')}
                  disabled={form.isSubmitting}
                />
              </FormField>
              <FormField
                label={t('pendingGrant.fields.claimValidTo')}
                error={form.errors.claimValidTo}
              >
                <DateTimePicker
                  value={form.values.claimValidTo}
                  onChangeAction={(value) => form.setFieldValue('claimValidTo', value)}
                  locale={locale}
                  clearLabel={tCommon('clear')}
                  disabled={form.isSubmitting}
                />
              </FormField>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">{t('pendingGrant.fields.manageHint')}</p>

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
              {t('pendingGrant.actions.create')}
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
