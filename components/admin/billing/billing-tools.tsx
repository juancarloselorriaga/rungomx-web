'use client';

import {
  createPendingGrantAction,
  createPromotionAction,
  disablePendingGrantAction,
  disablePromotionAction,
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
import { Switch } from '@/components/ui/switch';
import { Form, FormError, useForm } from '@/lib/forms';
import type { SerializableBillingStatus } from '@/lib/billing/serialization';
import type { EntitlementSource } from '@/lib/billing/types';
import { cn } from '@/lib/utils';
import { Copy, Search, ShieldCheck } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

type BillingEventSummary = {
  id: string;
  type: string;
  source: string;
  provider: string | null;
  externalEventId: string | null;
  entityType: string;
  entityId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
};

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
  events: BillingEventSummary[];
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

type RevokeOverrideFormValues = {
  overrideId: string;
};

const SOURCE_KEYS: EntitlementSource[] = [
  'internal_bypass',
  'subscription',
  'trial',
  'admin_override',
  'pending_grant',
  'promotion',
  'system',
  'migration',
];

function toOptionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function BillingTools() {
  const t = useTranslations('pages.dashboard.admin.tools.billing');
  const format = useFormatter();

  const [lookupResult, setLookupResult] = useState<BillingUserSummary | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [latestPromoCode, setLatestPromoCode] = useState<string | null>(null);
  const [latestPendingGrantId, setLatestPendingGrantId] = useState<string | null>(null);
  const [latestOverrideId, setLatestOverrideId] = useState<string | null>(null);

  const formatDateTime = (value: string | null) => {
    if (!value) return t('status.values.none');
    return format.dateTime(new Date(value), {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'UTC',
    });
  };

  const sourceLabel = (source: EntitlementSource | null) => {
    if (!source) return t('status.values.none');
    if (!SOURCE_KEYS.includes(source)) return source;
    return t(`sources.${source}`);
  };

  const eventTypeLabel = (type: string) => {
    switch (type) {
      case 'trial_started':
        return t('events.types.trial_started');
      case 'cancel_scheduled':
        return t('events.types.cancel_scheduled');
      case 'cancel_reverted':
        return t('events.types.cancel_reverted');
      case 'subscription_ended':
        return t('events.types.subscription_ended');
      case 'override_granted':
        return t('events.types.override_granted');
      case 'override_extended':
        return t('events.types.override_extended');
      case 'override_revoked':
        return t('events.types.override_revoked');
      case 'promotion_created':
        return t('events.types.promotion_created');
      case 'promotion_disabled':
        return t('events.types.promotion_disabled');
      case 'promotion_redeemed':
        return t('events.types.promotion_redeemed');
      case 'pending_grant_created':
        return t('events.types.pending_grant_created');
      case 'pending_grant_disabled':
        return t('events.types.pending_grant_disabled');
      case 'pending_grant_claimed':
        return t('events.types.pending_grant_claimed');
      default:
        return type;
    }
  };

  const lookupForm = useForm<LookupFormValues, BillingUserSummary>({
    defaultValues: { email: '' },
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
          <div className="space-y-4 border-t border-border/70 pt-4">
            <div className="rounded-lg border bg-muted/20 p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={lookupResult.status.isPro ? 'green' : 'default'}>
                  {lookupResult.status.isPro ? t('status.badges.pro') : t('status.badges.free')}
                </Badge>
                {lookupResult.user.isInternal ? (
                  <Badge variant="outline">{t('status.badges.internal')}</Badge>
                ) : null}
              </div>
              <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
                <p>
                  <span className="font-semibold text-foreground">{t('lookup.labels.user')}</span>{' '}
                  {lookupResult.user.name ?? t('lookup.values.unknown')} · {lookupResult.user.email}
                </p>
                <p>
                  <span className="font-semibold text-foreground">{t('lookup.labels.userId')}</span>{' '}
                  {lookupResult.user.id}
                </p>
                <p>
                  <span className="font-semibold text-foreground">{t('lookup.labels.createdAt')}</span>{' '}
                  {formatDateTime(lookupResult.user.createdAt)} {t('status.utc')}
                </p>
              </div>
            </div>

            <div className="rounded-lg border bg-background/60 p-4 text-sm">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('status.labels.proUntil')}
                  </p>
                  <p className="text-sm font-medium">
                    {lookupResult.status.isPro
                      ? lookupResult.status.proUntil
                        ? `${formatDateTime(lookupResult.status.proUntil)} ${t('status.utc')}`
                        : t('status.values.unlimited')
                      : t('status.values.none')}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('status.labels.effectiveSource')}
                  </p>
                  <p className="text-sm font-medium">
                    {sourceLabel(lookupResult.status.effectiveSource)}
                  </p>
                </div>
              </div>
            </div>

            {lookupResult.status.sources.length ? (
              <div className="rounded-lg border bg-background/60 p-4 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('status.labels.sources')}
                </p>
                <div className="mt-2 space-y-2">
                  {lookupResult.status.sources.map((source, index) => (
                    <div
                      key={`${source.source}-${index}`}
                      className="flex flex-col gap-1 border-b border-border/60 pb-2 last:border-b-0 last:pb-0"
                    >
                      <p className="font-semibold">{sourceLabel(source.source)}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(source.startsAt)} {t('status.utc')} →{' '}
                        {formatDateTime(source.endsAt)} {t('status.utc')}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="rounded-lg border bg-background/60 p-4 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('events.title')}
              </p>
              {lookupResult.events.length ? (
                <div className="mt-2 space-y-3">
                  {lookupResult.events.map((event) => (
                    <div key={event.id} className="rounded-md border border-border/60 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span>{eventTypeLabel(event.type)}</span>
                        <span>{formatDateTime(event.createdAt)} {t('status.utc')}</span>
                      </div>
                      <p className="mt-1 text-sm font-semibold text-foreground">{event.entityType}</p>
                      {Object.keys(event.payload ?? {}).length ? (
                        <pre className="mt-2 overflow-x-auto rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
                          {JSON.stringify(event.payload, null, 2)}
                        </pre>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">{t('events.empty')}</p>
              )}
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
                />
              </FormField>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField label={t('promotion.fields.validFrom')} error={promoForm.errors.validFrom}>
                <DateTimePicker
                  value={promoForm.values.validFrom}
                  onChangeAction={(value) => promoForm.setFieldValue('validFrom', value)}
                />
              </FormField>
              <FormField label={t('promotion.fields.validTo')} error={promoForm.errors.validTo}>
                <DateTimePicker
                  value={promoForm.values.validTo}
                  onChangeAction={(value) => promoForm.setFieldValue('validTo', value)}
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
                className={cn(
                  'h-10 w-full rounded-md border bg-background px-3 text-sm shadow-sm outline-none ring-0 transition',
                  'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30',
                  disablePromoForm.errors.promotionId && 'border-destructive focus-visible:border-destructive',
                )}
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
                />
              </FormField>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField label={t('pendingGrant.fields.claimValidFrom')} error={pendingGrantForm.errors.claimValidFrom}>
                <DateTimePicker
                  value={pendingGrantForm.values.claimValidFrom}
                  onChangeAction={(value) => pendingGrantForm.setFieldValue('claimValidFrom', value)}
                />
              </FormField>
              <FormField label={t('pendingGrant.fields.claimValidTo')} error={pendingGrantForm.errors.claimValidTo}>
                <DateTimePicker
                  value={pendingGrantForm.values.claimValidTo}
                  onChangeAction={(value) => pendingGrantForm.setFieldValue('claimValidTo', value)}
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
