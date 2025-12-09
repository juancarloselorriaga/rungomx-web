import { PhoneField } from '@/components/settings/fields/phone-field';
import { FormField } from '@/components/ui/form-field';
import type { UseFormReturn } from '@/lib/forms';
import type { ProfileRecord } from '@/lib/profiles/types';
import { cn } from '@/lib/utils';
import type { ProfileFormValues } from '@/components/settings/profile/profile-settings-form';

type ProfileEmergencyContactSectionProps = {
  form: UseFormReturn<ProfileFormValues>;
  t: (key: string, values?: Record<string, unknown>) => string;
  isRequiredField: (field: keyof ProfileRecord) => boolean;
  isBusy: boolean;
};

export function ProfileEmergencyContactSection({
  form,
  t,
  isRequiredField,
  isBusy,
}: ProfileEmergencyContactSectionProps) {
  const emergencyPhoneField = form.register('emergencyContactPhone');

  return (
    <section className="space-y-3 rounded-lg border bg-card p-4 shadow-sm">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{t('sections.emergencyContact.title')}</h2>
        <p className="text-sm text-muted-foreground">
          {t('sections.emergencyContact.description')}
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <FormField
          label={t('fields.emergencyContactName')}
          required={isRequiredField('emergencyContactName')}
          error={form.errors.emergencyContactName}
        >
          <input
            className={cn(
              'w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition',
              'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30',
              form.errors.emergencyContactName &&
                'border-destructive focus-visible:border-destructive'
            )}
            {...form.register('emergencyContactName')}
            disabled={isBusy}
          />
        </FormField>

        <PhoneField
          label={t('fields.emergencyContactPhone')}
          name={emergencyPhoneField.name as string}
          value={emergencyPhoneField.value}
          onChangeAction={emergencyPhoneField.onChange}
          required={isRequiredField('emergencyContactPhone')}
          error={form.errors.emergencyContactPhone}
          disabled={isBusy}
        />
      </div>
    </section>
  );
}

