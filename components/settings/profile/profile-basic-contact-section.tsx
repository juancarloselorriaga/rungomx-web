import { PhoneField } from '@/components/settings/fields/phone-field';
import { CountrySelectField } from '@/components/settings/fields/country-select-field-lazy';
import { DatePicker } from '@/components/ui/date-picker';
import { FormField } from '@/components/ui/form-field';
import type { UseFormReturn } from '@/lib/forms';
import type { ProfileRecord } from '@/lib/profiles/types';
import { cn } from '@/lib/utils';
import type { ProfileFormValues } from '@/components/settings/profile/profile-settings-form';

type ProfileBasicContactSectionProps = {
  form: UseFormReturn<ProfileFormValues>;
  t: (key: string, values?: Record<string, unknown>) => string;
  locale: string;
  isRequiredField: (field: keyof ProfileRecord) => boolean;
  countryOptions: readonly string[];
  isBusy: boolean;
};

export function ProfileBasicContactSection({
  form,
  t,
  locale,
  isRequiredField,
  countryOptions,
  isBusy,
}: ProfileBasicContactSectionProps) {
  const phoneField = form.register('phone');
  const dateOfBirthField = form.register('dateOfBirth');

  return (
    <section className="space-y-3 rounded-lg border bg-card p-4 shadow-sm">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{t('sections.basicContact.title')}</h2>
        <p className="text-sm text-muted-foreground">
          {t('sections.basicContact.description')}
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <PhoneField
          label={t('fields.phone')}
          name={phoneField.name as string}
          value={phoneField.value}
          onChangeAction={phoneField.onChange}
          required={isRequiredField('phone')}
          error={form.errors.phone}
          disabled={isBusy}
        />

        <FormField
          label={t('fields.dateOfBirth')}
          required={isRequiredField('dateOfBirth')}
          error={form.errors.dateOfBirth}
        >
          <DatePicker
            locale={locale}
            value={dateOfBirthField.value}
            onChangeAction={(value) => dateOfBirthField.onChange(value)}
            clearLabel={t('actions.clear')}
            name={dateOfBirthField.name as string}
          />
        </FormField>

        <FormField
          label={t('fields.city')}
          required={isRequiredField('city')}
          error={form.errors.city}
        >
          <input
            className={cn(
              'w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition',
              'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30',
              form.errors.city && 'border-destructive focus-visible:border-destructive'
            )}
            {...form.register('city')}
            disabled={isBusy}
          />
        </FormField>

        <FormField
          label={t('fields.state')}
          required={isRequiredField('state')}
          error={form.errors.state}
        >
          <input
            className={cn(
              'w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition',
              'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30',
              form.errors.state && 'border-destructive focus-visible:border-destructive'
            )}
            {...form.register('state')}
            disabled={isBusy}
          />
        </FormField>

        <FormField label={t('fields.postalCode')} error={form.errors.postalCode}>
          <input
            className={cn(
              'w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition',
              'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30',
              form.errors.postalCode && 'border-destructive focus-visible:border-destructive'
            )}
            {...form.register('postalCode')}
            inputMode="numeric"
            maxLength={10}
            disabled={isBusy}
          />
        </FormField>

        <CountrySelectField
          label={t('fields.country')}
          value={form.values.country}
          onChangeAction={(value) => form.setFieldValue('country', value)}
          options={countryOptions}
          required={isRequiredField('country')}
          error={form.errors.country}
          disabled={isBusy}
        />
      </div>
    </section>
  );
}

