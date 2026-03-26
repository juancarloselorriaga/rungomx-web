import type { ActiveRegistrationInfo } from '@/lib/events/queries';

type ResumeRegistrationState = {
  registrationId: string;
  distanceId: string;
  pricing: {
    basePriceCents: number | null;
    feesCents: number | null;
    taxCents: number | null;
    totalCents: number | null;
  };
  groupDiscount: {
    percentOff: number | null;
    amountCents: number | null;
  };
};

export function getResumableRegistration(
  existingRegistration: ActiveRegistrationInfo | null | undefined,
): ResumeRegistrationState | null {
  if (!existingRegistration || existingRegistration.status !== 'started') {
    return null;
  }

  return {
    registrationId: existingRegistration.registrationId,
    distanceId: existingRegistration.distanceId,
    pricing: {
      basePriceCents: existingRegistration.basePriceCents,
      feesCents: existingRegistration.feesCents,
      taxCents: existingRegistration.taxCents,
      totalCents: existingRegistration.totalCents,
    },
    groupDiscount: {
      percentOff: existingRegistration.groupDiscountPercentOff,
      amountCents: existingRegistration.groupDiscountAmountCents,
    },
  };
}
