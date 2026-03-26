'use client';

import { Button } from '@/components/ui/button';
import {
  publicCheckboxClassName,
  publicMutedPanelClassName,
  publicPanelClassName,
} from '@/components/common/public-form-styles';
import { MarkdownContent } from '@/components/markdown/markdown-content';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Link } from '@/i18n/navigation';
import type { AddOnData } from '@/lib/events/add-ons/actions';
import type { RegistrationQuestionData } from '@/lib/events/questions/actions';
import type { ActiveRegistrationInfo, PublicEventDetail } from '@/lib/events/queries';
import { cn } from '@/lib/utils';
import { formatMoneyFromMinor } from '@/lib/utils/format-money';
import { AddOnsStep } from './addons-step';
import { ConfirmationStep } from './confirmation-step';
import { DistanceStep } from './distance-step';
import { InfoStep } from './info-step';
import { PaymentStep } from './payment-step';
import { QuestionsStep } from './questions-step';
import { getStepNumber } from './registration-flow-machine';
import { useRegistrationFlow } from './use-registration-flow';
import { WaiverStep } from './waiver-step';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Info,
  Users,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

type EventDocument = {
  label: string;
  url: string;
};

type RegistrationFlowProps = {
  locale: string;
  event: PublicEventDetail;
  questions: RegistrationQuestionData[];
  addOns: AddOnData[];
  documents: EventDocument[];
  seriesSlug: string;
  editionSlug: string;
  userProfile: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    dateOfBirth: string;
    gender: string;
    emergencyContactName: string;
    emergencyContactPhone: string;
  };
  userId: string;
  showOrganizerSelfRegistrationWarning?: boolean;
  preSelectedDistanceId?: string;
  groupToken?: string;
  existingRegistration?: ActiveRegistrationInfo | null;
  activeInviteExists?: boolean;
  resumeRegistrationId?: string;
  resumeDistanceId?: string;
  resumePricing?: {
    basePriceCents: number | null;
    feesCents: number | null;
    taxCents: number | null;
    totalCents: number | null;
  } | null;
  resumeGroupDiscount?: {
    percentOff: number | null;
    amountCents: number | null;
  } | null;
};

