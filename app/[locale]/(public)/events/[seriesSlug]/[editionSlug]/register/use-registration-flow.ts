'use client';

import { useForm } from '@/lib/forms';
import {
  acceptWaiver,
  finalizeRegistration,
  startRegistration,
  submitRegistrantInfo,
} from '@/lib/events/actions';
import { submitAddOnSelections, type AddOnData } from '@/lib/events/add-ons/actions';
import {
  applyDiscountCode,
  removeDiscountCode,
  validateDiscountCode,
} from '@/lib/events/discounts/actions';
import { submitAnswers, type RegistrationQuestionData } from '@/lib/events/questions/actions';
import type { ActiveRegistrationInfo, PublicEventDetail } from '@/lib/events/queries';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState, useTransition } from 'react';
import {
  buildRegistrationSteps,
  getNextStep,
  getPreviousStep,
  getProgressSteps,
  getStepNumber,
  hasPoliciesStep as shouldShowPoliciesStep,
  type RegistrationFlowStep,
} from './registration-flow-machine';

type Step = RegistrationFlowStep;

type RegistrationFlowUserProfile = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  gender: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
};

type RegistrationPricing = {
  basePriceCents: number | null;
  feesCents: number | null;
  taxCents: number | null;
  totalCents: number | null;
};

type RegistrationGroupDiscount = {
  percentOff: number | null;
  amountCents: number | null;
};

type UseRegistrationFlowArgs = {
  event: PublicEventDetail;
  questions: RegistrationQuestionData[];
  addOns: AddOnData[];
  userProfile: RegistrationFlowUserProfile;
  preSelectedDistanceId?: string;
  groupToken?: string;
  activeInviteExists?: boolean;
  existingRegistration?: ActiveRegistrationInfo | null;
  resumeRegistrationId?: string;
  resumeDistanceId?: string;
  resumePricing?: RegistrationPricing | null;
  resumeGroupDiscount?: RegistrationGroupDiscount | null;
};

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

type AddOnSelection = { optionId: string; quantity: number };
type PaymentFormValues = { discountCode: string };

