import { DistanceStep } from '@/app/[locale]/(public)/events/[seriesSlug]/[editionSlug]/register/distance-step';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    values ? `${key} ${JSON.stringify(values)}` : key,
}));

describe('DistanceStep', () => {
  const event: React.ComponentProps<typeof DistanceStep>['event'] = {
    id: 'event-1',
    publicCode: 'PUBLIC-1',
    slug: 'event-1',
    editionLabel: '2026',
    visibility: 'published',
    seriesId: 'series-1',
    seriesSlug: 'series-1',
    description: null,
    startsAt: null,
    endsAt: null,
    timezone: 'America/Mexico_City',
    registrationOpensAt: null,
    registrationClosesAt: null,
    isRegistrationPaused: false,
    isRegistrationOpen: true,
    locationDisplay: null,
    address: null,
    city: null,
    state: null,
    country: null,
    latitude: null,
    longitude: null,
    externalUrl: null,
    heroImageUrl: null,
    seriesName: 'Series',
    sportType: 'running',
    organizationId: 'org-1',
    organizationName: 'Org',
    sharedCapacity: null,
    distances: [
      {
        id: 'distance-5k',
        label: '5K',
        priceCents: 50000,
        currency: 'MXN',
        spotsRemaining: 10,
        capacityScope: 'per_distance',
        distanceValue: '5',
        distanceUnit: 'km',
        kind: 'race',
        terrain: null,
        isVirtual: false,
        capacity: 100,
      },
      {
        id: 'distance-10k',
        label: '10K',
        priceCents: 65000,
        currency: 'MXN',
        spotsRemaining: 10,
        capacityScope: 'per_distance',
        distanceValue: '10',
        distanceUnit: 'km',
        kind: 'race',
        terrain: null,
        isVirtual: false,
        capacity: 100,
      },
    ],
    faqItems: [],
    waivers: [],
    policyConfig: null,
    groupDiscountRules: [],
  };

  function renderStep() {
    const onContinue = jest.fn();

    function Harness() {
      const [selectedDistanceId, setSelectedDistanceId] = React.useState<string | null>(null);

      return (
        <DistanceStep
          event={event}
          registrationId={null}
          existingRegistration={{
            registrationId: 'reg-1',
            distanceId: 'distance-5k',
            distanceLabel: '5K',
            status: 'confirmed',
            expiresAt: null,
            basePriceCents: 50000,
            feesCents: 4000,
            taxCents: 0,
            totalCents: 54000,
            groupDiscountPercentOff: null,
            groupDiscountAmountCents: null,
          }}
          activeInviteExists={false}
          selectedDistanceId={selectedDistanceId}
          setSelectedDistanceId={setSelectedDistanceId}
          isPending={false}
          formatPrice={(cents) => `$${cents / 100}`}
          onContinue={onContinue}
        />
      );
    }

    render(<Harness />);

    return { onContinue };
  }

  it('allows selecting the already-registered distance so the flow is not dead-ended', () => {
    const { onContinue } = renderStep();

    const registeredDistanceButton = screen.getByText('5K').closest('button');
    const otherDistanceButton = screen.getByText('10K').closest('button');

    expect(registeredDistanceButton).not.toBeDisabled();
    expect(otherDistanceButton).toBeDisabled();

    fireEvent.click(registeredDistanceButton!);

    const continueButton = screen.getByRole('button', { name: 'distance.continue' });
    expect(continueButton).not.toBeDisabled();

    fireEvent.click(continueButton);

    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});