export function RegistrationFlow({
  locale,
  event,
  questions,
  addOns,
  documents,
  seriesSlug,
  editionSlug,
  userProfile,
  showOrganizerSelfRegistrationWarning,
  preSelectedDistanceId,
  groupToken,
  existingRegistration,
  activeInviteExists,
  resumeRegistrationId,
  resumeDistanceId,
  resumePricing,
  resumeGroupDiscount,
}: RegistrationFlowProps) {
  const t = useTranslations('pages.events.register');
  const tDetail = useTranslations('pages.events.detail');
  const tCommon = useTranslations('common');
  const {
    activeAddOns,
    activeQuestions,
    addOnsForm,
    addOnsSubtotalCents,
    addOnOptionDrafts,
    addOnQuantityDrafts,
    allWaiversAccepted,
    appliedDiscountCode,
    basePriceCents,
    currentStepNumber,
    discountAmountCents,
    discountError,
    distanceError,
    feesCents,
    goToNextStep,
    goToPreviousStep,
    groupDiscountAmountCents,
    groupDiscountPercentOff,
    handleApplyDiscountCode,
    handleConfirmDiscountCodeReplacement,
    handleDistanceSelect,
    handleRemoveDiscountCode,
    infoForm,
    isGroupDiscountApplied,
    isPending,
    paymentForm,
    pendingCodeConfirmation,
    policiesAcknowledged,
    progressSteps,
    questionsForm,
    registrationId,
    selectedAddOnItems,
    selectedDistance,
    selectedDistanceId,
    setAddOnOptionDrafts,
    setAddOnQuantityDrafts,
    setPendingCodeConfirmation,
    setPoliciesAcknowledged,
    setSelectedDistanceId,
    showAlreadyRegisteredCta,
    step,
    steps,
    subtotalCents,
    taxCents,
    totalCents,
    waiverForm,
  } = useRegistrationFlow({
    event,
    questions,
    addOns,
    userProfile,
    preSelectedDistanceId,
    groupToken,
    activeInviteExists,
    resumeRegistrationId,
    resumeDistanceId,
    resumePricing,
    resumeGroupDiscount,
  });

  // Format price
  const formatPrice = (cents: number, currency: string) => {
    return formatMoneyFromMinor(cents, currency, locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  };

  const eventDate = event.startsAt
    ? new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: event.timezone,
      }).format(new Date(event.startsAt))
    : null;
  const locationLabel = event.locationDisplay ?? [event.city, event.state].filter(Boolean).join(', ');
  const selectedCurrency = selectedDistance?.currency ?? event.distances[0]?.currency ?? 'MXN';
  const currentStepLabel = step === 'confirmation' ? t('confirmation.title') : t(`steps.${step}`);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
      <AlertDialog
        open={Boolean(pendingCodeConfirmation)}
        onOpenChange={(open) => {
          if (!open) setPendingCodeConfirmation(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('payment.confirmReplaceGroupDiscount.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingCodeConfirmation
                ? t('payment.confirmReplaceGroupDiscount.description', {
                    current: formatPrice(
                      pendingCodeConfirmation.currentTotalCents,
                      selectedDistance?.currency ?? 'MXN',
                    ),
                    next: formatPrice(
                      pendingCodeConfirmation.nextTotalCents,
                      selectedDistance?.currency ?? 'MXN',
                    ),
                    difference: formatPrice(
                      pendingCodeConfirmation.differenceCents,
                      selectedDistance?.currency ?? 'MXN',
                    ),
                  })
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('payment.confirmReplaceGroupDiscount.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDiscountCodeReplacement}
            >
              {t('payment.confirmReplaceGroupDiscount.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="grid gap-6 lg:grid-cols-[minmax(18rem,0.82fr)_minmax(0,1.18fr)] lg:items-start">
        <aside className="space-y-4 lg:sticky lg:top-24">
          <div className="overflow-hidden rounded-[1.9rem] border border-border/45 bg-[color-mix(in_oklch,var(--background)_78%,var(--background-surface)_22%)] shadow-[0_32px_90px_-70px_rgba(15,23,42,0.78)]">
            <div className="border-b border-border/60 bg-[radial-gradient(circle_at_top_left,rgba(51,102,204,0.11),transparent_44%),radial-gradient(circle_at_bottom_right,rgba(30,138,110,0.12),transparent_36%),color-mix(in_oklch,var(--background)_72%,var(--background-surface)_28%)] px-5 py-6 sm:px-6 sm:py-7">
              <Link
                href={{
                  pathname: '/events/[seriesSlug]/[editionSlug]',
                  params: { seriesSlug, editionSlug },
                }}
                className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" />
                {event.seriesName}
              </Link>

              <div className="mt-6 space-y-3">
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  {t('title')}
                </p>
                <h1 className="font-display text-[clamp(2rem,4.8vw,3.25rem)] font-medium leading-[0.9] tracking-[-0.04em] text-foreground">
                  {event.seriesName}
                </h1>
                <p className="text-base leading-7 text-muted-foreground">{event.editionLabel}</p>
              </div>
            </div>

            <div className="space-y-4 px-5 py-5 sm:px-6 sm:py-6">
              {(eventDate || locationLabel) && (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                  {eventDate ? (
                    <div className={publicMutedPanelClassName}>
                      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        {tDetail('eventDate')}
                      </p>
                      <p className="mt-2 text-sm leading-7 text-foreground">{eventDate}</p>
                    </div>
                  ) : null}
                  {locationLabel ? (
                    <div className={publicMutedPanelClassName}>
                      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        {tDetail('location')}
                      </p>
                      <p className="mt-2 text-sm leading-7 text-foreground">{locationLabel}</p>
                    </div>
                  ) : null}
                </div>
              )}

              {selectedDistance ? (
                <div className={publicPanelClassName}>
                  <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {t('confirmation.distance')}
                  </p>
                  <p className="font-display mt-2 text-[1.45rem] font-medium leading-tight tracking-[-0.03em] text-foreground">
                    {selectedDistance.label}
                  </p>
                  <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/60 pt-4 text-sm">
                    <span className="text-muted-foreground">{t('payment.total')}</span>
                    <span className="font-medium text-foreground">
                      {formatPrice(totalCents, selectedCurrency)}
                    </span>
                  </div>
                </div>
              ) : null}

              {step !== 'confirmation' ? (
                <div className={publicPanelClassName}>
                  <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {currentStepLabel}
                  </p>
                  <div className="mt-4 space-y-2">
                    {progressSteps.map((progressStep, index) => {
                      const stepNumber = getStepNumber(steps, progressStep);
                      const isComplete = stepNumber < currentStepNumber;
                      const isCurrent = stepNumber === currentStepNumber;

                      return (
                        <div
                          key={progressStep}
                          className={cn(
                            'flex items-center gap-3 rounded-[1rem] px-3 py-3 text-sm transition-colors',
                            isCurrent
                              ? 'bg-primary/10 text-foreground'
                              : isComplete
                                ? 'bg-[color-mix(in_oklch,var(--background)_84%,var(--background-surface)_16%)] text-foreground'
                                : 'bg-background/88 text-muted-foreground',
                          )}
                        >
                          <div
                            className={cn(
                              'flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                              isCurrent || isComplete
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted text-muted-foreground',
                            )}
                          >
                            {isComplete ? <Check className="h-4 w-4" /> : index + 1}
                          </div>
                          <span>{t(`steps.${progressStep}`)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </aside>

        <div className="space-y-4">
          {existingRegistration && step === 'distance' && (
            <div className="rounded-[1.5rem] border border-info-foreground/30 bg-info p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <Info className="mt-0.5 h-5 w-5 shrink-0 text-info-foreground" />
                <div className="flex-1">
                  <h2 className="font-medium text-info-foreground">{t('alreadyRegistered.title')}</h2>
                  <p className="mt-1 text-sm leading-7 text-info-foreground/90">
                    {t('alreadyRegistered.description', {
                      distanceName: existingRegistration.distanceLabel,
                    })}
                  </p>
                  {existingRegistration.status !== 'confirmed' && (
                    <p className="mt-1 text-sm leading-7 text-info-foreground/80">
                      {t('alreadyRegistered.inProgress', { status: existingRegistration.status })}
                    </p>
                  )}
                  <div className="mt-3">
                    <Button asChild variant="secondary" size="sm">
                      <Link href="/dashboard/my-registrations">
                        {t('alreadyRegistered.viewRegistrations')}
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeInviteExists && step === 'distance' && !existingRegistration && (
            <div className="rounded-[1.5rem] border border-amber-500/35 bg-amber-500/10 p-4 sm:p-5 text-sm">
              <div className="flex items-start gap-3">
                <Users className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <div className="flex-1 text-amber-700 dark:text-amber-200">
                  <p className="font-semibold">{t('errors.activeInviteTitle')}</p>
                  <p className="mt-1 leading-7">{t('errors.activeInvite')}</p>
                </div>
              </div>
            </div>
          )}

          {step === 'distance' && distanceError && (
            <div className="rounded-[1.5rem] border border-destructive/40 bg-destructive/10 p-4 sm:p-5 text-sm text-destructive">
              <p>{distanceError}</p>
              {showAlreadyRegisteredCta ? (
                <div className="mt-3">
                  <Button asChild variant="secondary" size="sm">
                    <Link href="/dashboard/my-registrations">{t('errors.viewMyRegistrations')}</Link>
                  </Button>
                </div>
              ) : null}
            </div>
          )}

          <div className="overflow-hidden rounded-[1.9rem] border border-border/45 bg-[color-mix(in_oklch,var(--background)_79%,var(--background-surface)_21%)] shadow-[0_34px_95px_-76px_rgba(15,23,42,0.82)]">
            <div className="border-b border-border/60 bg-[color-mix(in_oklch,var(--background)_74%,var(--background-surface)_26%)] px-5 py-5 sm:px-7 sm:py-6">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                {t('title')}
              </p>
              <h2 className="font-display mt-3 text-[clamp(1.7rem,3.2vw,2.35rem)] font-medium leading-[0.96] tracking-[-0.03em] text-foreground">
                {event.seriesName} {event.editionLabel}
              </h2>
              {selectedDistance ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span>{selectedDistance.label}</span>
                  <span aria-hidden>&middot;</span>
                  <span>{formatPrice(totalCents, selectedCurrency)}</span>
                </div>
              ) : null}
            </div>

            <div className="px-5 py-5 sm:px-7 sm:py-7">
              {step === 'distance' && (
                <DistanceStep
                  event={event}
                  registrationId={registrationId}
                  existingRegistration={existingRegistration}
                  activeInviteExists={activeInviteExists}
                  selectedDistanceId={selectedDistanceId}
                  setSelectedDistanceId={setSelectedDistanceId}
                  isPending={isPending}
                  showOrganizerSelfRegistrationWarning={showOrganizerSelfRegistrationWarning}
                  formatPrice={formatPrice}
                  onContinue={handleDistanceSelect}
                />
              )}

              {step === 'info' && (
                <InfoStep
                  locale={locale}
                  infoForm={infoForm}
                  isPending={isPending}
                  onBack={resumeRegistrationId ? undefined : () => goToPreviousStep('info')}
                />
              )}

              {step === 'questions' && (
                <QuestionsStep
                  activeQuestions={activeQuestions}
                  questionsForm={questionsForm}
                  isPending={isPending}
                  onBack={() => goToPreviousStep('questions')}
                />
              )}

              {step === 'addons' && (
                <AddOnsStep
                  activeAddOns={activeAddOns}
                  addOnsForm={addOnsForm}
                  addOnOptionDrafts={addOnOptionDrafts}
                  setAddOnOptionDrafts={setAddOnOptionDrafts}
                  addOnQuantityDrafts={addOnQuantityDrafts}
                  setAddOnQuantityDrafts={setAddOnQuantityDrafts}
                  addOnsSubtotalCents={addOnsSubtotalCents}
                  isPending={isPending}
                  currency={selectedDistance?.currency ?? 'MXN'}
                  formatPrice={formatPrice}
                  onBack={() => goToPreviousStep('addons')}
                />
              )}

              {step === 'policies' && event.policyConfig && (
                <div className="space-y-7">
                  <div>
                    <h2 className="font-display text-[clamp(1.5rem,2.9vw,2rem)] font-medium leading-tight tracking-[-0.03em] text-foreground">
                      {t('policies.title')}
                    </h2>
                    <p className="mt-2 text-sm leading-7 text-muted-foreground">
                      {t('policies.description')}
                    </p>
                  </div>

                  <div className={cn(publicMutedPanelClassName, 'space-y-4 text-left')}>
                    <PolicySummary
                      locale={locale}
                      timezone={event.timezone}
                      label={t('confirmation.refundPolicy')}
                      enabled={event.policyConfig.refundsAllowed}
                      text={event.policyConfig.refundPolicyText}
                      deadline={event.policyConfig.refundDeadline}
                    />
                    <PolicySummary
                      locale={locale}
                      timezone={event.timezone}
                      label={t('confirmation.transferPolicy')}
                      enabled={event.policyConfig.transfersAllowed}
                      text={event.policyConfig.transferPolicyText}
                      deadline={event.policyConfig.transferDeadline}
                    />
                    <PolicySummary
                      locale={locale}
                      timezone={event.timezone}
                      label={t('confirmation.deferralPolicy')}
                      enabled={event.policyConfig.deferralsAllowed}
                      text={event.policyConfig.deferralPolicyText}
                      deadline={event.policyConfig.deferralDeadline}
                    />
                  </div>

                  <label className="flex cursor-pointer items-start gap-3 rounded-[1.2rem] border border-border/45 bg-background/90 px-4 py-4">
                    <input
                      type="checkbox"
                      checked={policiesAcknowledged}
                      onChange={(e) => setPoliciesAcknowledged(e.target.checked)}
                      className={publicCheckboxClassName}
                      disabled={isPending}
                    />
                    <span className="text-sm leading-7">{t('policies.acknowledge')}</span>
                  </label>

                  <div
                    className={cn(
                      publicPanelClassName,
                      'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
                    )}
                  >
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => goToPreviousStep('policies')}
                      disabled={isPending}
                    >
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      {tCommon('previous')}
                    </Button>
                    <Button
                      type="button"
                      onClick={() => goToNextStep('policies')}
                      disabled={!policiesAcknowledged || isPending}
                      className="sm:min-w-[10rem]"
                    >
                      <ArrowRight className="h-4 w-4 mr-2" />
                      {t('policies.continue')}
                    </Button>
                  </div>
                </div>
              )}

              {step === 'waiver' && (
                <WaiverStep
                  waivers={event.waivers}
                  waiverForm={waiverForm}
                  allWaiversAccepted={allWaiversAccepted}
                  isPending={isPending}
                  onBack={() => goToPreviousStep('waiver')}
                />
              )}

              {step === 'payment' && (
                <PaymentStep
                  paymentForm={paymentForm}
                  isPending={isPending}
                  selectedDistance={selectedDistance}
                  basePriceCents={basePriceCents}
                  selectedAddOnItems={selectedAddOnItems}
                  addOnsSubtotalCents={addOnsSubtotalCents}
                  subtotalCents={subtotalCents}
                  groupDiscountPercentOff={groupDiscountPercentOff}
                  groupDiscountAmountCents={groupDiscountAmountCents}
                  discountAmountCents={discountAmountCents}
                  feesCents={feesCents}
                  taxCents={taxCents}
                  totalCents={totalCents}
                  appliedDiscountCode={appliedDiscountCode}
                  isGroupDiscountApplied={isGroupDiscountApplied}
                  discountError={discountError}
                  handleApplyDiscountCode={handleApplyDiscountCode}
                  handleRemoveDiscountCode={handleRemoveDiscountCode}
                  formatPrice={formatPrice}
                  seriesSlug={seriesSlug}
                  editionSlug={editionSlug}
                  onBack={() => goToPreviousStep('payment')}
                />
              )}

              {step === 'confirmation' && (
                <ConfirmationStep
                  locale={locale}
                  timezone={event.timezone}
                  registrationId={registrationId}
                  selectedDistanceLabel={selectedDistance?.label ?? null}
                  documents={documents}
                  seriesSlug={seriesSlug}
                  editionSlug={editionSlug}
                  policyConfig={event.policyConfig}
                  labels={{
                    title: t('confirmation.title'),
                    description: t('confirmation.description', {
                      eventName: `${event.seriesName} ${event.editionLabel}`,
                    }),
                    registrationId: t('confirmation.registrationId'),
                    distance: t('confirmation.distance'),
                    whatNext: t('confirmation.whatNext'),
                    nextSteps: t('confirmation.nextSteps'),
                    documents: t('confirmation.documents'),
                    policiesTitle: t('confirmation.policiesTitle'),
                    refundPolicy: t('confirmation.refundPolicy'),
                    transferPolicy: t('confirmation.transferPolicy'),
                    deferralPolicy: t('confirmation.deferralPolicy'),
                    viewEvent: t('confirmation.viewEvent'),
                    backToEvents: t('confirmation.backToEvents'),
                  }}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PolicySummary({
  locale,
  timezone,
  label,
  enabled,
  text,
  deadline,
}: {
  locale: string;
  timezone: string;
  label: string;
  enabled: boolean;
  text: string | null;
  deadline: Date | null;
}) {
  if (!enabled && !text && !deadline) {
    return null;
  }

  const deadlineText = deadline
    ? new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: timezone,
      }).format(new Date(deadline))
    : null;

  return (
    <div className="text-sm text-muted-foreground space-y-1">
      <p className="font-medium text-foreground">{label}</p>
      {text ? (
        <MarkdownContent content={text} className="text-sm text-muted-foreground [&_p]:m-0" />
      ) : null}
      {deadlineText && <p>{deadlineText}</p>}
    </div>
  );
}
