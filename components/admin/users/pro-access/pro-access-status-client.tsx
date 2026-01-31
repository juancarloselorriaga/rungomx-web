'use client';

import {
  extendOverrideAction,
  grantOverrideAction,
  lookupBillingUserAction,
  revokeOverrideAction,
  searchUserEmailOptionsAction,
} from '@/app/actions/billing-admin';
import { GrantTypeSelector } from '@/components/admin/users/pro-access/grant-type-selector';
import { Badge } from '@/components/common/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { FormField } from '@/components/ui/form-field';
import { SearchablePicker } from '@/components/ui/searchable-picker';
import { Spinner } from '@/components/ui/spinner';
import { Form, FormError, useForm } from '@/lib/forms';
import type { SerializableBillingStatus } from '@/lib/billing/serialization';
import type { EntitlementSource } from '@/lib/billing/types';
import { cn } from '@/lib/utils';
import { Search, ShieldCheck } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import type { FormEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  actor: { id: string; name: string | null; email: string } | null;
  createdAt: string;
};

type BillingUserSummary = {
  serverTimeMs: number;
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
  reason: string;
  grantType: 'duration' | 'until';
  grantDurationDays: string;
  grantFixedEndsAt: string;
};

type AdminOverrideState = {
  active: { id: string; endsAt: Date } | null;
  scheduled: { id: string; startsAt: Date } | null;
};

function toOptionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function looksLikeEmail(value: string) {
  const trimmed = value.trim();
  const at = trimmed.indexOf('@');
  if (at <= 0) return false;
  const domain = trimmed.slice(at + 1);
  return domain.includes('.');
}

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