export function useRegistrationFlow({
  event,
  questions,
  addOns,
  userProfile,
  preSelectedDistanceId,
  groupToken,
  activeInviteExists,
  existingRegistration,
  resumeRegistrationId,
  resumeDistanceId,
  resumePricing,
  resumeGroupDiscount,
}: UseRegistrationFlowArgs) {
  const t = useTranslations('pages.events.register');
  const unexpectedError = t('errors.unexpected');
  const registrationExpiredError = t('errors.registrationExpired');
  const [isPending, startTransition] = useTransition();

  const [step, setStep] = useState<Step>(
    resumeRegistrationId && !existingRegistration ? 'info' : 'distance',
  );
  const [registrationId, setRegistrationId] = useState<string | null>(resumeRegistrationId ?? null);
  const [distanceError, setDistanceError] = useState<string | null>(null);
  const [showAlreadyRegisteredCta, setShowAlreadyRegisteredCta] = useState(false);
  const [ignoreExistingRegistration, setIgnoreExistingRegistration] = useState(false);
  const [registrationPricing, setRegistrationPricing] = useState<RegistrationPricing | null>(
    resumePricing ?? null,
  );
  const [policiesAcknowledged, setPoliciesAcknowledged] = useState(false);

  const effectiveExistingRegistration = ignoreExistingRegistration ? null : existingRegistration;

  const validPreSelectedId =
    preSelectedDistanceId &&
    event.distances.some(
      (d) =>
        d.id === preSelectedDistanceId &&
        (d.spotsRemaining === null || d.spotsRemaining > 0),
    )
      ? preSelectedDistanceId
      : null;

  const confirmedRegistrationDistanceId =
    effectiveExistingRegistration?.status === 'confirmed'
      ? effectiveExistingRegistration.distanceId
      : null;

  const [selectedDistanceId, setSelectedDistanceId] = useState<string | null>(
    resumeDistanceId ?? confirmedRegistrationDistanceId ?? validPreSelectedId,
  );
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

  const hasPoliciesStep = useMemo(
    () => shouldShowPoliciesStep(event.policyConfig),
    [event.policyConfig],
  );

  const steps = useMemo(() => {
    return buildRegistrationSteps({
      activeAddOnCount: activeAddOns.length,
      activeQuestionCount: activeQuestions.length,
      hasPoliciesStep,
      waiverCount: event.waivers.length,
    });
  }, [
    activeAddOns.length,
    activeQuestions.length,
    event.waivers.length,
    hasPoliciesStep,
  ]);

  const progressSteps = useMemo(() => getProgressSteps(steps), [steps]);

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
        return { ok: false, error: 'SERVER_ERROR', message: unexpectedError };
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
        if (result.code === 'REGISTRATION_EXPIRED') {
          handleRegistrationExpired();
          return { ok: false, error: result.code, message: registrationExpiredError };
        }
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
        return { ok: false, error: 'SERVER_ERROR', message: unexpectedError };
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
        if (result.code === 'REGISTRATION_EXPIRED') {
          handleRegistrationExpired();
          return { ok: false, error: result.code, message: registrationExpiredError };
        }
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
        return { ok: false, error: 'SERVER_ERROR', message: unexpectedError };
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
          if (result.code === 'REGISTRATION_EXPIRED') {
            handleRegistrationExpired();
            return { ok: false, error: result.code, message: registrationExpiredError };
          }
          return { ok: false, error: result.code ?? 'SERVER_ERROR', message: result.error };
        }
      }

      return { ok: true, data: undefined };
    },
    onSuccess: () => {
      goToNextStep('waiver');
    },
  });

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
        return { ok: false, error: 'SERVER_ERROR', message: unexpectedError };
      }

      const selections = Object.values(values)
        .filter((selection): selection is AddOnSelection => selection !== null)
        .map((selection) => ({ optionId: selection.optionId, quantity: selection.quantity }));

      const result = await submitAddOnSelections({ registrationId, selections });
      if (!result.ok) {
        if (result.code === 'REGISTRATION_EXPIRED') {
          handleRegistrationExpired();
          return { ok: false, error: result.code, message: registrationExpiredError };
        }
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

  const [groupDiscountPercentOff, setGroupDiscountPercentOff] = useState<number | null>(
    resumeGroupDiscount?.percentOff ?? null,
  );
  const [groupDiscountAmountCents, setGroupDiscountAmountCents] = useState(
    resumeGroupDiscount?.amountCents ?? 0,
  );

  const [appliedDiscountCode, setAppliedDiscountCode] = useState<string | null>(null);
  const [discountAmountCents, setDiscountAmountCents] = useState(0);
  const [discountError, setDiscountError] = useState<string | null>(null);
  const [pendingCodeConfirmation, setPendingCodeConfirmation] = useState<{
    code: string;
    normalizedCode: string;
    currentTotalCents: number;
    nextTotalCents: number;
    differenceCents: number;
  } | null>(null);

  const paymentForm = useForm<PaymentFormValues, void>({
    defaultValues: { discountCode: '' },
    onSubmit: async () => {
      if (!registrationId) {
        return { ok: false, error: 'SERVER_ERROR', message: unexpectedError };
      }

      const result = await finalizeRegistration({ registrationId });
      if (!result.ok) {
        if (result.code === 'REGISTRATION_EXPIRED') {
          handleRegistrationExpired();
          return { ok: false, error: result.code, message: registrationExpiredError };
        }
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

  const basePriceCents = registrationPricing?.basePriceCents ?? selectedDistance?.priceCents ?? 0;
  const feesCents = registrationPricing?.feesCents ?? 0;
  const taxCents = registrationPricing?.taxCents ?? 0;
  const subtotalCents = basePriceCents + addOnsSubtotalCents;
  const totalCents = Math.max(
    0,
    subtotalCents + feesCents + taxCents - discountAmountCents - groupDiscountAmountCents,
  );
  const isGroupDiscountApplied = groupDiscountPercentOff !== null;

  const handleRegistrationExpired = () => {
    setIgnoreExistingRegistration(true);
    setRegistrationId(null);
    setRegistrationPricing(null);
    setStep('distance');
    setShowAlreadyRegisteredCta(false);
    setDistanceError(registrationExpiredError);
    setPoliciesAcknowledged(false);
    setAppliedDiscountCode(null);
    setDiscountAmountCents(0);
    setPendingCodeConfirmation(null);
    setDiscountError(null);
    setGroupDiscountPercentOff(null);
    setGroupDiscountAmountCents(0);
  };

  async function handleDistanceSelect() {
    if (!selectedDistanceId) {
      setDistanceError(t('errors.distanceRequired'));
      setShowAlreadyRegisteredCta(false);
      return;
    }
    setDistanceError(null);
    setShowAlreadyRegisteredCta(false);

    if (registrationId) {
      setStep('info');
      return;
    }

    if (activeInviteExists) {
      setDistanceError(t('errors.activeInvite'));
      return;
    }

    startTransition(async () => {
      const result = await startRegistration({
        distanceId: selectedDistanceId,
        groupToken,
      });

      if (!result.ok) {
        if (result.code === 'REGISTRATION_CLOSED') {
          setDistanceError(t('errors.registrationClosed'));
          return;
        }

        if (result.code === 'REGISTRATION_NOT_OPEN') {
          setDistanceError(t('errors.registrationNotOpen'));
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

        if (result.code === 'HAS_ACTIVE_INVITE') {
          setDistanceError(t('errors.activeInvite'));
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
      setGroupDiscountPercentOff(result.data.groupDiscountPercentOff ?? null);
      setGroupDiscountAmountCents(result.data.groupDiscountAmountCents ?? 0);
      setStep('info');
    });
  }

  useEffect(() => {
    if (resumeRegistrationId) return;
    if (validPreSelectedId && step === 'distance' && !registrationId) {
      handleDistanceSelect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (!registrationId) {
      setGroupDiscountPercentOff(null);
      setGroupDiscountAmountCents(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDistanceId]);

  useEffect(() => {
    setDiscountError(null);
  }, [paymentForm.values.discountCode]);

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
      const pricingBasePriceCents = registrationPricing?.basePriceCents ?? selectedDistance?.priceCents ?? 0;

      const validation = await validateDiscountCode({
        editionId: event.id,
        code,
        basePriceCents: pricingBasePriceCents,
      });

      if (!validation.ok || !validation.data.valid) {
        setDiscountError(
          validation.ok ? validation.data.error ?? t('payment.invalidCode') : validation.error,
        );
        return;
      }

      const normalizedCode = validation.data.discountCode?.code ?? code.toUpperCase();
      const validatedDiscountAmountCents = validation.data.discountAmountCents ?? 0;

      const nextTotalCents = Math.max(
        0,
        subtotalCents + feesCents + taxCents - validatedDiscountAmountCents,
      );

      if (isGroupDiscountApplied && nextTotalCents > totalCents) {
        setPendingCodeConfirmation({
          code,
          normalizedCode,
          currentTotalCents: totalCents,
          nextTotalCents,
          differenceCents: nextTotalCents - totalCents,
        });
        return;
      }

      const result = await applyDiscountCode({ registrationId, code });
      if (!result.ok) {
        if (result.code === 'REGISTRATION_EXPIRED') {
          handleRegistrationExpired();
          return;
        }
        setDiscountError(result.error);
        return;
      }

      setAppliedDiscountCode(normalizedCode);
      paymentForm.setFieldValue('discountCode', normalizedCode);
      setDiscountAmountCents(result.data.discountAmountCents);
      setGroupDiscountPercentOff(result.data.groupDiscountPercentOff ?? null);
      setGroupDiscountAmountCents(result.data.groupDiscountAmountCents ?? 0);
    });
  }

  async function handleConfirmDiscountCodeReplacement() {
    if (!pendingCodeConfirmation || !registrationId) return;
    const { code, normalizedCode } = pendingCodeConfirmation;
    setPendingCodeConfirmation(null);

    startTransition(async () => {
      const result = await applyDiscountCode({ registrationId, code });
      if (!result.ok) {
        if (result.code === 'REGISTRATION_EXPIRED') {
          handleRegistrationExpired();
          return;
        }
        setDiscountError(result.error);
        return;
      }

      setAppliedDiscountCode(normalizedCode);
      paymentForm.setFieldValue('discountCode', normalizedCode);
      setDiscountAmountCents(result.data.discountAmountCents);
      setGroupDiscountPercentOff(result.data.groupDiscountPercentOff ?? null);
      setGroupDiscountAmountCents(result.data.groupDiscountAmountCents ?? 0);
    });
  }

  async function handleRemoveDiscountCode() {
    if (!registrationId || !appliedDiscountCode) return;
    setDiscountError(null);

    startTransition(async () => {
      const result = await removeDiscountCode({ registrationId });
      if (!result.ok) {
        if (result.code === 'REGISTRATION_EXPIRED') {
          handleRegistrationExpired();
          return;
        }
        setDiscountError(result.error);
        return;
      }

      setAppliedDiscountCode(null);
      setDiscountAmountCents(0);
      setGroupDiscountPercentOff(result.data.groupDiscountPercentOff ?? null);
      setGroupDiscountAmountCents(result.data.groupDiscountAmountCents ?? 0);
      paymentForm.setFieldValue('discountCode', '');
    });
  }

  const goToNextStep = (current: Step) => {
    const nextStep = getNextStep(steps, current);
    if (nextStep) {
      setStep(nextStep);
    }
  };

  const goToPreviousStep = (current: Step) => {
    const previousStep = getPreviousStep(steps, current);
    if (previousStep) {
      setStep(previousStep);
    }
  };

  const currentStepNumber = getStepNumber(steps, step);

  return {
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
    hasPoliciesStep,
    infoForm,
    isGroupDiscountApplied,
    isPending,
    paymentForm,
    pendingCodeConfirmation,
    policiesAcknowledged,
    progressSteps,
    questionsForm,
    effectiveExistingRegistration,
    registrationId,
    registrationPricing,
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
  };
}

export type RegistrationFlowState = ReturnType<typeof useRegistrationFlow>;
