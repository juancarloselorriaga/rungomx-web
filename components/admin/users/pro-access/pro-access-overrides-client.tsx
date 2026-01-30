'use client';

import {
  extendOverrideAction,
  grantOverrideAction,
  lookupBillingUserAction,
  revokeOverrideAction,
} from '@/app/actions/billing-admin';
import { Badge } from '@/components/common/badge';
import { Button } from '@/components/ui/button';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { FormField } from '@/components/ui/form-field';
import { Spinner } from '@/components/ui/spinner';
import { Form, FormError, useForm } from '@/lib/forms';
import type { SerializableBillingStatus } from '@/lib/billing/serialization';
import { cn } from '@/lib/utils';
import { Search, ShieldCheck } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

type BillingUserSummary = {
  user: {
    id: string;
    name: string | null;
    email: string;
    emailVerified: boolean;
    createdAt: string;
    isInternal: boolean;
  };
  status: SerializableBillingStatus;
  events: unknown[];
};

type LookupFormValues = {
  email: string;
};

type OverrideFormValues = {
  userId: string;
  reason: string;
  grantDurationDays: string;
  grantFixedEndsAt: string;
};

type RevokeOverrideFormValues = {
  overrideId: string;
};

function toOptionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function ProAccessOverridesClient() {
  const tPage = useTranslations('pages.adminProAccess.page.overrides');
  const t = useTranslations('pages.adminProAccess.billing');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const searchParams = useSearchParams();

  const initialEmail = useMemo(() => (searchParams?.get('email') ?? '').trim(), [searchParams]);

  const [lookupResult, setLookupResult] = useState<BillingUserSummary | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [latestOverrideId, setLatestOverrideId] = useState<string | null>(null);

  const lookupForm = useForm<LookupFormValues, BillingUserSummary>({
    defaultValues: { email: initialEmail },
    onSubmit: async (values) => {
      const result = await lookupBillingUserAction({ email: values.email.trim() });

      if (!result.ok) {
        const message =
          result.error === 'UNAUTHENTICATED'
            ? t('lookup.errors.unauthenticated')
            : result.error === 'FORBIDDEN'
              ? t('lookup.errors.forbidden')
              : result.error === 'NOT_FOUND'
                ? t('lookup.errors.notFound')
                : result.error === 'INVALID_INPUT'
                  ? t('lookup.errors.invalidInput')
                  : t('lookup.errors.generic');

        return {
          ok: false,
          error: result.error,
          fieldErrors: { email: [message] },
          message,
        };
      }

      return result;
    },
    onSuccess: (data) => {
      setLookupResult(data);
      setSelectedUserId(data.user.id);
      toast.success(t('lookup.success'));
    },
  });

  const grantForm = useForm<OverrideFormValues, { overrideId?: string }>({
    defaultValues: {
      userId: '',
      reason: '',
      grantDurationDays: '',
      grantFixedEndsAt: '',
    },
    onSubmit: async (values) => {
      const payload = {
        userId: values.userId.trim(),
        reason: values.reason.trim(),
        grantDurationDays: toOptionalNumber(values.grantDurationDays),
        grantFixedEndsAt: values.grantFixedEndsAt ? values.grantFixedEndsAt : null,
      };

      const result = await grantOverrideAction(payload);
      if (!result.ok) {
        const message =
          result.error === 'UNAUTHENTICATED'
            ? t('override.errors.unauthenticated')
            : result.error === 'FORBIDDEN'
              ? t('override.errors.forbidden')
              : result.error === 'INVALID_INPUT'
                ? t('override.errors.invalidInput')
                : t('override.errors.generic');
        return { ok: false, error: result.error, message };
      }

      return result;
    },
    onSuccess: (data) => {
      setLatestOverrideId(data.overrideId ?? null);
      toast.success(t('override.success.granted'));
      grantForm.reset();
      if (selectedUserId) {
        grantForm.setFieldValue('userId', selectedUserId);
      }
    },
  });

  const extendForm = useForm<OverrideFormValues, { overrideId?: string }>({
    defaultValues: {
      userId: '',
      reason: '',
      grantDurationDays: '',
      grantFixedEndsAt: '',
    },
    onSubmit: async (values) => {
      const payload = {
        userId: values.userId.trim(),
        reason: values.reason.trim(),
        grantDurationDays: toOptionalNumber(values.grantDurationDays),
        grantFixedEndsAt: values.grantFixedEndsAt ? values.grantFixedEndsAt : null,
      };

      const result = await extendOverrideAction(payload);
      if (!result.ok) {
        const message =
          result.error === 'UNAUTHENTICATED'
            ? t('override.errors.unauthenticated')
            : result.error === 'FORBIDDEN'
              ? t('override.errors.forbidden')
              : result.error === 'INVALID_INPUT'
                ? t('override.errors.invalidInput')
                : t('override.errors.generic');
        return { ok: false, error: result.error, message };
      }

      return result;
    },
    onSuccess: (data) => {
      setLatestOverrideId(data.overrideId ?? null);
      toast.success(t('override.success.extended'));
      extendForm.reset();
      if (selectedUserId) {
        extendForm.setFieldValue('userId', selectedUserId);
      }
    },
  });

  const revokeForm = useForm<RevokeOverrideFormValues, { overrideId: string }>({
    defaultValues: { overrideId: '' },
    onSubmit: async (values) => {
      const result = await revokeOverrideAction({ overrideId: values.overrideId.trim() });
      if (!result.ok) {
        const message =
          result.error === 'UNAUTHENTICATED'
            ? t('override.errors.unauthenticated')
            : result.error === 'FORBIDDEN'
              ? t('override.errors.forbidden')
              : result.error === 'INVALID_INPUT'
                ? t('override.errors.invalidInput')
                : t('override.errors.generic');
        return { ok: false, error: result.error, message };
      }
      return result;
    },
    onSuccess: (data) => {
      setLatestOverrideId(data.overrideId);
      toast.success(t('override.success.revoked'));
      revokeForm.reset();
    },
  });

  const grantUserIdValue = grantForm.values.userId;
  const extendUserIdValue = extendForm.values.userId;
  const setGrantFieldValue = grantForm.setFieldValue;
  const setExtendFieldValue = extendForm.setFieldValue;

  useEffect(() => {
    if (!selectedUserId) return;
    if (!grantUserIdValue) {
      setGrantFieldValue('userId', selectedUserId);
    }
    if (!extendUserIdValue) {
      setExtendFieldValue('userId', selectedUserId);
    }
  }, [selectedUserId, grantUserIdValue, extendUserIdValue, setGrantFieldValue, setExtendFieldValue]);

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
            {t('lookup.sectionLabel')}
          </p>
          <h2 className="text-lg font-semibold">{t('lookup.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('lookup.description')}</p>
        </div>

        <Form form={lookupForm} className="space-y-4 border-t border-border/70 pt-4">
          <FormError />
          <FormField label={t('lookup.fields.email')} required error={lookupForm.errors.email}>
            <input
              type="email"
              autoComplete="off"
              className={cn(
                'h-11 w-full rounded-lg border bg-background px-3 text-sm shadow-sm outline-none ring-0 transition',
                'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30',
                lookupForm.errors.email && 'border-destructive focus-visible:border-destructive',
              )}
              {...lookupForm.register('email')}
              disabled={lookupForm.isSubmitting}
            />
          </FormField>
          <div className="flex items-center justify-end gap-3 border-t border-border/70 pt-4">
            <Button type="submit" disabled={lookupForm.isSubmitting}>
              {lookupForm.isSubmitting ? <Spinner className="mr-2 h-4 w-4" /> : <Search className="size-4" />}
              {t('lookup.actions.search')}
            </Button>
          </div>
        </Form>

        {lookupResult ? (
          <div className="border-t border-border/70 pt-4">
            <div className="rounded-lg border bg-muted/20 p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={lookupResult.status.isPro ? 'green' : 'default'}>
                  {lookupResult.status.isPro ? t('status.badges.pro') : t('status.badges.free')}
                </Badge>
                {lookupResult.user.isInternal ? (
                  <Badge variant="outline">{t('status.badges.internal')}</Badge>
                ) : null}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{t('lookup.labels.user')}</span>{' '}
                {lookupResult.user.name ?? t('lookup.values.unknown')} · {lookupResult.user.email}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{t('lookup.labels.userId')}</span>{' '}
                {lookupResult.user.id}
              </p>
            </div>
          </div>
        ) : null}
      </section>

      <section className="space-y-5 rounded-lg border bg-card p-5 shadow-sm">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('override.sectionLabel')}
          </p>
          <h2 className="text-lg font-semibold">{t('override.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('override.description')}</p>
        </div>

        {latestOverrideId ? (
          <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {t('override.latestLabel')}
            </p>
            <p className="font-medium text-foreground">{latestOverrideId}</p>
          </div>
        ) : null}

        <div className="grid gap-6 border-t border-border/70 pt-4 lg:grid-cols-3">
          <Form form={grantForm} className="space-y-4">
            <FormError />
            <p className="text-sm font-semibold text-foreground">{t('override.grant.title')}</p>
            <FormField label={t('override.fields.userId')} required error={grantForm.errors.userId}>
              <input
                type="text"
                className={cn(
                  'h-10 w-full rounded-md border bg-background px-3 text-sm shadow-sm outline-none ring-0 transition',
                  'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30',
                  grantForm.errors.userId && 'border-destructive focus-visible:border-destructive',
                )}
                {...grantForm.register('userId')}
              />
            </FormField>
            <FormField label={t('override.fields.reason')} required error={grantForm.errors.reason}>
              <textarea
                rows={3}
                className={cn(
                  'w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition',
                  'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30',
                  grantForm.errors.reason && 'border-destructive focus-visible:border-destructive',
                )}
                {...grantForm.register('reason')}
              />
            </FormField>
            <FormField label={t('override.fields.duration')} error={grantForm.errors.grantDurationDays}>
              <input
                type="number"
                min="1"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
                {...grantForm.register('grantDurationDays')}
              />
            </FormField>
            <FormField label={t('override.fields.fixedEndsAt')} error={grantForm.errors.grantFixedEndsAt}>
              <DateTimePicker
                value={grantForm.values.grantFixedEndsAt}
                onChangeAction={(value) => grantForm.setFieldValue('grantFixedEndsAt', value)}
                locale={locale}
                clearLabel={tCommon('clear')}
              />
            </FormField>
            <Button type="submit" disabled={grantForm.isSubmitting}>
              {grantForm.isSubmitting ? <Spinner className="mr-2 h-4 w-4" /> : <ShieldCheck className="size-4" />}
              {t('override.grant.action')}
            </Button>
          </Form>

          <Form form={extendForm} className="space-y-4">
            <FormError />
            <p className="text-sm font-semibold text-foreground">{t('override.extend.title')}</p>
            <FormField label={t('override.fields.userId')} required error={extendForm.errors.userId}>
              <input
                type="text"
                className={cn(
                  'h-10 w-full rounded-md border bg-background px-3 text-sm shadow-sm outline-none ring-0 transition',
                  'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30',
                  extendForm.errors.userId && 'border-destructive focus-visible:border-destructive',
                )}
                {...extendForm.register('userId')}
              />
            </FormField>
            <FormField label={t('override.fields.reason')} required error={extendForm.errors.reason}>
              <textarea
                rows={3}
                className={cn(
                  'w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition',
                  'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30',
                  extendForm.errors.reason && 'border-destructive focus-visible:border-destructive',
                )}
                {...extendForm.register('reason')}
              />
            </FormField>
            <FormField label={t('override.fields.duration')} error={extendForm.errors.grantDurationDays}>
              <input
                type="number"
                min="1"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
                {...extendForm.register('grantDurationDays')}
              />
            </FormField>
            <FormField label={t('override.fields.fixedEndsAt')} error={extendForm.errors.grantFixedEndsAt}>
              <DateTimePicker
                value={extendForm.values.grantFixedEndsAt}
                onChangeAction={(value) => extendForm.setFieldValue('grantFixedEndsAt', value)}
                locale={locale}
                clearLabel={tCommon('clear')}
              />
            </FormField>
            <Button type="submit" disabled={extendForm.isSubmitting}>
              {extendForm.isSubmitting ? <Spinner className="mr-2 h-4 w-4" /> : <ShieldCheck className="size-4" />}
              {t('override.extend.action')}
            </Button>
          </Form>

          <Form form={revokeForm} className="space-y-4">
            <FormError />
            <p className="text-sm font-semibold text-foreground">{t('override.revoke.title')}</p>
            <FormField label={t('override.fields.overrideId')} required error={revokeForm.errors.overrideId}>
              <input
                type="text"
                className={cn(
                  'h-10 w-full rounded-md border bg-background px-3 text-sm shadow-sm outline-none ring-0 transition',
                  'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30',
                  revokeForm.errors.overrideId && 'border-destructive focus-visible:border-destructive',
                )}
                {...revokeForm.register('overrideId')}
              />
            </FormField>
            <Button type="submit" variant="outline" disabled={revokeForm.isSubmitting}>
              {revokeForm.isSubmitting ? <Spinner className="mr-2 h-4 w-4" /> : null}
              {t('override.revoke.action')}
            </Button>
          </Form>
        </div>
      </section>
    </div>
  );
}
