'use client';

import { useEffect, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { AlertCircle, Building2, Info, Loader2, Lock, Wallet } from 'lucide-react';

import {
  getPayoutProfile,
  updatePayoutProfile,
} from '@/lib/organizations/payout/actions';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';

type PayoutProfileFormProps = {
  organizationId: string;
  canEdit: boolean;
};

type FormData = {
  legalName: string;
  rfc: string;
  bankName: string;
  clabe: string;
  accountHolder: string;
};

const defaultFormData: FormData = {
  legalName: '',
  rfc: '',
  bankName: '',
  clabe: '',
  accountHolder: '',
};

export function PayoutProfileForm({ organizationId, canEdit }: PayoutProfileFormProps) {
  const t = useTranslations('pages.dashboard.organizations.payout');
  const [formData, setFormData] = useState<FormData>(defaultFormData);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    async function loadProfile() {
      setIsLoading(true);
      setError(null);

      const result = await getPayoutProfile({ organizationId });

      if (!result.ok) {
        if (result.code === 'FORBIDDEN') {
          // User doesn't have permission - this is expected for non-admin users
          setError(t('accessRestriction'));
        } else {
          setError(result.error);
        }
        setIsLoading(false);
        return;
      }

      if (result.data) {
        setFormData({
          legalName: result.data.legalName || '',
          rfc: result.data.rfc || '',
          bankName: result.data.payoutDestination?.bankName || '',
          clabe: result.data.payoutDestination?.clabe || '',
          accountHolder: result.data.payoutDestination?.accountHolder || '',
        });
      }

      setIsLoading(false);
    }

    loadProfile();
  }, [organizationId, t]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const result = await updatePayoutProfile({
        organizationId,
        legalName: formData.legalName || null,
        rfc: formData.rfc || null,
        payoutDestination:
          formData.bankName || formData.clabe || formData.accountHolder
            ? {
                bankName: formData.bankName || undefined,
                clabe: formData.clabe || undefined,
                accountHolder: formData.accountHolder || undefined,
              }
            : null,
      });

      if (!result.ok) {
        if (result.code === 'VALIDATION_ERROR') {
          if (result.error.toLowerCase().includes('rfc')) {
            setError(t('errors.invalidRfc'));
          } else if (result.error.toLowerCase().includes('clabe')) {
            setError(t('errors.invalidClabe'));
          } else {
            setError(result.error);
          }
        } else if (result.code === 'FORBIDDEN') {
          setError(t('errors.forbidden'));
        } else {
          setError(t('errors.generic'));
        }
        return;
      }

      setSuccess(t('success.toast'));
      setTimeout(() => setSuccess(null), 3000);
    });
  };

  if (isLoading) {
    return (
      <div className="border border-border rounded-lg p-6 bg-card">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (error && !canEdit) {
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

      {error && (
        <div className="mb-6 p-4 bg-destructive/10 text-destructive rounded-lg flex items-start gap-2">
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-6 p-4 bg-green-500/10 text-green-600 dark:text-green-400 rounded-lg">
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Tax Information Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 border-b border-border pb-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-medium">{t('sections.taxInfo')}</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label={t('fields.legalName.label')}>
              <input
                type="text"
                value={formData.legalName}
                onChange={(e) =>
                  setFormData({ ...formData, legalName: e.target.value })
                }
                placeholder={t('fields.legalName.placeholder')}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                maxLength={255}
                disabled={!canEdit || isPending}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {t('fields.legalName.hint')}
              </p>
            </FormField>

            <FormField label={t('fields.rfc.label')}>
              <input
                type="text"
                value={formData.rfc}
                onChange={(e) =>
                  setFormData({ ...formData, rfc: e.target.value.toUpperCase() })
                }
                placeholder={t('fields.rfc.placeholder')}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 font-mono"
                maxLength={13}
                disabled={!canEdit || isPending}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {t('fields.rfc.hint')}
              </p>
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
            <FormField label={t('fields.bankName.label')}>
              <input
                type="text"
                value={formData.bankName}
                onChange={(e) =>
                  setFormData({ ...formData, bankName: e.target.value })
                }
                placeholder={t('fields.bankName.placeholder')}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                maxLength={100}
                disabled={!canEdit || isPending}
              />
            </FormField>

            <FormField label={t('fields.clabe.label')}>
              <input
                type="text"
                value={formData.clabe}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    clabe: e.target.value.replace(/\D/g, '').slice(0, 18),
                  })
                }
                placeholder={t('fields.clabe.placeholder')}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 font-mono tracking-wider"
                maxLength={18}
                inputMode="numeric"
                disabled={!canEdit || isPending}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {t('fields.clabe.hint')}
              </p>
            </FormField>
          </div>

          <FormField label={t('fields.accountHolder.label')}>
            <input
              type="text"
              value={formData.accountHolder}
              onChange={(e) =>
                setFormData({ ...formData, accountHolder: e.target.value })
              }
              placeholder={t('fields.accountHolder.placeholder')}
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
              maxLength={255}
              disabled={!canEdit || isPending}
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

        {canEdit && (
          <div className="flex justify-end">
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isPending ? t('buttons.saving') : t('buttons.save')}
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}
