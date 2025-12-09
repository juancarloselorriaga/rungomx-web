import { MeasurementField } from '@/components/settings/fields/measurement-field';
import { FormField } from '@/components/ui/form-field';
import type { UseFormReturn } from '@/lib/forms';
import type { ProfileMetadata } from '@/lib/profiles/metadata';
import type { ProfileRecord } from '@/lib/profiles/types';
import { cn } from '@/lib/utils';
import type { ProfileFormValues } from '@/components/settings/profile/profile-settings-form';

type ProfilePhysicalSectionProps = {
  form: UseFormReturn<ProfileFormValues>;
  t: (key: string, values?: Record<string, unknown>) => string;
  isRequiredField: (field: keyof ProfileRecord) => boolean;
  metadata: ProfileMetadata;
  isBusy: boolean;
};

export function ProfilePhysicalSection({
  form,
  t,
  isRequiredField,
  metadata,
  isBusy,
}: ProfilePhysicalSectionProps) {
  const shirtSizeOptions = metadata.shirtSizes ?? [];

  return (
    <section className="space-y-3 rounded-lg border bg-card p-4 shadow-sm">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{t('sections.physical.title')}</h2>
        <p className="text-sm text-muted-foreground">
          {t('sections.physical.description')}
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <FormField
          label={t('fields.shirtSize')}
          required={isRequiredField('shirtSize')}
          error={form.errors.shirtSize}
        >
          <select
            className={cn(
              'w-full appearance-none rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition',
              'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30',
              form.errors.shirtSize && 'border-destructive focus-visible:border-destructive'
            )}
            {...form.register('shirtSize')}
            disabled={isBusy}
          >
            <option value="">{t('selectOption')}</option>
            {shirtSizeOptions.map((size) => (
              <option key={size} value={size}>
                {t(`shirtSizes.${size}`)}
              </option>
            ))}
          </select>
        </FormField>

        <MeasurementField
          label={t('fields.weightKg')}
          name="weightKg"
          value={form.values.weightKg}
          onChange={(value) => form.setFieldValue('weightKg', value)}
          min={30}
          max={250}
          step={0.5}
          unit={t('units.kg')}
          hint={t('hints.weightKg')}
          error={form.errors.weightKg}
          disabled={isBusy}
        />

        <MeasurementField
          label={t('fields.heightCm')}
          name="heightCm"
          value={form.values.heightCm}
          onChange={(value) => form.setFieldValue('heightCm', value)}
          min={120}
          max={230}
          step={1}
          unit={t('units.cm')}
          hint={t('hints.heightCm')}
          error={form.errors.heightCm}
          disabled={isBusy}
        />
      </div>
    </section>
  );
}

