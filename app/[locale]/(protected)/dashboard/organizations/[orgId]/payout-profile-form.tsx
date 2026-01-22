'use client';

import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Form, FormError, useForm } from '@/lib/forms';
import {
  updatePayoutProfile,
  type PayoutProfileData,
} from '@/lib/organizations/payout/actions';
import { AlertCircle, Building2, Info, Loader2, Lock, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

type PayoutProfileFormProps = {
  organizationId: string;
  canEdit: boolean;
  initialProfile: PayoutProfileData | null;
  initialError: string | null;
};

type FormValues = {
  legalName: string;
  rfc: string;
  bankName: string;
  clabe: string;
  accountHolder: string;
};

function toFormValues(profile: PayoutProfileData | null): FormValues {
  return {
    legalName: profile?.legalName ?? '',
    rfc: profile?.rfc ?? '',
    bankName: profile?.payoutDestination?.bankName ?? '',
    clabe: profile?.payoutDestination?.clabe ?? '',
    accountHolder: profile?.payoutDestination?.accountHolder ?? '',
  };
}

export function PayoutProfileForm({
  organizationId,
  canEdit,
  initialProfile,
  initialError,
}: PayoutProfileFormProps) {
  const t = useTranslations('pages.dashboard.organizations.payout');

  const form = useForm<FormValues, PayoutProfileData>({
    defaultValues: toFormValues(initialProfile),
    onSubmit: async (values) => {
      const result = await updatePayoutProfile({
        organizationId,
        legalName: values.legalName.trim() || null,
        rfc: values.rfc.trim() || null,
        payoutDestination:
          values.bankName.trim() || values.clabe.trim() || values.accountHolder.trim()
            ? {
                bankName: values.bankName.trim() || undefined,
                clabe: values.clabe.trim() || undefined,
                accountHolder: values.accountHolder.trim() || undefined,
              }
            : null,
      });

      if (!result.ok) {
        if (result.code === 'VALIDATION_ERROR') {
          const normalized = result.error.toLowerCase();

          if (normalized.includes('rfc')) {
            return {
              ok: false,
              error: 'INVALID_INPUT',
              message: t('errors.invalidRfc'),
              fieldErrors: { rfc: [t('errors.invalidRfc')] },
            };
          }

          if (normalized.includes('clabe')) {
            return {
              ok: false,
              error: 'INVALID_INPUT',
              message: t('errors.invalidClabe'),
              fieldErrors: { clabe: [t('errors.invalidClabe')] },
            };
          }

          return { ok: false, error: 'INVALID_INPUT', message: result.error };
        }

        if (result.code === 'FORBIDDEN') {
          return { ok: false, error: 'FORBIDDEN', message: t('errors.forbidden') };
        }

        return { ok: false, error: 'SERVER_ERROR', message: t('errors.generic') };
      }

      return { ok: true, data: result.data };
    },
    onSuccess: () => {
      toast.success(t('success.toast'));
    },
  });

  if (!canEdit) {
    return (
      <div className="border border-border rounded-lg p-6 bg-card">
        <div className="flex items-center gap-3 mb-4">
          <Wallet className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-xl font-semibold">{t('title')}</h2>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Lock className="h-4 w-4" />
          <p className="text-sm">{t('accessRestriction')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-border rounded-lg p-6 bg-card">
      <div className="flex items-center gap-3 mb-2">
        <Wallet className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-xl font-semibold">{t('title')}</h2>
      </div>
      <p className="text-muted-foreground mb-6">{t('description')}</p>

      {initialError && (
        <div className="mb-6 p-4 bg-destructive/10 text-destructive rounded-lg flex items-start gap-2">
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <p>{initialError}</p>
        </div>
      )}

      <Form form={form} className="space-y-8">
        <FormError />

        {/* Tax Information Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 border-b border-border pb-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-medium">{t('sections.taxInfo')}</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label={t('fields.legalName.label')} error={form.errors.legalName}>
              <input
                type="text"
                value={form.values.legalName}
                onChange={(e) => form.setFieldValue('legalName', e.target.value)}
                placeholder={t('fields.legalName.placeholder')}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                maxLength={255}
                disabled={form.isSubmitting}
              />
              <p className="mt-1 text-xs text-muted-foreground">{t('fields.legalName.hint')}</p>
            </FormField>

            <FormField label={t('fields.rfc.label')} error={form.errors.rfc}>
              <input
                type="text"
                value={form.values.rfc}
                onChange={(e) => form.setFieldValue('rfc', e.target.value.toUpperCase())}
                placeholder={t('fields.rfc.placeholder')}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 font-mono"
                maxLength={13}
                disabled={form.isSubmitting}
              />
              <p className="mt-1 text-xs text-muted-foreground">{t('fields.rfc.hint')}</p>
            </FormField>
          </div>
        </div>

        {/* Bank Account Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 border-b border-border pb-2">
            <Wallet className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-medium">{t('sections.bankInfo')}</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label={t('fields.bankName.label')} error={form.errors.bankName}>
              <input
                type="text"
                value={form.values.bankName}
                onChange={(e) => form.setFieldValue('bankName', e.target.value)}
                placeholder={t('fields.bankName.placeholder')}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                maxLength={100}
                disabled={form.isSubmitting}
              />
            </FormField>

            <FormField label={t('fields.clabe.label')} error={form.errors.clabe}>
              <input
                type="text"
                value={form.values.clabe}
                onChange={(e) =>
                  form.setFieldValue('clabe', e.target.value.replace(/\D/g, '').slice(0, 18))
                }
                placeholder={t('fields.clabe.placeholder')}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 font-mono tracking-wider"
                maxLength={18}
                inputMode="numeric"
                disabled={form.isSubmitting}
              />
              <p className="mt-1 text-xs text-muted-foreground">{t('fields.clabe.hint')}</p>
            </FormField>
          </div>

          <FormField label={t('fields.accountHolder.label')} error={form.errors.accountHolder}>
            <input
              type="text"
              value={form.values.accountHolder}
              onChange={(e) => form.setFieldValue('accountHolder', e.target.value)}
              placeholder={t('fields.accountHolder.placeholder')}
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
              maxLength={255}
              disabled={form.isSubmitting}
            />
          </FormField>
        </div>

        {/* Help Section */}
        <div className="border border-border rounded-lg p-4 bg-muted/30">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium mb-1">{t('help.title')}</h4>
              <p className="text-sm text-muted-foreground">{t('help.description')}</p>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={form.isSubmitting}>
            {form.isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {form.isSubmitting ? t('buttons.saving') : t('buttons.save')}
          </Button>
        </div>
      </Form>
    </div>
  );
}

