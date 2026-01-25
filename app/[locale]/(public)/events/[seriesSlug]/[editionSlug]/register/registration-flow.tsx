'use client';

import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { FormField } from '@/components/ui/form-field';
import { GenderField } from '@/components/settings/fields/gender-field';
import { PhoneField } from '@/components/settings/fields/phone-field';
import { Link } from '@/i18n/navigation';
import { Form, FormError, useForm } from '@/lib/forms';
import {
  startRegistration,
  submitRegistrantInfo,
  acceptWaiver,
  finalizeRegistration,
} from '@/lib/events/actions';
import { submitAddOnSelections, type AddOnData } from '@/lib/events/add-ons/actions';
import {
  applyDiscountCode,
  removeDiscountCode,
  validateDiscountCode,
} from '@/lib/events/discounts/actions';
import { submitAnswers, type RegistrationQuestionData } from '@/lib/events/questions/actions';
import type { ActiveRegistrationInfo, PublicEventDetail } from '@/lib/events/queries';
import { formatRegistrationTicketCode } from '@/lib/events/tickets';
import { cn } from '@/lib/utils';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle,
  Download,
  FileText,
  Info,
  Loader2,
  Users,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState, useTransition } from 'react';

type Step =
  | 'distance'
  | 'info'
  | 'questions'
  | 'addons'
  | 'policies'
  | 'waiver'
  | 'payment'
  | 'confirmation';

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
  existingRegistration?: ActiveRegistrationInfo | null;
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
  existingRegistration,
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
  const [distanceError, setDistanceError] = useState<string | null>(null);
  const [showAlreadyRegisteredCta, setShowAlreadyRegisteredCta] = useState(false);
  const [registrationPricing, setRegistrationPricing] = useState<{
    basePriceCents: number | null;
    feesCents: number | null;
    taxCents: number | null;
    totalCents: number | null;
  } | null>(null);
  const [policiesAcknowledged, setPoliciesAcknowledged] = useState(false);

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

  const activeQuestions = useMemo(() => {
    if (!selectedDistanceId) return [];
    return questions.filter(
      (question) =>
        question.isActive &&
        (question.distanceId === null || question.distanceId === selectedDistanceId),
    );
  }, [questions, selectedDistanceId]);

  const activeAddOns = useMemo(() => {
    if (!selectedDistanceId) return [];
    return addOns
      .filter(
        (addOn) =>
          addOn.isActive &&
          (addOn.distanceId === null || addOn.distanceId === selectedDistanceId),
      )
      .map((addOn) => ({
        ...addOn,
        options: addOn.options.filter((option) => option.isActive),
      }))
      .filter((addOn) => addOn.options.length > 0);
  }, [addOns, selectedDistanceId]);

  const hasPoliciesStep = useMemo(() => {
    const policy = event.policyConfig;
    if (!policy) return false;
    return (
      policy.refundsAllowed ||
      Boolean(policy.refundPolicyText) ||
      Boolean(policy.refundDeadline) ||
      policy.transfersAllowed ||
      Boolean(policy.transferPolicyText) ||
      Boolean(policy.transferDeadline) ||
      policy.deferralsAllowed ||
      Boolean(policy.deferralPolicyText) ||
      Boolean(policy.deferralDeadline)
    );
  }, [event.policyConfig]);

  const steps = useMemo(() => {
    const nextSteps: Step[] = ['distance', 'info'];
    if (activeQuestions.length > 0) {
      nextSteps.push('questions');
    }
    if (activeAddOns.length > 0) {
      nextSteps.push('addons');
    }
    if (hasPoliciesStep) {
      nextSteps.push('policies');
    }
    if (event.waivers.length > 0) {
      nextSteps.push('waiver');
    }
    nextSteps.push('payment', 'confirmation');
    return nextSteps;
  }, [activeAddOns.length, activeQuestions.length, event.waivers.length, hasPoliciesStep]);

  const progressSteps = steps.filter((s) => s !== 'confirmation');

  type InfoFormValues = {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    dateOfBirth: string;
    gender: string;
    genderDescription: string;
    emergencyContact: string;
    emergencyPhone: string;
    teamName: string;
  };

  const infoForm = useForm<InfoFormValues, void>({
    defaultValues: {
      firstName: userProfile.firstName,
      lastName: userProfile.lastName,
      email: userProfile.email,
      phone: userProfile.phone,
      dateOfBirth: userProfile.dateOfBirth,
      gender: userProfile.gender,
      genderDescription: '',
      emergencyContact: userProfile.emergencyContactName,
      emergencyPhone: userProfile.emergencyContactPhone,
      teamName: '',
    },
    onSubmit: async (values) => {
      if (!registrationId) {
        return { ok: false, error: 'SERVER_ERROR', message: 'Registration not initialized' };
      }

      const result = await submitRegistrantInfo({
        registrationId,
        profileSnapshot: {
          firstName: values.firstName.trim(),
          lastName: values.lastName.trim(),
          email: values.email.trim(),
          dateOfBirth: values.dateOfBirth || new Date().toISOString().split('T')[0],
          gender: values.gender || undefined,
          genderDescription:
            values.gender === 'self_described' ? values.genderDescription.trim() : undefined,
          phone: values.phone.trim() || undefined,
          emergencyContactName: values.emergencyContact.trim() || undefined,
          emergencyContactPhone: values.emergencyPhone.trim() || undefined,
        },
        division: values.teamName.trim() || undefined,
      });

      if (!result.ok) {
        return { ok: false, error: result.code ?? 'SERVER_ERROR', message: result.error };
      }

      return { ok: true, data: undefined };
    },
    onSuccess: () => {
      goToNextStep('info');
    },
  });

  const questionsDefaultValues = useMemo<Record<string, string>>(() => {
    const values: Record<string, string> = {};
    for (const question of questions) {
      values[question.id] = '';
    }
    return values;
  }, [questions]);

  const questionsForm = useForm<Record<string, string>, void>({
    defaultValues: questionsDefaultValues,
    onSubmit: async (values) => {
      if (!registrationId) {
        return { ok: false, error: 'SERVER_ERROR', message: 'Registration not initialized' };
      }

      const answers = activeQuestions.map((question) => {
        if (question.type === 'checkbox') {
          return {
            questionId: question.id,
            value: values[question.id] === 'true' ? 'true' : null,
          };
        }

        const value = values[question.id]?.trim() || null;
        return { questionId: question.id, value };
      });

      const result = await submitAnswers({ registrationId, answers });
      if (!result.ok) {
        return { ok: false, error: result.code ?? 'SERVER_ERROR', message: result.error };
      }

      return { ok: true, data: undefined };
    },
    onSuccess: () => {
      goToNextStep('questions');
    },
  });

  const waiverDefaultValues = useMemo<Record<string, string>>(() => {
    const values: Record<string, string> = {};
    for (const waiver of event.waivers) {
      values[waiver.id] = '';
    }
    return values;
  }, [event.waivers]);

  const waiverForm = useForm<Record<string, string>, void>({
    defaultValues: waiverDefaultValues,
    onSubmit: async (values) => {
      if (!registrationId) {
        return { ok: false, error: 'SERVER_ERROR', message: 'Registration not initialized' };
      }

      for (const waiver of event.waivers) {
        const signatureValue =
          waiver.signatureType === 'checkbox' ? undefined : values[waiver.id]?.trim() || undefined;

        const result = await acceptWaiver({
          registrationId,
          waiverId: waiver.id,
          signatureType: waiver.signatureType as 'checkbox' | 'initials' | 'signature',
          signatureValue,
        });

        if (!result.ok) {
          return { ok: false, error: result.code ?? 'SERVER_ERROR', message: result.error };
        }
      }

      return { ok: true, data: undefined };
    },
    onSuccess: () => {
      goToNextStep('waiver');
    },
  });

  type AddOnSelection = { optionId: string; quantity: number };
  const addOnsDefaultValues = useMemo<Record<string, AddOnSelection | null>>(() => {
    const values: Record<string, AddOnSelection | null> = {};
    for (const addOn of addOns) {
      values[addOn.id] = null;
    }
    return values;
  }, [addOns]);

  const addOnsForm = useForm<Record<string, AddOnSelection | null>, void>({
    defaultValues: addOnsDefaultValues,
    onSubmit: async (values) => {
      if (!registrationId) {
        return { ok: false, error: 'SERVER_ERROR', message: 'Registration not initialized' };
      }

      const selections = Object.values(values)
        .filter((selection): selection is AddOnSelection => selection !== null)
        .map((selection) => ({ optionId: selection.optionId, quantity: selection.quantity }));

      const result = await submitAddOnSelections({ registrationId, selections });
      if (!result.ok) {
        return { ok: false, error: result.code ?? 'SERVER_ERROR', message: result.error };
      }

      return { ok: true, data: undefined };
    },
    onSuccess: () => {
      goToNextStep('addons');
    },
  });

  const [addOnOptionDrafts, setAddOnOptionDrafts] = useState<Record<string, string>>({});
  const [addOnQuantityDrafts, setAddOnQuantityDrafts] = useState<Record<string, number>>({});

  // Discount code
  const [appliedDiscountCode, setAppliedDiscountCode] = useState<string | null>(null);
  const [discountAmountCents, setDiscountAmountCents] = useState(0);
  const [discountError, setDiscountError] = useState<string | null>(null);

  type PaymentFormValues = { discountCode: string };
  const paymentForm = useForm<PaymentFormValues, void>({
    defaultValues: { discountCode: '' },
    onSubmit: async () => {
      if (!registrationId) {
        return { ok: false, error: 'SERVER_ERROR', message: 'Registration not initialized' };
      }

      const result = await finalizeRegistration({ registrationId });
      if (!result.ok) {
        return { ok: false, error: result.code ?? 'SERVER_ERROR', message: result.error };
      }

      return { ok: true, data: undefined };
    },
    onSuccess: () => {
      setStep('confirmation');
    },
  });

  const addOnOptionMap = useMemo(() => {
    const map = new Map<string, { addOnTitle: string; optionLabel: string; priceCents: number }>();
    for (const addOn of activeAddOns) {
      for (const option of addOn.options) {
        map.set(option.id, {
          addOnTitle: addOn.title,
          optionLabel: option.label,
          priceCents: option.priceCents,
        });
      }
    }
    return map;
  }, [activeAddOns]);

  const selectedAddOnItems = useMemo(() => {
    return Object.values(addOnsForm.values)
      .filter((selection): selection is AddOnSelection => selection !== null)
      .map((selection) => {
        const option = addOnOptionMap.get(selection.optionId);
        if (!option) return null;
        return {
          optionId: selection.optionId,
          quantity: selection.quantity,
          addOnTitle: option.addOnTitle,
          optionLabel: option.optionLabel,
          priceCents: option.priceCents,
          lineTotalCents: option.priceCents * selection.quantity,
        };
      })
      .filter(
        (
          item,
        ): item is {
          optionId: string;
          quantity: number;
          addOnTitle: string;
          optionLabel: string;
          priceCents: number;
          lineTotalCents: number;
        } => item !== null,
      );
  }, [addOnOptionMap, addOnsForm.values]);

  const addOnsSubtotalCents = selectedAddOnItems.reduce(
    (total, item) => total + item.lineTotalCents,
    0,
  );

  const basePriceCents =
    registrationPricing?.basePriceCents ?? selectedDistance?.priceCents ?? 0;
  const feesCents = registrationPricing?.feesCents ?? 0;
  const taxCents = registrationPricing?.taxCents ?? 0;
  const subtotalCents = basePriceCents + addOnsSubtotalCents;
  const totalCents = Math.max(0, subtotalCents + feesCents + taxCents - discountAmountCents);

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
      setDistanceError(t('errors.distanceRequired'));
      setShowAlreadyRegisteredCta(false);
      return;
    }
    setDistanceError(null);
    setShowAlreadyRegisteredCta(false);

    startTransition(async () => {
      const result = await startRegistration({
        distanceId: selectedDistanceId,
      });

      if (!result.ok) {
        if (result.code === 'REGISTRATION_CLOSED') {
          setDistanceError(t('errors.registrationClosed'));
          return;
        }

        if (result.code === 'SOLD_OUT') {
          setDistanceError(t('errors.soldOut'));
          return;
        }

        if (result.code === 'ALREADY_REGISTERED') {
          setDistanceError(t('errors.alreadyRegistered'));
          setShowAlreadyRegisteredCta(true);
          return;
        }

        setDistanceError(result.error);
        return;
      }

      setRegistrationId(result.data.id);
      setRegistrationPricing({
        basePriceCents: result.data.basePriceCents,
        feesCents: result.data.feesCents,
        taxCents: result.data.taxCents,
        totalCents: result.data.totalCents,
      });
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

  useEffect(() => {
    for (const question of questions) {
      questionsForm.setFieldValue(question.id, '');
    }
    for (const addOn of addOns) {
      addOnsForm.setFieldValue(addOn.id, null);
    }
    for (const waiver of event.waivers) {
      waiverForm.setFieldValue(waiver.id, '');
    }
    setAddOnOptionDrafts({});
    setAddOnQuantityDrafts({});
    setAppliedDiscountCode(null);
    setDiscountAmountCents(0);
    setDiscountError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDistanceId]);

  useEffect(() => {
    setDiscountError(null);
  }, [paymentForm.values.discountCode]);

  // Check if all waivers are accepted
  const allWaiversAccepted =
    event.waivers.length > 0 &&
    event.waivers.every((waiver) => {
      if (waiver.signatureType === 'checkbox') {
        return waiverForm.values[waiver.id] === 'true';
      }
      return Boolean(waiverForm.values[waiver.id]?.trim());
    });

  async function handleApplyDiscountCode() {
    const code = paymentForm.values.discountCode.trim();
    if (!registrationId || !code) return;
    setDiscountError(null);

    startTransition(async () => {
      const basePriceCents =
        registrationPricing?.basePriceCents ??
        selectedDistance?.priceCents ??
        0;

      const validation = await validateDiscountCode({
        editionId: event.id,
        code,
        basePriceCents,
      });

      if (!validation.ok || !validation.data.valid) {
        setDiscountError(validation.ok ? validation.data.error ?? t('payment.invalidCode') : validation.error);
        return;
      }

      const result = await applyDiscountCode({
        registrationId,
        code,
      });

      if (!result.ok) {
        setDiscountError(result.error);
        return;
      }

      const normalizedCode = validation.data.discountCode?.code ?? code.toUpperCase();
      setAppliedDiscountCode(normalizedCode);
      paymentForm.setFieldValue('discountCode', normalizedCode);
      setDiscountAmountCents(result.data.discountAmountCents);
    });
  }

  async function handleRemoveDiscountCode() {
    if (!registrationId || !appliedDiscountCode) return;
    setDiscountError(null);

    startTransition(async () => {
      const result = await removeDiscountCode({ registrationId });
      if (!result.ok) {
        setDiscountError(result.error);
        return;
      }

      setAppliedDiscountCode(null);
      setDiscountAmountCents(0);
      paymentForm.setFieldValue('discountCode', '');
    });
  }

  const getStepNumber = (s: Step): number => {
    const index = steps.indexOf(s);
    return index === -1 ? 0 : index + 1;
  };

  const goToNextStep = (current: Step) => {
    const index = steps.indexOf(current);
    if (index >= 0 && index < steps.length - 1) {
      setStep(steps[index + 1]);
    }
  };

  const goToPreviousStep = (current: Step) => {
    const index = steps.indexOf(current);
    if (index > 0) {
      setStep(steps[index - 1]);
    }
  };

  const currentStepNumber = getStepNumber(step);

  return (
    <div className="container mx-auto px-4 py-4 sm:py-8 max-w-2xl">
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

      {/* Progress indicator */}
      {step !== 'confirmation' && (
        <div className="mb-4 sm:mb-8">
          <div className="flex items-center justify-between mb-2">
            {progressSteps.map((s, idx) => (
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
                {idx < progressSteps.length - 1 && (
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
                onClick={handleDistanceSelect}
                disabled={!selectedDistanceId || isPending || !!existingRegistration}
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
          <Form form={infoForm} className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold">{t('info.title')}</h2>
              <p className="text-sm text-muted-foreground">{t('info.description')}</p>
            </div>

            <FormError />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label={t('info.firstName')} required error={infoForm.errors.firstName}>
                <input
                  type="text"
                  value={infoForm.values.firstName}
                  onChange={(e) => infoForm.setFieldValue('firstName', e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  disabled={isPending || infoForm.isSubmitting}
                />
              </FormField>

              <FormField label={t('info.lastName')} required error={infoForm.errors.lastName}>
                <input
                  type="text"
                  value={infoForm.values.lastName}
                  onChange={(e) => infoForm.setFieldValue('lastName', e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  disabled={isPending || infoForm.isSubmitting}
                />
              </FormField>

              <FormField label={t('info.email')} required error={infoForm.errors.email}>
                <input
                  type="email"
                  value={infoForm.values.email}
                  onChange={(e) => infoForm.setFieldValue('email', e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  disabled={isPending || infoForm.isSubmitting}
                />
              </FormField>

              <PhoneField
                label={t('info.phone')}
                name="phone"
                value={infoForm.values.phone}
                onChangeAction={(value) => infoForm.setFieldValue('phone', value)}
                disabled={isPending || infoForm.isSubmitting}
              />

              <FormField label={t('info.dateOfBirth')}>
                <DatePicker
                  locale={locale}
                  value={infoForm.values.dateOfBirth}
                  onChangeAction={(value) => infoForm.setFieldValue('dateOfBirth', value)}
                  clearLabel={tCommon('clear')}
                  name="dateOfBirth"
                />
              </FormField>

              <GenderField
                label={t('info.gender')}
                value={infoForm.values.gender}
                description={infoForm.values.genderDescription}
                onChangeAction={(value) => infoForm.setFieldValue('gender', value)}
                onDescriptionChangeAction={(value) => infoForm.setFieldValue('genderDescription', value)}
                options={['female', 'male', 'non_binary', 'prefer_not_to_say', 'self_described']}
                disabled={isPending || infoForm.isSubmitting}
              />

              <FormField label={t('info.emergencyContact')}>
                <input
                  type="text"
                  value={infoForm.values.emergencyContact}
                  onChange={(e) => infoForm.setFieldValue('emergencyContact', e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  disabled={isPending || infoForm.isSubmitting}
                />
              </FormField>

              <PhoneField
                label={t('info.emergencyPhone')}
                name="emergencyPhone"
                value={infoForm.values.emergencyPhone}
                onChangeAction={(value) => infoForm.setFieldValue('emergencyPhone', value)}
                disabled={isPending || infoForm.isSubmitting}
              />
            </div>

            <FormField label={t('info.teamName')}>
              <input
                type="text"
                value={infoForm.values.teamName}
                onChange={(e) => infoForm.setFieldValue('teamName', e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                disabled={isPending || infoForm.isSubmitting}
              />
            </FormField>

            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => goToPreviousStep('info')} disabled={isPending}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Button
                type="submit"
                disabled={
                  !infoForm.values.firstName.trim() ||
                  !infoForm.values.lastName.trim() ||
                  !infoForm.values.email.trim() ||
                  isPending ||
                  infoForm.isSubmitting
                }
              >
                {isPending || infoForm.isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <ArrowRight className="h-4 w-4 mr-2" />
                )}
                {t('info.continue')}
              </Button>
            </div>
          </Form>
        )}

        {/* Questions */}
        {step === 'questions' && (
          <Form form={questionsForm} className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold">{t('questions.title')}</h2>
              <p className="text-sm text-muted-foreground">{t('questions.description')}</p>
            </div>

            <FormError />

            {activeQuestions.length === 0 ? (
              <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
                {t('questions.skipIfNone')}
              </div>
            ) : (
              <div className="space-y-5">
                {activeQuestions.map((question) => (
                  <div key={question.id} className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{question.prompt}</p>
                      <span className="text-xs text-muted-foreground">
                        {question.isRequired ? t('questions.required') : t('questions.optional')}
                      </span>
                    </div>
                    {question.helpText && (
                      <p className="text-sm text-muted-foreground">{question.helpText}</p>
                    )}
                    {question.type === 'text' && (
                      <input
                        type="text"
                        value={questionsForm.values[question.id] ?? ''}
                        onChange={(e) => questionsForm.setFieldValue(question.id, e.target.value)}
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                        disabled={isPending || questionsForm.isSubmitting}
                      />
                    )}
                    {question.type === 'single_select' && (
                      <select
                        value={questionsForm.values[question.id] ?? ''}
                        onChange={(e) => questionsForm.setFieldValue(question.id, e.target.value)}
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                        disabled={isPending || questionsForm.isSubmitting}
                      >
                        <option value="">{t('addons.selectOption')}</option>
                        {question.options?.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    )}
                    {question.type === 'checkbox' && (
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={questionsForm.values[question.id] === 'true'}
                          onChange={(e) =>
                            questionsForm.setFieldValue(question.id, e.target.checked ? 'true' : '')
                          }
                          className="h-4 w-4 rounded border-gray-300"
                          disabled={isPending || questionsForm.isSubmitting}
                        />
                        {question.isRequired ? t('questions.required') : t('questions.optional')}
                      </label>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-between">
              <Button
                type="button"
                variant="ghost"
                onClick={() => goToPreviousStep('questions')}
                disabled={isPending || questionsForm.isSubmitting}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Button
                type="submit"
                disabled={isPending || questionsForm.isSubmitting}
              >
                {isPending || questionsForm.isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <ArrowRight className="h-4 w-4 mr-2" />
                )}
                {t('questions.continue')}
              </Button>
            </div>
          </Form>
        )}

        {/* Add-ons */}
        {step === 'addons' && (
          <Form form={addOnsForm} className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold">{t('addons.title')}</h2>
              <p className="text-sm text-muted-foreground">{t('addons.description')}</p>
            </div>

            <FormError />

            {activeAddOns.length === 0 ? (
              <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
                {t('addons.noAddons')}
              </div>
            ) : (
              <div className="space-y-5">
                {activeAddOns.map((addOn) => {
                  const currentSelection = addOnsForm.values[addOn.id];
                  const draftOptionId =
                    addOnOptionDrafts[addOn.id] ??
                    currentSelection?.optionId ??
                    '';
                  const draftQuantity =
                    addOnQuantityDrafts[addOn.id] ??
                    currentSelection?.quantity ??
                    1;
                  const selectedOption = addOn.options.find((opt) => opt.id === draftOptionId);
                  const isSameSelection =
                    currentSelection?.optionId === draftOptionId &&
                    currentSelection?.quantity === draftQuantity;

                  return (
                    <div key={addOn.id} className="rounded-lg border p-4 space-y-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-medium">{addOn.title}</h3>
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            {addOn.type === 'donation' ? t('addons.donation') : t('addons.merchandise')}
                          </span>
                          {addOn.deliveryMethod !== 'none' && (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                              {addOn.deliveryMethod === 'shipping'
                                ? t('addons.deliveryMethods.shipping')
                                : t('addons.deliveryMethods.pickup')}
                            </span>
                          )}
                        </div>
                        {addOn.description && (
                          <p className="text-sm text-muted-foreground mt-1">{addOn.description}</p>
                        )}
                      </div>

                      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] items-center">
                        <select
                          value={draftOptionId}
                          onChange={(e) =>
                            setAddOnOptionDrafts((prev) => ({
                              ...prev,
                              [addOn.id]: e.target.value,
                            }))
                          }
                          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                          disabled={isPending || addOnsForm.isSubmitting}
                        >
                          <option value="">{t('addons.selectOption')}</option>
                          {addOn.options.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.label} ({formatPrice(option.priceCents, selectedDistance?.currency ?? 'MXN')})
                            </option>
                          ))}
                        </select>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">{t('addons.quantity')}</span>
                          <select
                            value={draftQuantity}
                            onChange={(e) =>
                              setAddOnQuantityDrafts((prev) => ({
                                ...prev,
                                [addOn.id]: Number(e.target.value),
                              }))
                            }
                            className="rounded-md border bg-background px-2 py-2 text-sm"
                            disabled={isPending || addOnsForm.isSubmitting}
                          >
                            {Array.from(
                              { length: selectedOption?.maxQtyPerOrder ?? 5 },
                              (_, idx) => idx + 1,
                            ).map((qty) => (
                              <option key={qty} value={qty}>
                                {qty}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex items-center justify-end gap-2">
                          {currentSelection && isSameSelection ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => addOnsForm.setFieldValue(addOn.id, null)}
                              disabled={isPending || addOnsForm.isSubmitting}
                            >
                              {t('addons.removeFromOrder')}
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              onClick={() =>
                                addOnsForm.setFieldValue(addOn.id, {
                                  optionId: draftOptionId,
                                  quantity: draftQuantity,
                                })
                              }
                              disabled={isPending || addOnsForm.isSubmitting || !draftOptionId}
                            >
                              {t('addons.addToOrder')}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {addOnsSubtotalCents > 0 && (
              <div className="rounded-lg border bg-muted/40 p-4 text-sm flex justify-between">
                <span className="text-muted-foreground">{t('addons.subtotal')}</span>
                <span className="font-medium">
                  {formatPrice(addOnsSubtotalCents, selectedDistance?.currency ?? 'MXN')}
                </span>
              </div>
            )}

            <div className="flex justify-between">
              <Button
                type="button"
                variant="ghost"
                onClick={() => goToPreviousStep('addons')}
                disabled={isPending || addOnsForm.isSubmitting}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Button type="submit" disabled={isPending || addOnsForm.isSubmitting}>
                {isPending || addOnsForm.isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <ArrowRight className="h-4 w-4 mr-2" />
                )}
                {t('addons.continue')}
              </Button>
            </div>
          </Form>
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
          <Form form={waiverForm} className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold">{t('waiver.title')}</h2>
              <p className="text-sm text-muted-foreground">{t('waiver.description')}</p>
            </div>

            <FormError />

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
                        checked={waiverForm.values[waiver.id] === 'true'}
                        onChange={(e) =>
                          waiverForm.setFieldValue(waiver.id, e.target.checked ? 'true' : '')
                        }
                        className="mt-1 h-4 w-4 rounded border-gray-300"
                        disabled={isPending || waiverForm.isSubmitting}
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
                        value={waiverForm.values[waiver.id] ?? ''}
                        onChange={(e) => waiverForm.setFieldValue(waiver.id, e.target.value)}
                        placeholder={
                          waiverSignaturePlaceholders[
                            waiver.signatureType as keyof typeof waiverSignaturePlaceholders
                          ]
                        }
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                        disabled={isPending || waiverForm.isSubmitting}
                      />
                    </div>
                  )}
                </label>
              </div>
            ))}

            <div className="flex justify-between">
              <Button
                type="button"
                variant="ghost"
                onClick={() => goToPreviousStep('waiver')}
                disabled={isPending || waiverForm.isSubmitting}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Button
                type="submit"
                disabled={!allWaiversAccepted || isPending || waiverForm.isSubmitting}
              >
                {isPending || waiverForm.isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <ArrowRight className="h-4 w-4 mr-2" />
                )}
                {t('waiver.continue')}
              </Button>
            </div>
          </Form>
        )}

        {/* Payment */}
        {step === 'payment' && (
          <Form form={paymentForm} className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold">{t('payment.title')}</h2>
              <p className="text-sm text-muted-foreground">{t('payment.description')}</p>
            </div>

            <FormError />

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
                  {formatPrice(basePriceCents, selectedDistance?.currency ?? 'MXN')}
                </span>
              </div>
              {selectedAddOnItems.length > 0 && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t('payment.addons')}</span>
                    <span>{formatPrice(addOnsSubtotalCents, selectedDistance?.currency ?? 'MXN')}</span>
                  </div>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    {selectedAddOnItems.map((item) => (
                      <div key={item.optionId} className="flex justify-between">
                        <span>
                          {item.addOnTitle} · {item.optionLabel} × {item.quantity}
                        </span>
                        <span>
                          {formatPrice(item.lineTotalCents, selectedDistance?.currency ?? 'MXN')}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('payment.subtotal')}</span>
                <span>{formatPrice(subtotalCents, selectedDistance?.currency ?? 'MXN')}</span>
              </div>
              {discountAmountCents > 0 && (
                <div className="flex justify-between text-sm text-green-700">
                  <span>{t('payment.discount')}</span>
                  <span>-{formatPrice(discountAmountCents, selectedDistance?.currency ?? 'MXN')}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('payment.fees')}</span>
                <span>{formatPrice(feesCents, selectedDistance?.currency ?? 'MXN')}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('payment.tax')}</span>
                <span>{formatPrice(taxCents, selectedDistance?.currency ?? 'MXN')}</span>
              </div>
              <div className="border-t pt-3 flex justify-between font-semibold">
                <span>{t('payment.total')}</span>
                <span>{formatPrice(totalCents, selectedDistance?.currency ?? 'MXN')}</span>
              </div>
            </div>

            {/* Discount code */}
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">{t('payment.discountCode')}</h3>
                {appliedDiscountCode && (
                  <span className="text-sm text-green-700">
                    {t('payment.codeApplied', { code: appliedDiscountCode })}
                  </span>
                )}
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={paymentForm.values.discountCode}
                  onChange={(e) => paymentForm.setFieldValue('discountCode', e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  placeholder={t('payment.discountCode')}
                  disabled={isPending || paymentForm.isSubmitting || !!appliedDiscountCode}
                />
                {appliedDiscountCode ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleRemoveDiscountCode}
                    disabled={isPending || paymentForm.isSubmitting}
                  >
                    {t('payment.removeCode')}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={handleApplyDiscountCode}
                    disabled={isPending || paymentForm.isSubmitting || !paymentForm.values.discountCode.trim()}
                  >
                    {t('payment.applyCode')}
                  </Button>
                )}
              </div>
              {discountError && (
                <p className="text-sm text-destructive">{discountError}</p>
              )}
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
              <Button
                type="button"
                variant="ghost"
                onClick={() => goToPreviousStep('payment')}
                disabled={isPending || paymentForm.isSubmitting}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Button type="submit" disabled={isPending || paymentForm.isSubmitting}>
                {isPending || paymentForm.isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Check className="h-4 w-4 mr-2" />
                )}
                {t('payment.complete')}
              </Button>
            </div>
          </Form>
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

            {/* Event Documents */}
            {documents.length > 0 && (
              <div className="rounded-lg border bg-muted/40 p-4 text-left space-y-3">
                <h3 className="font-medium flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  {t('confirmation.documents')}
                </h3>
                <div className="space-y-2">
                  {documents.map((doc, index) => (
                    <a
                      key={index}
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors group"
                    >
                      <FileText className="h-5 w-5 text-primary flex-shrink-0" />
                      <span className="text-sm font-medium flex-1">{doc.label}</span>
                      <Download className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                    </a>
                  ))}
                </div>
              </div>
            )}

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
