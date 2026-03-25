'use client';

import { Button } from '@/components/ui/button';
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

  return (
    <div className="container mx-auto px-4 py-4 sm:py-8 max-w-2xl">
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

      {/* Header */}
      <div className="mb-4 sm:mb-8">
        <Link
          href={{
            pathname: '/events/[seriesSlug]/[editionSlug]',
            params: { seriesSlug, editionSlug },
          }}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          {event.seriesName}
        </Link>
        <h1 className="text-2xl font-bold">
          {t('title')} - {event.seriesName} {event.editionLabel}
        </h1>
      </div>

      {/* Already registered banner */}
      {existingRegistration && step === 'distance' && (
        <div className="mb-6 rounded-lg border border-info-foreground/30 bg-info p-4">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-info-foreground mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="font-semibold text-info-foreground">
                {t('alreadyRegistered.title')}
              </h3>
              <p className="text-sm text-info-foreground/90 mt-1">
                {t('alreadyRegistered.description', { distanceName: existingRegistration.distanceLabel })}
              </p>
              {existingRegistration.status !== 'confirmed' && (
                <p className="text-sm text-info-foreground/80 mt-1">
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
        <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <div className="flex items-start gap-3">
            <Users className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1 text-amber-700 dark:text-amber-200">
              <p className="font-semibold">{t('errors.activeInviteTitle')}</p>
              <p className="mt-1">{t('errors.activeInvite')}</p>
            </div>
          </div>
        </div>
      )}

      {/* Progress indicator */}
      {step !== 'confirmation' && (
        <div className="mb-4 sm:mb-8">
          <div className="flex items-center justify-between mb-2">
            {progressSteps.map((s, idx) => (
              <div key={s} className="flex items-center">
                <div
                  className={cn(
                    'h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors',
                    getStepNumber(steps, s) < currentStepNumber
                      ? 'bg-primary text-primary-foreground'
                      : getStepNumber(steps, s) === currentStepNumber
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground',
                  )}
                >
                  {getStepNumber(steps, s) < currentStepNumber ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    idx + 1
                  )}
                </div>
                {idx < progressSteps.length - 1 && (
                  <div
                    className={cn(
                      'h-1 w-12 sm:w-20 mx-1',
                      getStepNumber(steps, s) < currentStepNumber ? 'bg-primary' : 'bg-muted',
                    )}
                  />
                )}
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-muted-foreground">
            {t(`steps.${step}`)}
          </p>
        </div>
      )}

      {/* Error display (distance step only) */}
      {step === 'distance' && distanceError && (
        <div className="mb-6 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
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

      {/* Step content */}
      <div className="rounded-lg border bg-card p-4 sm:p-6 shadow-sm">
        {/* Distance selection */}
        {step === 'distance' && (
          <DistanceStep
            event={event}
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

        {/* Participant info */}
        {step === 'info' && (
          <InfoStep
            locale={locale}
            infoForm={infoForm}
            isPending={isPending}
            onBack={() => goToPreviousStep('info')}
          />
        )}

        {/* Questions */}
        {step === 'questions' && (
          <QuestionsStep
            activeQuestions={activeQuestions}
            questionsForm={questionsForm}
            isPending={isPending}
            onBack={() => goToPreviousStep('questions')}
          />
        )}

        {/* Add-ons */}
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

        {/* Policies */}
        {step === 'policies' && event.policyConfig && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold">{t('policies.title')}</h2>
              <p className="text-sm text-muted-foreground">{t('policies.description')}</p>
            </div>

            <div className="rounded-lg border bg-muted/40 p-4 text-left space-y-3">
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

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={policiesAcknowledged}
                onChange={(e) => setPoliciesAcknowledged(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-gray-300"
                disabled={isPending}
              />
              <span className="text-sm">{t('policies.acknowledge')}</span>
            </label>

            <div className="flex justify-between">
              <Button
                type="button"
                variant="ghost"
                onClick={() => goToPreviousStep('policies')}
                disabled={isPending}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Button
                type="button"
                onClick={() => goToNextStep('policies')}
                disabled={!policiesAcknowledged || isPending}
              >
                <ArrowRight className="h-4 w-4 mr-2" />
                {t('policies.continue')}
              </Button>
            </div>
          </div>
        )}

        {/* Waiver */}
        {step === 'waiver' && (
          <WaiverStep
            waivers={event.waivers}
            waiverForm={waiverForm}
            allWaiversAccepted={allWaiversAccepted}
            isPending={isPending}
            onBack={() => goToPreviousStep('waiver')}
          />
        )}

        {/* Payment */}
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

        {/* Confirmation */}
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
