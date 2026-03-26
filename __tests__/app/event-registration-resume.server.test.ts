import { getResumableRegistration } from '@/app/[locale]/(public)/events/[seriesSlug]/[editionSlug]/register/resume-registration';
import type { ActiveRegistrationInfo } from '@/lib/events/queries';

describe('getResumableRegistration', () => {
  const startedRegistration: ActiveRegistrationInfo = {
    registrationId: 'reg-started',
    distanceId: 'distance-5k',
    distanceLabel: '5K',
    status: 'started',
    expiresAt: null,
    basePriceCents: 50000,
    feesCents: 4000,
    taxCents: 0,
    totalCents: 54000,
    groupDiscountPercentOff: 10,
    groupDiscountAmountCents: 5000,
  };

  it('returns resume state for started registrations', () => {
    expect(getResumableRegistration(startedRegistration)).toEqual({
      registrationId: 'reg-started',
      distanceId: 'distance-5k',
      pricing: {
        basePriceCents: 50000,
        feesCents: 4000,
        taxCents: 0,
        totalCents: 54000,
      },
      groupDiscount: {
        percentOff: 10,
        amountCents: 5000,
      },
    });
  });

  it('returns resume state for submitted registrations', () => {
    expect(getResumableRegistration({ ...startedRegistration, status: 'submitted' })).toEqual({
      registrationId: 'reg-started',
      distanceId: 'distance-5k',
      pricing: {
        basePriceCents: 50000,
        feesCents: 4000,
        taxCents: 0,
        totalCents: 54000,
      },
      groupDiscount: {
        percentOff: 10,
        amountCents: 5000,
      },
    });
  });

  it.each(['payment_pending', 'confirmed'] as const)(
    'does not auto-resume %s registrations',
    (status) => {
      expect(getResumableRegistration({ ...startedRegistration, status })).toBeNull();
    },
  );
});
