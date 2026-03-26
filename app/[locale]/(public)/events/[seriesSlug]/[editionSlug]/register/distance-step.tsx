'use client';

import { Button } from '@/components/ui/button';
import {
  publicMutedPanelClassName,
  publicPanelClassName,
} from '@/components/common/public-form-styles';
import { Link } from '@/i18n/navigation';
import type { ActiveRegistrationInfo, PublicEventDetail } from '@/lib/events/queries';
import { cn } from '@/lib/utils';
import { ArrowRight, Loader2, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ComponentProps } from 'react';
import type { RegistrationFlowState } from './use-registration-flow';

type DistanceStepProps = {
  event: PublicEventDetail;
  registrationId: string | null;
  existingRegistration?: ActiveRegistrationInfo | null;
  existingRegistrationHref?: ComponentProps<typeof Link>['href'] | null;
  activeInviteExists?: boolean;
  selectedDistanceId: RegistrationFlowState['selectedDistanceId'];
  setSelectedDistanceId: RegistrationFlowState['setSelectedDistanceId'];
  isPending: RegistrationFlowState['isPending'];
  showOrganizerSelfRegistrationWarning?: boolean;
  formatPrice: (cents: number, currency: string) => string;
  onContinue: () => void;
};

export function DistanceStep({
  event,
  registrationId,
  existingRegistration,
  existingRegistrationHref,
  activeInviteExists,
  selectedDistanceId,
  setSelectedDistanceId,
  isPending,
  showOrganizerSelfRegistrationWarning,
  formatPrice,
  onContinue,
}: DistanceStepProps) {
  const t = useTranslations('pages.events.register');
  const tDetail = useTranslations('pages.events.detail');
  const isResumingRegistration = Boolean(registrationId);
  const hasLockedExistingRegistration = Boolean(existingRegistration) && !isResumingRegistration;
  const registrationLinkHref = existingRegistrationHref ?? '/dashboard/my-registrations';

  return (
    <div className="space-y-7">
      <div>
        <h2 className="font-display text-[clamp(1.5rem,2.9vw,2rem)] font-medium leading-tight tracking-[-0.03em] text-foreground">
          {t('distance.title')}
        </h2>
        <p className="mt-2 text-sm leading-7 text-muted-foreground">{t('distance.description')}</p>
      </div>

      {showOrganizerSelfRegistrationWarning ? (
        <div className={publicMutedPanelClassName}>
          <p className="text-sm font-semibold">
            {t('warnings.organizerSelfRegistration.title')}
          </p>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">
            {t('warnings.organizerSelfRegistration.description')}
          </p>
        </div>
      ) : null}

      {event.sharedCapacity &&
        event.distances.some((distance) => distance.capacityScope === 'shared_pool') && (
          <div className={cn(publicMutedPanelClassName, 'py-4')}>
            <p className="text-sm text-muted-foreground">
              {tDetail('capacity.totalSharedCapacity', { total: event.sharedCapacity })}
            </p>
          </div>
        )}

      <div className="space-y-3">
        {event.distances.map((distance) => {
          const isSoldOut = distance.spotsRemaining !== null && distance.spotsRemaining <= 0;
          const isRegisteredDistance = existingRegistration?.distanceId === distance.id;
          const isDisabled =
            isSoldOut ||
            isPending ||
            !!registrationId ||
            hasLockedExistingRegistration ||
            (!!existingRegistration && !isRegisteredDistance);

          return (
            <button
              key={distance.id}
              type="button"
              onClick={() => !isDisabled && setSelectedDistanceId(distance.id)}
              disabled={isDisabled}
              className={cn(
                'w-full rounded-[1.35rem] border p-4 text-left transition-all sm:p-5',
                isRegisteredDistance
                  ? 'border-info-foreground/30 bg-info'
                  : selectedDistanceId === distance.id
                    ? 'border-primary bg-primary/5 shadow-[0_18px_50px_-42px_rgba(15,23,42,0.85)]'
                    : 'border-border/55 bg-[color-mix(in_oklch,var(--background)_80%,var(--background-surface)_20%)] hover:border-primary/40 hover:bg-[color-mix(in_oklch,var(--background)_74%,var(--background-surface)_26%)]',
                isDisabled && !isRegisteredDistance && 'opacity-50 cursor-not-allowed',
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-display text-[clamp(1.25rem,2.2vw,1.55rem)] font-medium leading-tight tracking-[-0.025em] text-foreground">
                      {distance.label}
                    </h3>
                    {isRegisteredDistance && (
                      <span className="inline-flex items-center rounded-full bg-info-foreground/15 px-2 py-0.5 text-xs font-medium text-info-foreground">
                        {t('alreadyRegistered.yourRegistration')}
                      </span>
                    )}
                  </div>
                  {distance.distanceValue && (
                    <p className="text-sm text-muted-foreground">
                      {distance.distanceValue} {distance.distanceUnit}
                    </p>
                  )}
                  {distance.spotsRemaining !== null && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <p className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Users className="h-4 w-4" />
                        {isSoldOut
                          ? t('errors.soldOut')
                          : tDetail('spotsRemaining', { count: distance.spotsRemaining })}
                      </p>
                      {distance.capacityScope === 'shared_pool' && event.sharedCapacity && (
                        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          {tDetail('capacity.sharedPoolLabel')}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="min-w-fit text-right">
                  {distance.priceCents > 0 ? (
                    <span className="font-display text-[1.15rem] font-medium tracking-[-0.02em] text-foreground">
                      {formatPrice(distance.priceCents, distance.currency)}
                    </span>
                  ) : (
                    <span className="font-display text-[1.15rem] font-medium tracking-[-0.02em] text-emerald-600">
                      {tDetail('free')}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className={cn(publicPanelClassName, 'flex justify-end')}>
        {hasLockedExistingRegistration ? (
          <Button asChild className="min-w-[10rem]">
            <Link href={registrationLinkHref}>
              {t('alreadyRegistered.viewRegistration')}
            </Link>
          </Button>
        ) : (
          <Button
            onClick={onContinue}
            disabled={
              (!selectedDistanceId && !isResumingRegistration) ||
              isPending ||
              (activeInviteExists && !isResumingRegistration)
            }
            className="min-w-[10rem]"
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <ArrowRight className="h-4 w-4 mr-2" />
            )}
            {t('distance.continue')}
          </Button>
        )}
      </div>
    </div>
  );
}
