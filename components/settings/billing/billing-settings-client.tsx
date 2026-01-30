'use client';

import { redeemPromoCodeAction, resumeSubscriptionAction, scheduleCancelAtPeriodEndAction, startTrialAction } from '@/app/actions/billing';
import { Badge } from '@/components/common/badge';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Spinner } from '@/components/ui/spinner';
import { useRouter } from '@/i18n/navigation';
import { Form, FormError, useForm } from '@/lib/forms';
import type { SerializableBillingStatus } from '@/lib/billing/serialization';
import type { EntitlementSource } from '@/lib/billing/types';
import { cn } from '@/lib/utils';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';

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

export function BillingSettingsClient({
  initialStatus,
  emailVerified,
  isInternal,
}: BillingSettingsClientProps) {
  const t = useTranslations('components.settings.billing');
  const format = useFormatter();
  const router = useRouter();

  const [status, setStatus] = useState(initialStatus);
  const [trialError, setTrialError] = useState<string | null>(null);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);
  const [isStartingTrial, startTrialTransition] = useTransition();
  const [isCanceling, startCancelTransition] = useTransition();
  const [isResuming, startResumeTransition] = useTransition();

  useEffect(() => {
    setStatus(initialStatus);
  }, [initialStatus]);

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
      case 'ended':
        return t('subscription.status.ended');
      default:
        return value ?? t('status.values.none');
    }
  };

  const subscription = status.subscription;
  const subscriptionWindowLabel =
    subscription?.status === 'trialing' ? t('subscription.window.trial') : t('subscription.window.active');
  const subscriptionEndsAt = subscription
    ? subscription.status === 'trialing'
      ? subscription.trialEndsAt
      : subscription.currentPeriodEndsAt
    : null;
  const hasActiveSubscription =
    subscription?.status === 'trialing' || subscription?.status === 'active';

  const trialActive = subscription?.status === 'trialing' ? subscription.trialEndsAt : null;
  const canStartTrial = status.trialEligible && emailVerified && !isInternal;

  const promoForm = useForm<PromoFormValues, PromoSuccess>({
    defaultValues: { code: '' },
    onSubmit: async (values) => {
      const trimmed = values.code.trim();
      const result = await redeemPromoCodeAction({ code: trimmed });

      if (!result.ok) {
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
      router.refresh();
    },
  });

  const handleStartTrial = () => {
    setTrialError(null);

    startTrialTransition(async () => {
      const result = await startTrialAction();

      if (!result.ok) {
        const message =
          result.code === 'EMAIL_NOT_VERIFIED'
            ? t('trial.errors.emailNotVerified')
            : result.code === 'ALREADY_PRO'
              ? t('trial.errors.alreadyPro')
              : result.code === 'TRIAL_ALREADY_USED'
                ? t('trial.errors.alreadyUsed')
                : result.code === 'UNAUTHENTICATED'
                  ? t('trial.errors.unauthenticated')
                  : t('trial.errors.generic');

        setTrialError(message);
        toast.error(message);
        return;
      }

      const endsAt = formatDateTime(result.data.trialEndsAt);
      toast.success(t('trial.success', { endsAt }));
      router.refresh();
    });
  };

  const handleCancel = () => {
    setSubscriptionError(null);
    startCancelTransition(async () => {
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

      toast.success(t('subscription.success.cancelScheduled'));
      router.refresh();
    });
  };

  const handleResume = () => {
    setSubscriptionError(null);
    startResumeTransition(async () => {
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

      toast.success(t('subscription.success.resumed'));
      router.refresh();
    });
  };

  const sources = status.sources.map((source) => ({
    ...source,
    startsAt: formatDateTime(source.startsAt),
    endsAt: formatDateTime(source.endsAt),
  }));

  const isInternalBypass = isInternal || status.effectiveSource === 'internal_bypass';

  return (
    <div className="space-y-6">
      <section className="space-y-5 rounded-lg border bg-card p-5 shadow-sm">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('status.sectionLabel')}
          </p>
          <h2 className="text-lg font-semibold">{t('status.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('status.description')}</p>
        </div>

        <div className="border-t border-border/70 pt-4 space-y-4">
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

          <div className="grid gap-4 sm:grid-cols-2">
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
          </div>

          {sources.length ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('status.labels.sources')}
              </p>
              <div className="rounded-md border border-border/60 bg-muted/20 text-sm">
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
                      <p className="text-xs text-muted-foreground">{t('status.labels.sourceWindow')}</p>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {source.startsAt} {t('status.utc')} → {source.endsAt} {t('status.utc')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {!isInternal ? (
        <>
          <section className="space-y-5 rounded-lg border bg-card p-5 shadow-sm">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('trial.sectionLabel')}
          </p>
          <h2 className="text-lg font-semibold">{t('trial.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('trial.description')}</p>
        </div>

        <div className="border-t border-border/70 pt-4 space-y-4">
          {trialActive ? (
            <div className="space-y-1 text-sm">
              <p className="font-semibold">{t('trial.activeLabel')}</p>
              <p className="text-muted-foreground">
                {t('trial.activeUntil', {
                  endsAt: `${formatDateTime(trialActive)} ${t('status.utc')}`,
                })}
              </p>
            </div>
          ) : (
            <div className="space-y-2 text-sm text-muted-foreground">
              {!emailVerified ? <p>{t('trial.requiresVerification')}</p> : null}
              {!status.trialEligible && !status.isPro && emailVerified ? (
                <p>{t('trial.alreadyUsed')}</p>
              ) : null}
              {status.isPro ? <p>{t('trial.alreadyPro')}</p> : null}
            </div>
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
      </section>

      <section className="space-y-5 rounded-lg border bg-card p-5 shadow-sm">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('subscription.sectionLabel')}
          </p>
          <h2 className="text-lg font-semibold">{t('subscription.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('subscription.description')}</p>
        </div>

        <div className="border-t border-border/70 pt-4 space-y-4">
          {subscription ? (
            <div className="grid gap-3 text-sm">
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
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t('subscription.none')}</p>
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
      </section>

      <section className="space-y-5 rounded-lg border bg-card p-5 shadow-sm">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('promo.sectionLabel')}
          </p>
          <h2 className="text-lg font-semibold">{t('promo.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('promo.description')}</p>
        </div>

        <Form form={promoForm} className="space-y-4 border-t border-border/70 pt-4">
          <FormError />

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

          <div className="flex items-center justify-end gap-3 border-t border-border/70 pt-4">
            <Button type="submit" disabled={promoForm.isSubmitting} data-testid="billing-redeem-promo">
              {promoForm.isSubmitting ? <Spinner className="mr-2 h-4 w-4" /> : null}
              {t('promo.actions.redeem')}
            </Button>
          </div>
        </Form>
      </section>
        </>
      ) : null}
    </div>
  );
}
