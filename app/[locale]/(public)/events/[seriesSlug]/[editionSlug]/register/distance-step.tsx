'use client';

import { Button } from '@/components/ui/button';
import type { ActiveRegistrationInfo, PublicEventDetail } from '@/lib/events/queries';
import { cn } from '@/lib/utils';
import { ArrowRight, Loader2, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { RegistrationFlowState } from './use-registration-flow';

type DistanceStepProps = {
  event: PublicEventDetail;
  existingRegistration?: ActiveRegistrationInfo | null;
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
  existingRegistration,
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{t('distance.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('distance.description')}</p>
      </div>

      {showOrganizerSelfRegistrationWarning ? (
        <div className="rounded-lg border bg-muted/40 p-4">
          <p className="text-sm font-semibold">
            {t('warnings.organizerSelfRegistration.title')}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {t('warnings.organizerSelfRegistration.description')}
          </p>
        </div>
      ) : null}

      {event.sharedCapacity &&
        event.distances.some((distance) => distance.capacityScope === 'shared_pool') && (
          <div className="rounded-lg border bg-muted/40 p-3 mb-4">
            <p className="text-sm text-muted-foreground">
              {tDetail('capacity.totalSharedCapacity', { total: event.sharedCapacity })}
            </p>
          </div>
        )}

      <div className="space-y-3">
        {event.distances.map((distance) => {
          const isSoldOut = distance.spotsRemaining !== null && distance.spotsRemaining <= 0;
          const isRegisteredDistance = existingRegistration?.distanceId === distance.id;
          const isDisabled = isSoldOut || isPending || !!existingRegistration;

          return (
            <button
              key={distance.id}
              type="button"
              onClick={() => !isDisabled && setSelectedDistanceId(distance.id)}
              disabled={isDisabled}
              className={cn(
                'w-full text-left rounded-lg border p-4 transition-all',
                isRegisteredDistance
                  ? 'border-info-foreground/30 bg-info'
                  : selectedDistanceId === distance.id
                    ? 'border-primary bg-primary/5 ring-2 ring-primary'
                    : 'border-border hover:border-primary/50',
                isDisabled && !isRegisteredDistance && 'opacity-50 cursor-not-allowed',
              )}
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">{distance.label}</h3>
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
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
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
                <div className="text-right">
                  {distance.priceCents > 0 ? (
                    <span className="font-semibold">
                      {formatPrice(distance.priceCents, distance.currency)}
                    </span>
                  ) : (
                    <span className="font-semibold text-green-600">Free</span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex justify-end">
        <Button
          onClick={onContinue}
          disabled={!selectedDistanceId || isPending || !!existingRegistration || activeInviteExists}
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <ArrowRight className="h-4 w-4 mr-2" />
          )}
          {t('distance.continue')}
        </Button>
      </div>
    </div>
  );
}
