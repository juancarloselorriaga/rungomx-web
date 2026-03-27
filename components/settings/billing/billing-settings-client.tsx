'use client';

import {
  getBillingStatusAction,
  redeemPromoCodeAction,
  resumeSubscriptionAction,
  scheduleCancelAtPeriodEndAction,
  startTrialAction,
} from '@/app/actions/billing';
import { Badge } from '@/components/common/badge';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Spinner } from '@/components/ui/spinner';
import { InsetSurface, Surface } from '@/components/ui/surface';
import { Form, FormError, useForm } from '@/lib/forms';
import type { SerializableBillingStatus } from '@/lib/billing/serialization';
import type { EntitlementSource } from '@/lib/billing/types';
import { cn } from '@/lib/utils';
import { useFormatter, useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { CreditCard, Gem, ReceiptText, ShieldCheck, TicketPercent } from 'lucide-react';

type BillingSettingsClientProps = {
  initialStatus: SerializableBillingStatus;
  emailVerified: boolean;
  isInternal: boolean;
};

type PromoFormValues = {
  code: string;
};

type PromoSuccess = {
  promotionId: string;
  redemptionId?: string;
  overrideId?: string;
  endsAt?: string;
  noExtension?: boolean;
  alreadyRedeemed?: boolean;
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

function BillingSection({
  sectionLabel,
  title,
  description,
  icon,
  children,
}: {
  sectionLabel: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Surface className="overflow-hidden p-0">
      <div className="border-b border-border/60 bg-[color-mix(in_oklch,var(--background)_84%,var(--background-surface)_16%)] px-5 py-5 sm:px-6">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-muted p-2 text-muted-foreground">{icon}</div>

          <div className="space-y-2">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {sectionLabel}
            </p>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
              <p className="text-sm leading-6 text-muted-foreground">{description}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="p-5 sm:p-6">{children}</div>
    </Surface>
  );
}

export function BillingSettingsClient({
  initialStatus,
  emailVerified,
  isInternal,
}: BillingSettingsClientProps) {
  const t = useTranslations('components.settings.billing');
  const format = useFormatter();

  const [status, setStatus] = useState(() => initialStatus);
  const [trialError, setTrialError] = useState<string | null>(null);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);
  const [isStartingTrial, setIsStartingTrial] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const hasSyncedRef = useRef(false);

  const applyLatestStatus = useCallback((next: SerializableBillingStatus) => {
    setStatus((prev) => {
      // Avoid regressing "Pro" UI back to "Free" due to transient read-your-own-write delays.
      if (prev.isPro && !next.isPro) {
        return prev;
      }
      return next;
    });
  }, []);

  const syncStatusFromServer = useCallback(
    async ({
      attempts = 8,
      delayMs = 400,
    }: {
      attempts?: number;
      delayMs?: number;
    } = {}) => {
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
          const result = await getBillingStatusAction();
          if (result.ok) {
            applyLatestStatus(result.data);
            return result.data;
          }
        } catch {
          // ignore and retry
        }

        if (attempt < attempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }

      return null;
    },
    [applyLatestStatus],
  );

  useEffect(() => {
    if (hasSyncedRef.current) return;
    hasSyncedRef.current = true;
    void syncStatusFromServer({ attempts: 5, delayMs: 300 });
  }, [syncStatusFromServer]);

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

  const subscriptionStatusLabel = (value: string | null) => {
    switch (value) {
      case 'trialing':
        return t('subscription.status.trialing');
      case 'active':
        return t('subscription.status.active');
      case 'grace':
        return t('subscription.status.grace');
      case 'ended':
        return t('subscription.status.ended');
      default:
        return value ?? t('status.values.none');
    }
  };

  const subscription = status.subscription;
  const subscriptionWindowLabel =
    subscription?.status === 'trialing'
      ? t('subscription.window.trial')
      : subscription?.status === 'grace'
        ? t('subscription.window.grace')
        : t('subscription.window.active');
  const subscriptionEndsAt = subscription
    ? subscription.status === 'trialing'
      ? subscription.trialEndsAt
      : subscription.currentPeriodEndsAt
    : null;
  const hasActiveSubscription =
    subscription?.status === 'trialing' ||
    subscription?.status === 'active' ||
    subscription?.status === 'grace';

  const trialActive = subscription?.status === 'trialing' ? subscription.trialEndsAt : null;
  const canStartTrial = status.trialEligible && emailVerified && !isInternal;

  const promoForm = useForm<PromoFormValues, PromoSuccess>({
    defaultValues: { code: '' },
    onSubmit: async (values) => {
      const trimmed = values.code.trim();
      const previousStatus = status;
      setStatus((prev) => ({
        ...prev,
        isPro: true,
        trialEligible: false,
        effectiveSource:
          prev.effectiveSource === 'internal_bypass' ? prev.effectiveSource : 'promotion',
      }));
      const result = await redeemPromoCodeAction({ code: trimmed });

      if (!result.ok) {
        setStatus(previousStatus);
        const message =
          result.error === 'UNAUTHENTICATED'
            ? t('promo.errors.unauthenticated')
            : result.error === 'RATE_LIMITED'
              ? t('promo.errors.rateLimited')
              : result.error === 'PROMO_NOT_FOUND'
                ? t('promo.errors.notFound')
                : result.error === 'PROMO_INACTIVE'
                  ? t('promo.errors.inactive')
                  : result.error === 'PROMO_MAX_REDEMPTIONS'
                    ? t('promo.errors.maxRedemptions')
                    : result.error === 'INVALID_INPUT'
                      ? t('promo.errors.invalidInput')
                      : t('promo.errors.generic');

        return {
          ok: false,
          error: result.error,
          fieldErrors: { code: [message] },
          message,
        };
      }

      return result;
    },
    onSuccess: (data) => {
      if (data.alreadyRedeemed) {
        toast.info(t('promo.success.alreadyRedeemed'));
      } else if (data.noExtension) {
        toast.info(t('promo.success.noExtension'));
      } else {
        const endsAt = data.endsAt ? formatDateTime(data.endsAt) : t('status.values.none');
        toast.success(t('promo.success.redeemed', { endsAt }));
      }
      promoForm.reset();
      const endsAt = data.endsAt;
      if (endsAt) {
        setStatus((prev) => ({
          ...prev,
          isPro: true,
          trialEligible: false,
          proUntil: endsAt,
          effectiveSource:
            prev.effectiveSource === 'internal_bypass' ? prev.effectiveSource : 'promotion',
        }));
      }
    },
  });

  const handleStartTrial = () => {
    setTrialError(null);
    void (async () => {
      setIsStartingTrial(true);

      let errorMessage: string | null = null;
      try {
        try {
          const result = await startTrialAction();
          if (result.ok) {
            const nowIso = new Date().toISOString();
            setStatus((prev) => ({
              ...prev,
              isPro: true,
              trialEligible: false,
              proUntil: result.data.trialEndsAt,
              effectiveSource: 'trial',
              subscription: {
                id: prev.subscription?.id ?? 'trial',
                status: 'trialing',
                planKey: prev.subscription?.planKey ?? 'pro',
                cancelAtPeriodEnd: prev.subscription?.cancelAtPeriodEnd ?? false,
                trialStartsAt: prev.subscription?.trialStartsAt ?? nowIso,
                trialEndsAt: result.data.trialEndsAt,
                currentPeriodStartsAt: null,
                currentPeriodEndsAt: null,
                canceledAt: prev.subscription?.canceledAt ?? null,
                endedAt: prev.subscription?.endedAt ?? null,
              },
            }));

            const endsAt = formatDateTime(result.data.trialEndsAt);
            toast.success(t('trial.success', { endsAt }));
            void syncStatusFromServer({ attempts: 5, delayMs: 500 });
            return;
          }

          if (!result.ok) {
            errorMessage =
              result.code === 'EMAIL_NOT_VERIFIED'
                ? t('trial.errors.emailNotVerified')
                : result.code === 'ALREADY_PRO'
                  ? t('trial.errors.alreadyPro')
                  : result.code === 'TRIAL_ALREADY_USED'
                    ? t('trial.errors.alreadyUsed')
                    : result.code === 'UNAUTHENTICATED'
                      ? t('trial.errors.unauthenticated')
                      : t('trial.errors.generic');
          }
        } catch {
          errorMessage = t('trial.errors.generic');
        }

        const latest = await syncStatusFromServer({ attempts: 20, delayMs: 500 });
        if (latest?.isPro) {
          const endsAt = formatDateTime(latest.proUntil);
          toast.success(t('trial.success', { endsAt }));
          return;
        }

        const message = errorMessage ?? t('trial.errors.generic');
        setTrialError(message);
        toast.error(message);
      } finally {
        setIsStartingTrial(false);
      }
    })();
  };

  const handleCancel = () => {
    setSubscriptionError(null);
    void (async () => {
      setIsCanceling(true);
      const result = await scheduleCancelAtPeriodEndAction();

      if (!result.ok) {
        const message =
          result.code === 'NOT_FOUND'
            ? t('subscription.errors.notFound')
            : result.code === 'NOT_ACTIVE'
              ? t('subscription.errors.notActive')
              : result.code === 'SUBSCRIPTION_ENDED'
                ? t('subscription.errors.ended')
                : t('subscription.errors.generic');

        setSubscriptionError(message);
        toast.error(message);
        return;
      }

      setStatus((prev) => ({
        ...prev,
        subscription: prev.subscription
          ? { ...prev.subscription, cancelAtPeriodEnd: true }
          : prev.subscription,
      }));
      toast.success(t('subscription.success.cancelScheduled'));
    })().finally(() => {
      setIsCanceling(false);
    });
  };

  const handleResume = () => {
    setSubscriptionError(null);
    void (async () => {
      setIsResuming(true);
      const result = await resumeSubscriptionAction();

      if (!result.ok) {
        const message =
          result.code === 'NOT_FOUND'
            ? t('subscription.errors.notFound')
            : result.code === 'NOT_ACTIVE'
              ? t('subscription.errors.notActive')
              : result.code === 'SUBSCRIPTION_ENDED'
                ? t('subscription.errors.ended')
                : t('subscription.errors.generic');

        setSubscriptionError(message);
        toast.error(message);
        return;
      }

      setStatus((prev) => ({
        ...prev,
        subscription: prev.subscription
          ? { ...prev.subscription, cancelAtPeriodEnd: false }
          : prev.subscription,
      }));
      toast.success(t('subscription.success.resumed'));
    })().finally(() => {
      setIsResuming(false);
    });
  };

  const sources = status.sources.map((source) => ({
    ...source,
    startsAt: formatDateTime(source.startsAt),
    endsAt: formatDateTime(source.endsAt),
  }));

  const isInternalBypass = isInternal || status.effectiveSource === 'internal_bypass';
  const isProMember = status.isPro;
  const showTrialSection = !isInternalBypass && !isProMember;
  const showPromoSection = !isInternalBypass;
  const showSubscriptionSection = !isInternalBypass;

  return (
    <div className="space-y-6">
      <BillingSection
        sectionLabel={t('status.sectionLabel')}
        title={t('status.title')}
        description={t('status.description')}
        icon={<ShieldCheck className="h-4 w-4" />}
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Badge
              variant={isInternalBypass ? 'indigo' : status.isPro ? 'green' : 'default'}
              data-testid="billing-pro-badge"
            >
              {isInternalBypass
                ? t('status.badges.internal')
                : status.isPro
                  ? t('status.badges.pro')
                  : t('status.badges.free')}
            </Badge>
            {isInternalBypass ? (
              <span className="text-sm text-muted-foreground">{t('status.internal')}</span>
            ) : null}
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
            <InsetSurface className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('status.labels.proUntil')}
                </p>
                <p className="text-sm font-medium" data-testid="billing-pro-until">
                  {status.isPro
                    ? status.proUntil
                      ? `${formatDateTime(status.proUntil)} ${t('status.utc')}`
                      : t('status.values.unlimited')
                    : t('status.values.none')}
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('status.labels.effectiveSource')}
                </p>
                <p className="text-sm font-medium" data-testid="billing-effective-source">
                  {sourceLabel(status.effectiveSource)}
                </p>
              </div>

              {status.nextProStartsAt ? (
                <div className="space-y-1 sm:col-span-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('status.labels.nextProStarts')}
                  </p>
                  <p className="text-sm font-medium">
                    {formatDateTime(status.nextProStartsAt)} {t('status.utc')}
                  </p>
                </div>
              ) : null}
            </InsetSurface>

            <InsetSurface className="flex h-full items-start gap-3 bg-muted/25">
              <div className="rounded-full bg-background p-2 text-muted-foreground shadow-sm">
                <Gem className="h-4 w-4" />
              </div>

              <div className="space-y-1.5">
                <p className="text-sm font-medium text-foreground">
                  {isInternalBypass
                    ? t('status.internal')
                    : status.isPro
                      ? t('status.badges.pro')
                      : t('status.badges.free')}
                </p>
                <p className="text-sm leading-6 text-muted-foreground">{t('status.description')}</p>
              </div>
            </InsetSurface>
          </div>

          {sources.length ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('status.labels.sources')}
              </p>
              <InsetSurface className="space-y-0 p-0 text-sm">
                {sources.map((source, index) => (
                  <div
                    key={`${source.source}-${index}`}
                    className={cn(
                      'flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between',
                      index < sources.length - 1 && 'border-b border-border/60',
                    )}
                  >
                    <div className="space-y-1">
                      <p className="font-semibold">{sourceLabel(source.source)}</p>
                      <p className="text-xs text-muted-foreground">
                        {t('status.labels.sourceWindow')}
                      </p>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {source.startsAt} {t('status.utc')} → {source.endsAt} {t('status.utc')}
                    </div>
                  </div>
                ))}
              </InsetSurface>
            </div>
          ) : null}
        </div>
      </BillingSection>

      {showTrialSection ? (
        <BillingSection
          sectionLabel={t('trial.sectionLabel')}
          title={t('trial.title')}
          description={t('trial.description')}
          icon={<ReceiptText className="h-4 w-4" />}
        >
          <div className="space-y-4">
            {trialActive ? (
              <InsetSurface className="space-y-1 text-sm">
                <p className="font-semibold">{t('trial.activeLabel')}</p>
                <p className="text-muted-foreground">
                  {t('trial.activeUntil', {
                    endsAt: `${formatDateTime(trialActive)} ${t('status.utc')}`,
                  })}
                </p>
              </InsetSurface>
            ) : (
              <InsetSurface className="space-y-2 bg-muted/25 text-sm text-muted-foreground">
                {!emailVerified ? <p>{t('trial.requiresVerification')}</p> : null}
                {!status.trialEligible && !status.isPro && emailVerified ? (
                  <p>{t('trial.alreadyUsed')}</p>
                ) : null}
              </InsetSurface>
            )}

            {trialError ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {trialError}
              </div>
            ) : null}

            <div>
              <Button
                type="button"
                variant="default"
                onClick={handleStartTrial}
                disabled={!canStartTrial || isStartingTrial}
                isLoading={isStartingTrial}
                loadingPlacement="replace"
                loadingLabel={t('trial.actions.starting')}
                data-testid="billing-start-trial"
              >
                {t('trial.actions.start')}
              </Button>
            </div>
          </div>
        </BillingSection>
      ) : null}

      {showSubscriptionSection ? (
        <BillingSection
          sectionLabel={t('subscription.sectionLabel')}
          title={t('subscription.title')}
          description={t('subscription.description')}
          icon={<CreditCard className="h-4 w-4" />}
        >
          <div className="space-y-4">
            {subscription ? (
              <InsetSurface className="grid gap-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={hasActiveSubscription ? 'green' : 'default'} size="sm">
                    {subscriptionStatusLabel(subscription.status)}
                  </Badge>
                  {subscription.cancelAtPeriodEnd ? (
                    <Badge variant="outline" size="sm">
                      {t('subscription.cancelScheduled')}
                    </Badge>
                  ) : null}
                </div>

                {subscriptionEndsAt ? (
                  <p className="text-muted-foreground">
                    {t('subscription.endsAt', {
                      window: subscriptionWindowLabel,
                      endsAt: `${formatDateTime(subscriptionEndsAt)} ${t('status.utc')}`,
                    })}
                  </p>
                ) : null}
              </InsetSurface>
            ) : (
              <InsetSurface className="bg-muted/25">
                <p className="text-sm text-muted-foreground">{t('subscription.none')}</p>
              </InsetSurface>
            )}

            {subscriptionError ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {subscriptionError}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3">
              {subscription && hasActiveSubscription ? (
                subscription.cancelAtPeriodEnd ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleResume}
                    disabled={isResuming}
                    isLoading={isResuming}
                    loadingPlacement="replace"
                    loadingLabel={t('subscription.actions.resuming')}
                    data-testid="billing-resume-subscription"
                  >
                    {t('subscription.actions.resume')}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCancel}
                    disabled={isCanceling}
                    isLoading={isCanceling}
                    loadingPlacement="replace"
                    loadingLabel={t('subscription.actions.canceling')}
                    data-testid="billing-cancel-subscription"
                  >
                    {t('subscription.actions.cancel')}
                  </Button>
                )
              ) : null}
            </div>
          </div>
        </BillingSection>
      ) : null}

      {showPromoSection ? (
        <BillingSection
          sectionLabel={t('promo.sectionLabel')}
          title={t('promo.title')}
          description={t('promo.description')}
          icon={<TicketPercent className="h-4 w-4" />}
        >
          <Form form={promoForm} className="space-y-4">
            <FormError />

            <InsetSurface>
              <FormField label={t('promo.fields.code')} required error={promoForm.errors.code}>
                <input
                  type="text"
                  autoComplete="off"
                  className={cn(
                    'h-11 w-full rounded-lg border bg-background px-3 text-sm shadow-sm outline-none ring-0 transition',
                    'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30',
                    promoForm.errors.code && 'border-destructive focus-visible:border-destructive',
                  )}
                  {...promoForm.register('code')}
                  disabled={promoForm.isSubmitting}
                  data-testid="billing-promo-code"
                />
              </FormField>
            </InsetSurface>

            <div className="flex items-center justify-end gap-3 border-t border-border/60 pt-4">
              <Button
                type="submit"
                disabled={promoForm.isSubmitting}
                data-testid="billing-redeem-promo"
              >
                {promoForm.isSubmitting ? <Spinner className="mr-2 h-4 w-4" /> : null}
                {t('promo.actions.redeem')}
              </Button>
            </div>
          </Form>
        </BillingSection>
      ) : null}
    </div>
  );
}
