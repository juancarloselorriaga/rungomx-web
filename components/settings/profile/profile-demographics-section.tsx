import { GenderField } from '@/components/settings/fields/gender-field';
import { FormField } from '@/components/ui/form-field';
import type { UseFormReturn } from '@/lib/forms';
import type { ProfileMetadata } from '@/lib/profiles/metadata';
import type { ProfileRecord } from '@/lib/profiles/types';
import { cn } from '@/lib/utils';
import type { ProfileFormValues } from '@/components/settings/profile/profile-settings-form';

type ProfileDemographicsSectionProps = {
  form: UseFormReturn<ProfileFormValues>;
  t: (key: string, values?: Record<string, unknown>) => string;
  isRequiredField: (field: keyof ProfileRecord) => boolean;
  metadata: ProfileMetadata;
  isBusy: boolean;
};

export function ProfileDemographicsSection({
  form,
  t,
  isRequiredField,
  metadata,
  isBusy,
}: ProfileDemographicsSectionProps) {
  const genderField = form.register('gender');
  const genderDescriptionField = form.register('genderDescription');
  const genderOptions = metadata.genderOptions ?? [];

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

        <FormField
          label={t('fields.locationDisplay')}
          required={isRequiredField('locationDisplay')}
          error={form.errors.locationDisplay}
        >
          <input
            className={cn(
              'w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition',
              'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30',
              form.errors.locationDisplay && 'border-destructive focus-visible:border-destructive'
            )}
            {...form.register('locationDisplay')}
            maxLength={255}
            disabled={isBusy}
          />
          <p className="text-xs text-muted-foreground">{t('hints.locationDisplay')}</p>
        </FormField>
      </div>
    </section>
  );
}

