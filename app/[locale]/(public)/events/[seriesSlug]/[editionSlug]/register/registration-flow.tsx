'use client';

import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { FormField } from '@/components/ui/form-field';
import { GenderField } from '@/components/settings/fields/gender-field';
import { PhoneField } from '@/components/settings/fields/phone-field';
import { Link } from '@/i18n/navigation';
import {
  startRegistration,
  submitRegistrantInfo,
  acceptWaiver,
  finalizeRegistration,
} from '@/lib/events/actions';
import type { PublicEventDetail } from '@/lib/events/queries';
import { formatRegistrationTicketCode } from '@/lib/events/tickets';
import { cn } from '@/lib/utils';
import { ArrowLeft, ArrowRight, Check, CheckCircle, Loader2, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition, useEffect } from 'react';

type Step = 'distance' | 'info' | 'waiver' | 'payment' | 'confirmation';

type RegistrationFlowProps = {
  locale: string;
  event: PublicEventDetail;
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
};

export function RegistrationFlow({
  locale,
  event,
  seriesSlug,
  editionSlug,
  userProfile,
  showOrganizerSelfRegistrationWarning,
  preSelectedDistanceId,
}: RegistrationFlowProps) {
  const t = useTranslations('pages.events.register');
  const tDetail = useTranslations('pages.events.detail');
  const tCommon = useTranslations('common');
  const waiverSignatureLabels = {
    initials: t('waiver.signatureLabels.initials'),
    signature: t('waiver.signatureLabels.signature'),
  } as const;
  const waiverSignaturePlaceholders = {
    initials: t('waiver.signaturePlaceholders.initials'),
    signature: t('waiver.signaturePlaceholders.signature'),
  } as const;
  const [isPending, startTransition] = useTransition();

  // Flow state
  const [step, setStep] = useState<Step>('distance');
  const [registrationId, setRegistrationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAlreadyRegisteredCta, setShowAlreadyRegisteredCta] = useState(false);

  // Validate that preSelectedDistanceId exists in event.distances and is not sold out
  const validPreSelectedId =
    preSelectedDistanceId &&
    event.distances.some(
      (d) =>
        d.id === preSelectedDistanceId &&
        (d.spotsRemaining === null || d.spotsRemaining > 0),
    )
      ? preSelectedDistanceId
      : null;

  // Distance selection
  const [selectedDistanceId, setSelectedDistanceId] = useState<string | null>(validPreSelectedId);
  const selectedDistance = event.distances.find((d) => d.id === selectedDistanceId);

  // Participant info - prefilled from user profile
  const [firstName, setFirstName] = useState(userProfile.firstName);
  const [lastName, setLastName] = useState(userProfile.lastName);
  const [email, setEmail] = useState(userProfile.email);
  const [phone, setPhone] = useState(userProfile.phone);
  const [dateOfBirth, setDateOfBirth] = useState(userProfile.dateOfBirth);
  const [gender, setGender] = useState(userProfile.gender);
  const [genderDescription, setGenderDescription] = useState('');
  const [emergencyContact, setEmergencyContact] = useState(userProfile.emergencyContactName);
  const [emergencyPhone, setEmergencyPhone] = useState(userProfile.emergencyContactPhone);
  const [teamName, setTeamName] = useState('');

  // Waiver tracking - map of waiverId -> accepted status
  const [acceptedWaivers, setAcceptedWaivers] = useState<Record<string, boolean>>({});
  const [waiverSignatures, setWaiverSignatures] = useState<Record<string, string>>({});

  // Format price
  const formatPrice = (cents: number, currency: string) => {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(cents / 100);
  };

  // Step handlers
  async function handleDistanceSelect() {
    if (!selectedDistanceId) {
      setError(t('errors.distanceRequired'));
      setShowAlreadyRegisteredCta(false);
      return;
    }
    setError(null);
    setShowAlreadyRegisteredCta(false);

    startTransition(async () => {
      const result = await startRegistration({
        distanceId: selectedDistanceId,
      });

      if (!result.ok) {
        if (result.code === 'REGISTRATION_CLOSED') {
          setError(t('errors.registrationClosed'));
          return;
        }

        if (result.code === 'SOLD_OUT') {
          setError(t('errors.soldOut'));
          return;
        }

        if (result.code === 'ALREADY_REGISTERED') {
          setError(t('errors.alreadyRegistered'));
          setShowAlreadyRegisteredCta(true);
          return;
        }

        setError(result.error);
        return;
      }

      setRegistrationId(result.data.id);
      setStep('info');
    });
  }

  // Auto-advance to step 2 if a valid distance was pre-selected
  useEffect(() => {
    if (validPreSelectedId && step === 'distance' && !registrationId) {
      handleDistanceSelect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on mount

  async function handleInfoSubmit() {
    if (!registrationId) return;
    setError(null);

    startTransition(async () => {
      const result = await submitRegistrantInfo({
        registrationId,
        profileSnapshot: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          dateOfBirth: dateOfBirth || new Date().toISOString().split('T')[0], // Required field
          gender: gender || undefined,
          genderDescription: gender === 'self_described' ? genderDescription.trim() : undefined,
          phone: phone.trim() || undefined,
          emergencyContactName: emergencyContact.trim() || undefined,
          emergencyContactPhone: emergencyPhone.trim() || undefined,
        },
        division: teamName.trim() || undefined,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      // If event has waivers, go to waiver step, otherwise go to payment
      if (event.waivers.length > 0) {
        setStep('waiver');
      } else {
        setStep('payment');
      }
    });
  }

  // Check if all waivers are accepted
  const allWaiversAccepted =
    event.waivers.length > 0 &&
    event.waivers.every((waiver) => {
      if (waiver.signatureType === 'checkbox') {
        return acceptedWaivers[waiver.id];
      }
      return Boolean(waiverSignatures[waiver.id]?.trim());
    });

  async function handleWaiverAccept() {
    if (!registrationId || !allWaiversAccepted) return;
    setError(null);

    startTransition(async () => {
      // Accept each waiver sequentially
      for (const waiver of event.waivers) {
        const result = await acceptWaiver({
          registrationId,
          waiverId: waiver.id,
          signatureType: waiver.signatureType as 'checkbox' | 'initials' | 'signature',
          signatureValue:
            waiver.signatureType === 'checkbox'
              ? undefined
              : waiverSignatures[waiver.id]?.trim() || undefined,
        });

        if (!result.ok) {
          setError(result.error);
          return;
        }
      }

      setStep('payment');
    });
  }

  async function handlePaymentComplete() {
    if (!registrationId) return;
    setError(null);

    startTransition(async () => {
      const result = await finalizeRegistration({
        registrationId,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setStep('confirmation');
    });
  }

  // Get step number for progress indicator
  const getStepNumber = (s: Step): number => {
    const steps: Step[] = ['distance', 'info', 'waiver', 'payment', 'confirmation'];
    return steps.indexOf(s) + 1;
  };

  const currentStepNumber = getStepNumber(step);

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      {/* Header */}
      <div className="mb-8">
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

      {/* Progress indicator */}
      {step !== 'confirmation' && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            {(['distance', 'info', 'waiver', 'payment'] as const).map((s, idx) => (
              <div key={s} className="flex items-center">
                <div
                  className={cn(
                    'h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors',
                    getStepNumber(s) < currentStepNumber
                      ? 'bg-primary text-primary-foreground'
                      : getStepNumber(s) === currentStepNumber
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground',
                  )}
                >
                  {getStepNumber(s) < currentStepNumber ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    idx + 1
                  )}
                </div>
                {idx < 3 && (
                  <div
                    className={cn(
                      'h-1 w-12 sm:w-20 mx-1',
                      getStepNumber(s) < currentStepNumber ? 'bg-primary' : 'bg-muted',
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

  {/* Error display */}
  {error && (
    <div className="mb-6 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
      <p>{error}</p>
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
      <div className="rounded-lg border bg-card p-6 shadow-sm">
        {/* Distance selection */}
        {step === 'distance' && (
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

            {/* Shared capacity info */}
            {event.sharedCapacity &&
              event.distances.some((d) => d.capacityScope === 'shared_pool') && (
                <div className="rounded-lg border bg-muted/40 p-3 mb-4">
                  <p className="text-sm text-muted-foreground">
                    {tDetail('capacity.totalSharedCapacity', { total: event.sharedCapacity })}
                  </p>
                </div>
              )}

            <div className="space-y-3">
              {event.distances.map((distance) => {
                const isSoldOut =
                  distance.spotsRemaining !== null && distance.spotsRemaining <= 0;

                return (
                  <button
                    key={distance.id}
                    type="button"
                    onClick={() => !isSoldOut && setSelectedDistanceId(distance.id)}
                    disabled={isSoldOut || isPending}
                    className={cn(
                      'w-full text-left rounded-lg border p-4 transition-all',
                      selectedDistanceId === distance.id
                        ? 'border-primary bg-primary/5 ring-2 ring-primary'
                        : 'border-border hover:border-primary/50',
                      isSoldOut && 'opacity-50 cursor-not-allowed',
                    )}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-medium">{distance.label}</h3>
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
                onClick={handleDistanceSelect}
                disabled={!selectedDistanceId || isPending}
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
        )}

        {/* Participant info */}
        {step === 'info' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold">{t('info.title')}</h2>
              <p className="text-sm text-muted-foreground">{t('info.description')}</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label={t('info.firstName')} required>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  disabled={isPending}
                />
              </FormField>

              <FormField label={t('info.lastName')} required>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  disabled={isPending}
                />
              </FormField>

              <FormField label={t('info.email')} required>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  disabled={isPending}
                />
              </FormField>

              <PhoneField
                label={t('info.phone')}
                name="phone"
                value={phone}
                onChangeAction={setPhone}
                disabled={isPending}
              />

              <FormField label={t('info.dateOfBirth')}>
                <DatePicker
                  locale={locale}
                  value={dateOfBirth}
                  onChangeAction={setDateOfBirth}
                  clearLabel={tCommon('clear')}
                  name="dateOfBirth"
                />
              </FormField>

              <GenderField
                label={t('info.gender')}
                value={gender}
                description={genderDescription}
                onChangeAction={setGender}
                onDescriptionChangeAction={setGenderDescription}
                options={['female', 'male', 'non_binary', 'prefer_not_to_say', 'self_described']}
                disabled={isPending}
              />

              <FormField label={t('info.emergencyContact')}>
                <input
                  type="text"
                  value={emergencyContact}
                  onChange={(e) => setEmergencyContact(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  disabled={isPending}
                />
              </FormField>

              <PhoneField
                label={t('info.emergencyPhone')}
                name="emergencyPhone"
                value={emergencyPhone}
                onChangeAction={setEmergencyPhone}
                disabled={isPending}
              />
            </div>

            <FormField label={t('info.teamName')}>
              <input
                type="text"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                disabled={isPending}
              />
            </FormField>

            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep('distance')} disabled={isPending}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Button
                onClick={handleInfoSubmit}
                disabled={!firstName.trim() || !lastName.trim() || !email.trim() || isPending}
              >
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <ArrowRight className="h-4 w-4 mr-2" />
                )}
                {t('info.continue')}
              </Button>
            </div>
          </div>
        )}

        {/* Waiver */}
        {step === 'waiver' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold">{t('waiver.title')}</h2>
              <p className="text-sm text-muted-foreground">{t('waiver.description')}</p>
            </div>

            {/* Render each waiver */}
            {event.waivers.map((waiver, index) => (
              <div key={waiver.id} className="space-y-3">
                {event.waivers.length > 1 && (
                  <h3 className="font-medium text-sm text-muted-foreground">
                    {t('waiver.waiverNumber', { number: index + 1, total: event.waivers.length })}
                  </h3>
                )}
                <h4 className="font-medium">{waiver.title}</h4>
                <div className="rounded-lg border bg-muted/50 p-4 max-h-64 overflow-y-auto">
                  <p className="text-sm whitespace-pre-wrap">{waiver.body}</p>
                </div>
                <label className="flex items-start gap-3 cursor-pointer">
                  {waiver.signatureType === 'checkbox' ? (
                    <>
                      <input
                        type="checkbox"
                        checked={acceptedWaivers[waiver.id] ?? false}
                        onChange={(e) =>
                          setAcceptedWaivers((prev) => ({
                            ...prev,
                            [waiver.id]: e.target.checked,
                          }))
                        }
                        className="mt-1 h-4 w-4 rounded border-gray-300"
                        disabled={isPending}
                      />
                      <span className="text-sm">
                        {t('waiver.acceptThis', { title: waiver.title })}
                      </span>
                    </>
                  ) : (
                    <div className="space-y-2 w-full">
                      <span className="text-sm">
                        {
                          waiverSignatureLabels[
                            waiver.signatureType as keyof typeof waiverSignatureLabels
                          ]
                        }
                      </span>
                      <input
                        type="text"
                        value={waiverSignatures[waiver.id] ?? ''}
                        onChange={(e) =>
                          setWaiverSignatures((prev) => ({
                            ...prev,
                            [waiver.id]: e.target.value,
                          }))
                        }
                        placeholder={
                          waiverSignaturePlaceholders[
                            waiver.signatureType as keyof typeof waiverSignaturePlaceholders
                          ]
                        }
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                        disabled={isPending}
                      />
                    </div>
                  )}
                </label>
              </div>
            ))}

            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep('info')} disabled={isPending}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Button onClick={handleWaiverAccept} disabled={!allWaiversAccepted || isPending}>
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <ArrowRight className="h-4 w-4 mr-2" />
                )}
                {t('waiver.continue')}
              </Button>
            </div>
          </div>
        )}

        {/* Payment */}
        {step === 'payment' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold">{t('payment.title')}</h2>
              <p className="text-sm text-muted-foreground">{t('payment.description')}</p>
            </div>

            {/* Order summary */}
            <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
              <h3 className="font-medium">{t('payment.summary')}</h3>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('payment.distance')}</span>
                <span>{selectedDistance?.label}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('payment.price')}</span>
                <span>
                  {selectedDistance
                    ? formatPrice(selectedDistance.priceCents, selectedDistance.currency)
                    : '-'}
                </span>
              </div>
              <div className="border-t pt-3 flex justify-between font-semibold">
                <span>{t('payment.total')}</span>
                <span>
                  {selectedDistance
                    ? formatPrice(selectedDistance.priceCents, selectedDistance.currency)
                    : '-'}
                </span>
              </div>
            </div>

            {/* Phase 1: Payment placeholder */}
            <div className="rounded-lg border border-dashed p-6 text-center">
              <p className="text-muted-foreground mb-4">{t('payment.comingSoon')}</p>
              <Button variant="outline" asChild>
                <Link
                  href={{
                    pathname: '/events/[seriesSlug]/[editionSlug]',
                    params: { seriesSlug, editionSlug },
                  }}
                >
                  {t('payment.contactOrganizer')}
                </Link>
              </Button>
            </div>

            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep('waiver')} disabled={isPending}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Button onClick={handlePaymentComplete} disabled={isPending}>
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Check className="h-4 w-4 mr-2" />
                )}
                {t('payment.complete')}
              </Button>
            </div>
          </div>
        )}

        {/* Confirmation */}
        {step === 'confirmation' && (
          <div className="text-center space-y-6 py-6">
            <div className="mx-auto h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>

            <div>
              <h2 className="text-2xl font-bold">{t('confirmation.title')}</h2>
              <p className="text-muted-foreground mt-2">
                {t('confirmation.description', {
                  eventName: `${event.seriesName} ${event.editionLabel}`,
                })}
              </p>
            </div>

            {registrationId && (
              <div className="rounded-lg bg-muted/50 p-4 text-sm">
                <p className="text-muted-foreground">{t('confirmation.registrationId')}</p>
                <p className="font-mono font-semibold">
                  {formatRegistrationTicketCode(registrationId)}
                </p>
              </div>
            )}

            {selectedDistance && (
              <div className="text-sm">
                <span className="text-muted-foreground">{t('confirmation.distance')}: </span>
                <span className="font-medium">{selectedDistance.label}</span>
              </div>
            )}

            <div className="space-y-2">
              <h3 className="font-medium">{t('confirmation.whatNext')}</h3>
              <p className="text-sm text-muted-foreground">{t('confirmation.nextSteps')}</p>
            </div>

            {event.policyConfig && (
              <div className="rounded-lg border bg-muted/40 p-4 text-left space-y-3">
                <h3 className="font-medium">{t('confirmation.policiesTitle')}</h3>
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
            )}

            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
              <Button asChild>
                <Link
                  href={{
                    pathname: '/events/[seriesSlug]/[editionSlug]',
                    params: { seriesSlug, editionSlug },
                  }}
                >
                  {t('confirmation.viewEvent')}
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/events">{t('confirmation.backToEvents')}</Link>
              </Button>
            </div>
          </div>
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
      {text && <p className="whitespace-pre-wrap">{text}</p>}
      {deadlineText && <p>{deadlineText}</p>}
    </div>
  );
}
