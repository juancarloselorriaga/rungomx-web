'use client';

import { lookupBillingUserAction } from '@/app/actions/billing-admin';
import { Badge } from '@/components/common/badge';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Spinner } from '@/components/ui/spinner';
import { Form, FormError, useForm } from '@/lib/forms';
import type { SerializableBillingStatus } from '@/lib/billing/serialization';
import type { EntitlementSource } from '@/lib/billing/types';
import { cn } from '@/lib/utils';
import { Search } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
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
  const format = useFormatter();
  const searchParams = useSearchParams();

  const initialEmail = useMemo(() => (searchParams?.get('email') ?? '').trim(), [searchParams]);

  const [lookupResult, setLookupResult] = useState<BillingUserSummary | null>(null);

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
      toast.success(t('lookup.success'));
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
    </div>
  );
}
