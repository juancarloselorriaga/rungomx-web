import { GenderField } from '@/components/settings/fields/gender-field';
import { LocationField } from '@/components/location/location-field';
import type { UseFormReturn } from '@/lib/forms';
import type { ProfileMetadata } from '@/lib/profiles/metadata';
import type { ProfileRecord } from '@/lib/profiles/types';
import type { ProfileFormValues } from '@/components/settings/profile/profile-settings-form';

type ProfileDemographicsSectionProps = {
  form: UseFormReturn<ProfileFormValues>;
  t: (key: string, values?: Record<string, unknown>) => string;
  isRequiredField: (field: keyof ProfileRecord) => boolean;
  metadata: ProfileMetadata;
  locale: string;
  isBusy: boolean;
};

export function ProfileDemographicsSection({
  form,
  t,
  isRequiredField,
  metadata,
  locale,
  isBusy,
}: ProfileDemographicsSectionProps) {
  const genderField = form.register('gender');
  const genderDescriptionField = form.register('genderDescription');
  const locationDisplayField = form.register('locationDisplay');
  const genderOptions = metadata.genderOptions ?? [];

  const latitude = form.values.latitude;
  const longitude = form.values.longitude;

  let currentLocation = null as
    | {
        lat: number;
        lng: number;
        formattedAddress: string;
        placeId?: string;
        countryCode?: string;
        region?: string;
        city?: string;
        postalCode?: string;
        provider?: string;
      }
    | null;

  const latNumber = Number.parseFloat(latitude);
  const lngNumber = Number.parseFloat(longitude);
  if (Number.isFinite(latNumber) && Number.isFinite(lngNumber)) {
    currentLocation = {
      lat: latNumber,
      lng: lngNumber,
      formattedAddress: locationDisplayField.value ?? '',
      placeId: undefined,
      countryCode: form.values.country,
      region: undefined,
      city: undefined,
      postalCode: undefined,
      provider: 'mapbox',
    };
  }

  return (
    <section className="space-y-3 rounded-lg border bg-card p-4 shadow-sm">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{t('sections.demographics.title')}</h2>
        <p className="text-sm text-muted-foreground">
          {t('sections.demographics.description')}
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <GenderField
          label={t('fields.gender')}
          value={genderField.value}
          description={genderDescriptionField.value}
          onChangeAction={(value) => genderField.onChange(value)}
          onDescriptionChangeAction={(value) => genderDescriptionField.onChange(value)}
          options={genderOptions}
          required={isRequiredField('gender')}
          error={form.errors.gender}
          descriptionError={form.errors.genderDescription}
          disabled={isBusy}
        />

        <LocationField
          label={t('fields.locationDisplay')}
          displayValue={locationDisplayField.value ?? ''}
          required={isRequiredField('locationDisplay')}
          error={form.errors.locationDisplay}
          disabled={isBusy}
          hint={t('hints.locationDisplay')}
          location={currentLocation}
          country={form.values.country}
          language={locale}
          onLocationChangeAction={(location) => {
            locationDisplayField.onChange(location.formattedAddress);
            form.setFieldValue('latitude', String(location.lat));
            form.setFieldValue('longitude', String(location.lng));

            if (!form.values.country && location.countryCode) {
              form.setFieldValue('country', location.countryCode.toUpperCase());
            }
          }}
        />
      </div>
    </section>
  );
}