export function ProAccessStatusClient() {
  const tPage = useTranslations('pages.adminProAccess.page.status');
  const t = useTranslations('pages.adminProAccess.billing');
  const tCommon = useTranslations('common');
  const format = useFormatter();
  const locale = useLocale();
  const searchParams = useSearchParams();

  const initialEmail = useMemo(() => (searchParams?.get('email') ?? '').trim(), [searchParams]);
  const initialSection = useMemo(() => (searchParams?.get('section') ?? '').trim(), [searchParams]);
  const shouldFocusOverrides = initialSection === 'overrides';

  const [lookupResult, setLookupResult] = useState<BillingUserSummary | null>(null);
  const [referenceTimeMs, setReferenceTimeMs] = useState(0);
  const [latestOverrideId, setLatestOverrideId] = useState<string | null>(null);
  const hasAutoSubmitted = useRef(false);
  const lastLookupEmail = useRef<string | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);

  const overridesSectionRef = useRef<HTMLElement | null>(null);

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
      case 'promotion_enabled':
        return t('events.types.promotion_enabled');
      case 'promotion_disabled':
        return t('events.types.promotion_disabled');
      case 'promotion_redeemed':
        return t('events.types.promotion_redeemed');
      case 'pending_grant_created':
        return t('events.types.pending_grant_created');
      case 'pending_grant_enabled':
        return t('events.types.pending_grant_enabled');
      case 'pending_grant_disabled':
        return t('events.types.pending_grant_disabled');
      case 'pending_grant_claimed':
        return t('events.types.pending_grant_claimed');
      default:
        return type;
    }
  };

  const formatUtcLabel = (value: string | null) =>
    value ? `${formatDateTime(value)} ${t('status.utc')}` : t('status.values.none');

  const getPayloadString = (payload: Record<string, unknown>, key: string) =>
    typeof payload[key] === 'string' ? (payload[key] as string) : null;
  const getPayloadNumber = (payload: Record<string, unknown>, key: string) =>
    typeof payload[key] === 'number' ? (payload[key] as number) : null;
  const getPayloadBoolean = (payload: Record<string, unknown>, key: string) =>
    typeof payload[key] === 'boolean' ? (payload[key] as boolean) : null;

  const eventDetails = (event: BillingEventSummary) => {
    const payload = event.payload ?? {};
    const details: string[] = [];

    const actorLabel = event.actor?.name
      ? `${event.actor.name} (${event.actor.email})`
      : event.actor?.email ?? null;
    if (actorLabel) {
      details.push(t('events.details.actor', { actor: actorLabel }));
    }

    const noExtension = getPayloadBoolean(payload, 'noExtension');
    const startsAt = getPayloadString(payload, 'startsAt');
    const endsAt = getPayloadString(payload, 'endsAt');
    const previousEndsAt = getPayloadString(payload, 'previousEndsAt');
    const codePrefix = getPayloadString(payload, 'codePrefix');
    const reason = getPayloadString(payload, 'reason');
    const grantDurationDays = getPayloadNumber(payload, 'grantDurationDays');
    const grantFixedEndsAt = getPayloadString(payload, 'grantFixedEndsAt');
    const claimValidFrom = getPayloadString(payload, 'claimValidFrom');
    const claimValidTo = getPayloadString(payload, 'claimValidTo');
    const validFrom = getPayloadString(payload, 'validFrom');
    const validTo = getPayloadString(payload, 'validTo');
    const maxRedemptions = getPayloadNumber(payload, 'maxRedemptions');

    if (reason) {
      details.push(t('events.details.reason', { reason }));
    }

    if (noExtension) {
      details.push(t('events.details.noExtension'));
    }

    const hasAccessWindow = Boolean(!noExtension && startsAt && endsAt);
    if (hasAccessWindow) {
      details.push(
        t('events.details.accessWindow', {
          startsAt: formatUtcLabel(startsAt),
          endsAt: formatUtcLabel(endsAt),
        }),
      );
    }

    if (previousEndsAt && event.type === 'override_revoked') {
      details.push(t('events.details.previousEndsAt', { endsAt: formatUtcLabel(previousEndsAt) }));
    }

    if (event.type === 'override_granted' || event.type === 'override_extended') {
      if (typeof grantDurationDays === 'number') {
        details.push(t('events.details.grantDuration', { days: grantDurationDays }));
      } else if (grantFixedEndsAt) {
        details.push(t('events.details.grantFixedEnd', { endsAt: formatUtcLabel(grantFixedEndsAt) }));
      }
    }

    if (event.type === 'promotion_created') {
      if (codePrefix) {
        details.push(t('events.details.codePrefix', { codePrefix }));
      }

      if (typeof grantDurationDays === 'number') {
        details.push(t('events.details.grantDuration', { days: grantDurationDays }));
      } else if (grantFixedEndsAt) {
        details.push(t('events.details.grantFixedEnd', { endsAt: formatUtcLabel(grantFixedEndsAt) }));
      }

      if (validFrom || validTo) {
        details.push(
          t('events.details.validityWindow', {
            from: formatUtcLabel(validFrom),
            to: formatUtcLabel(validTo),
          }),
        );
      }

      if (typeof maxRedemptions === 'number') {
        details.push(t('events.details.maxRedemptions', { count: maxRedemptions }));
      }
    }

    if (event.type === 'pending_grant_created') {
      if (typeof grantDurationDays === 'number') {
        details.push(t('events.details.grantDuration', { days: grantDurationDays }));
      } else if (grantFixedEndsAt) {
        details.push(t('events.details.grantFixedEnd', { endsAt: formatUtcLabel(grantFixedEndsAt) }));
      }

      if (claimValidFrom || claimValidTo) {
        details.push(
          t('events.details.claimWindow', {
            from: formatUtcLabel(claimValidFrom),
            to: formatUtcLabel(claimValidTo),
          }),
        );
      }
    }

    return details;
  };

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
      setReferenceTimeMs(data.serverTimeMs);
      setLookupResult(data);
      toast.success(t('lookup.success'));
    },
  });

  const emailField = lookupForm.register('email');
  const lookupEmailValue = lookupForm.values.email;
  const lookupIsSubmitting = lookupForm.isSubmitting;
  const lookupHandleSubmit = lookupForm.handleSubmit;

  const loadUserEmailOptions = useCallback(async (query: string) => {
    const result = await searchUserEmailOptionsAction({ query });
    if (!result.ok) return [];

    return result.data.options.map((option) => ({
      value: option.email,
      label: option.email,
      description: option.name,
    }));
  }, []);

  useEffect(() => {
    if (!initialEmail) return;
    if (hasAutoSubmitted.current) return;
    hasAutoSubmitted.current = true;
    lastLookupEmail.current = initialEmail;
    lookupHandleSubmit({ preventDefault: () => {} } as unknown as FormEvent<HTMLFormElement>);
  }, [initialEmail, lookupHandleSubmit]);

  useEffect(() => {
    const email = lookupEmailValue.trim();
    if (!email) {
      lastLookupEmail.current = null;
      return;
    }

    if (!looksLikeEmail(email)) return;
    if (lookupIsSubmitting) return;
    if (lastLookupEmail.current === email) return;

    const timeout = window.setTimeout(() => {
      if (lookupIsSubmitting) return;
      lastLookupEmail.current = email;
      lookupHandleSubmit(
        { preventDefault: () => {} } as unknown as FormEvent<HTMLFormElement>,
        { email },
      );
    }, 450);

    return () => window.clearTimeout(timeout);
  }, [lookupEmailValue, lookupHandleSubmit, lookupIsSubmitting]);

  useEffect(() => {
    if (!shouldFocusOverrides) return;
    if (!lookupResult) return;

    window.setTimeout(() => {
      overridesSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  }, [lookupResult, shouldFocusOverrides]);

  const overrideMode = lookupResult?.status.isPro ? 'extend' : 'grant';
  const overridesDisabled = Boolean(lookupResult?.user.isInternal);

  const adminOverrideState: AdminOverrideState = useMemo(() => {
    if (!lookupResult) return { active: null, scheduled: null };

    const now = referenceTimeMs;
    const overrides = lookupResult.status.sources
      .filter((source) => source.source === 'admin_override')
      .map((source) => ({
        id: source.sourceId ?? null,
        startsAt: new Date(source.startsAt),
        endsAt: new Date(source.endsAt),
      }))
      .filter((source) => Boolean(source.id)) as Array<{ id: string; startsAt: Date; endsAt: Date }>;

    const active = overrides
      .filter((override) => override.startsAt.getTime() <= now && now < override.endsAt.getTime())
      .sort((a, b) => b.endsAt.getTime() - a.endsAt.getTime())[0];

    const scheduled = overrides
      .filter((override) => override.startsAt.getTime() > now)
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0];

    return {
      active: active ? { id: active.id, endsAt: active.endsAt } : null,
      scheduled: scheduled ? { id: scheduled.id, startsAt: scheduled.startsAt } : null,
    };
  }, [lookupResult, referenceTimeMs]);

  const refreshLookup = async () => {
    const email = lookupForm.values.email.trim();
    if (!email) return;

    const result = await lookupBillingUserAction({ email });
    if (!result.ok) return;

    setReferenceTimeMs(result.data.serverTimeMs);
    setLookupResult(result.data);
  };

  const overrideForm = useForm<OverrideFormValues, { overrideId?: string }>({
    defaultValues: {
      reason: '',
      grantType: 'duration',
      grantDurationDays: '',
      grantFixedEndsAt: '',
    },
    onSubmit: async (values) => {
      if (!lookupResult) {
        return { ok: false, error: 'INVALID_INPUT', message: t('override.errors.generic') };
      }
      if (lookupResult.user.isInternal) {
        return { ok: false, error: 'INVALID_INPUT', message: t('override.errors.internalUser') };
      }

      const payload = {
        userId: lookupResult.user.id,
        reason: values.reason.trim(),
        grantDurationDays:
          values.grantType === 'duration' ? toOptionalNumber(values.grantDurationDays) : null,
        grantFixedEndsAt:
          values.grantType === 'until' && values.grantFixedEndsAt ? values.grantFixedEndsAt : null,
      };

      const result =
        overrideMode === 'extend'
          ? await extendOverrideAction(payload)
          : await grantOverrideAction(payload);
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
      toast.success(
        overrideMode === 'extend' ? t('override.success.extended') : t('override.success.granted'),
      );
      overrideForm.reset();
      overrideForm.setFieldValue('grantType', 'duration');
      void refreshLookup();
    },
  });

  const handleRevokeActiveOverride = async () => {
    if (!adminOverrideState.active) return;
    if (lookupResult?.user.isInternal) return;
    setIsRevoking(true);

    const result = await revokeOverrideAction({ overrideId: adminOverrideState.active.id });
    if (!result.ok) {
      const message =
        result.error === 'UNAUTHENTICATED'
          ? t('override.errors.unauthenticated')
          : result.error === 'FORBIDDEN'
            ? t('override.errors.forbidden')
            : result.error === 'INVALID_INPUT'
              ? t('override.errors.invalidInput')
              : t('override.errors.generic');
      toast.error(message);
      setIsRevoking(false);
      return;
    }

    toast.success(t('override.success.revoked'));
    setLatestOverrideId(result.data.overrideId);
    setIsRevoking(false);
    await refreshLookup();
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
            {t('lookup.sectionLabel')}
          </p>
          <h2 className="text-lg font-semibold">{t('lookup.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('lookup.description')}</p>
        </div>

        <Form form={lookupForm} className="space-y-4 border-t border-border/70 pt-4">
          <FormError />
          <FormField label={t('lookup.fields.email')} required error={lookupForm.errors.email}>
            <SearchablePicker
              value={emailField.value}
              onChangeAction={emailField.onChange}
              onSelectOptionAction={(option) => {
                if (lookupForm.isSubmitting) return;
                lastLookupEmail.current = option.value;
                lookupForm.handleSubmit(
                  { preventDefault: () => {} } as unknown as FormEvent<HTMLFormElement>,
                  { email: option.value },
                );
              }}
              loadOptionsAction={loadUserEmailOptions}
              inputType="email"
              disabled={lookupForm.isSubmitting}
              invalid={Boolean(lookupForm.errors.email)}
              name={emailField.name as string}
              loadingLabel={tCommon('loading')}
              emptyLabel={tCommon('searchPicker.noResults')}
              errorLabel={tCommon('searchPicker.loadFailed')}
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
                  <p className="text-sm font-medium">{sourceLabel(lookupResult.status.effectiveSource)}</p>
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
                        {formatDateTime(source.startsAt)} {t('status.utc')} → {formatDateTime(source.endsAt)}{' '}
                        {t('status.utc')}
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
	                        <span>
	                          {formatDateTime(event.createdAt)} {t('status.utc')}
	                        </span>
	                      </div>
	                      {(() => {
	                        const details = eventDetails(event);
	                        const hasPayload = Boolean(Object.keys(event.payload ?? {}).length);

	                        return (
	                          <>
	                            {details.length ? (
	                              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
	                                {details.map((line, index) => (
	                                  <li key={`${event.id}-detail-${index}`}>{line}</li>
	                                ))}
	                              </ul>
	                            ) : null}
	                            {hasPayload && details.length === 0 ? (
	                              <details className="mt-2">
	                                <summary className="cursor-pointer select-none text-xs text-muted-foreground">
	                                  {t('events.details.rawDetails')}
	                                </summary>
	                                <pre className="mt-2 overflow-x-auto rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
	                                  {JSON.stringify(event.payload, null, 2)}
	                                </pre>
	                              </details>
	                            ) : null}
	                          </>
	                        );
	                      })()}
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

      <section
        ref={(node) => {
          overridesSectionRef.current = node;
        }}
        className="space-y-5 rounded-lg border bg-card p-5 shadow-sm scroll-mt-24"
      >
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

        {lookupResult ? (
          <div className="space-y-6 border-t border-border/70 pt-4">
            <Form form={overrideForm} className="space-y-4">
              <FormError />
              <p className="text-sm font-semibold text-foreground">
                {overrideMode === 'extend' ? t('override.extend.title') : t('override.grant.title')}
              </p>
              {overridesDisabled ? (
                <p className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  {t('override.internalHint')}
                </p>
              ) : null}
              <FormField label={t('override.fields.reason')} required error={overrideForm.errors.reason}>
                <textarea
                  rows={3}
                  className={cn(
                    'w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition',
                    'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30',
                    overrideForm.errors.reason && 'border-destructive focus-visible:border-destructive',
                  )}
                  {...overrideForm.register('reason')}
                  disabled={overrideForm.isSubmitting || overridesDisabled}
                />
              </FormField>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('override.fields.grantTypeLabel')}
                </p>
                <GrantTypeSelector
                  value={overrideForm.values.grantType}
                  onChangeAction={(next) => {
                    overrideForm.setFieldValue('grantType', next);
                    if (next === 'duration') {
                      overrideForm.setFieldValue('grantFixedEndsAt', '');
                      overrideForm.clearError('grantFixedEndsAt');
                    } else {
                      overrideForm.setFieldValue('grantDurationDays', '');
                      overrideForm.clearError('grantDurationDays');
                    }
                  }}
                  disabled={overrideForm.isSubmitting || overridesDisabled}
                  label={t('override.fields.grantTypeLabel')}
                  durationLabel={t('override.fields.grantType.duration')}
                  durationDescription={t('override.fields.grantTypeHint.duration')}
                  untilLabel={t('override.fields.grantType.until')}
                  untilDescription={t('override.fields.grantTypeHint.until')}
                />
              </div>

              {overrideForm.values.grantType === 'duration' ? (
                <FormField
                  label={t('override.fields.duration')}
                  required
                  error={overrideForm.errors.grantDurationDays}
                >
                  <input
                    type="number"
                    min="1"
                    className={cn(
                      'h-10 w-full rounded-md border bg-background px-3 text-sm shadow-sm outline-none ring-0 transition',
                      'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30',
                      overrideForm.errors.grantDurationDays && 'border-destructive focus-visible:border-destructive',
                    )}
                    {...overrideForm.register('grantDurationDays')}
                    disabled={overrideForm.isSubmitting || overridesDisabled}
                  />
                </FormField>
              ) : (
                <FormField
                  label={t('override.fields.fixedEndsAt')}
                  required
                  error={overrideForm.errors.grantFixedEndsAt}
                >
                  <DateTimePicker
                    value={overrideForm.values.grantFixedEndsAt}
                    onChangeAction={(value) => overrideForm.setFieldValue('grantFixedEndsAt', value)}
                    locale={locale}
                    clearLabel={tCommon('clear')}
                    disabled={overrideForm.isSubmitting || overridesDisabled}
                  />
                </FormField>
              )}

              <div className="flex flex-col gap-3 border-t border-border/70 pt-4 sm:flex-row sm:justify-end">
                <Button
                  type="submit"
                  className="w-full sm:w-auto"
                  disabled={overrideForm.isSubmitting || overridesDisabled || !lookupResult}
                >
                  {overrideForm.isSubmitting ? <Spinner className="mr-2 h-4 w-4" /> : <ShieldCheck className="size-4" />}
                  {overrideMode === 'extend' ? t('override.extend.action') : t('override.grant.action')}
                </Button>
              </div>
            </Form>

            <div className="rounded-lg border bg-background/60 p-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">{t('override.revoke.title')}</p>
                {adminOverrideState.active ? (
                  <p className="text-xs text-muted-foreground">
                    {t('override.revoke.activeHint', {
                      endsAt: `${formatDateTime(adminOverrideState.active.endsAt.toISOString())} ${t('status.utc')}`,
                    })}
                  </p>
                ) : adminOverrideState.scheduled ? (
                  <p className="text-xs text-muted-foreground">
                    {t('override.revoke.scheduledHint', {
                      startsAt: `${formatDateTime(adminOverrideState.scheduled.startsAt.toISOString())} ${t('status.utc')}`,
                    })}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">{t('override.revoke.noneHint')}</p>
                )}
              </div>
              <div className="mt-4 flex flex-col gap-3 border-t border-border/70 pt-4 sm:flex-row sm:justify-end">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      variant="destructive"
                      className="w-full sm:w-auto"
                      disabled={!adminOverrideState.active || overridesDisabled || isRevoking}
                    >
                      {isRevoking ? <Spinner className="mr-2 h-4 w-4" /> : null}
                      {t('override.revoke.action')}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t('override.revoke.confirm.title')}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t('override.revoke.confirm.description')}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{tCommon('cancel')}</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleRevokeActiveOverride}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {t('override.revoke.confirm.confirm')}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </div>
        ) : (
          <p className="border-t border-border/70 pt-4 text-sm text-muted-foreground">
            {t('override.emptyState')}
          </p>
        )}
      </section>
    </div>
  );
}
