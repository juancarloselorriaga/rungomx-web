import type { ProfileFormValues } from '@/components/settings/profile/profile-settings-form';
import { ProfileFormSection } from '@/components/settings/profile/profile-form-section';
import { FormField } from '@/components/ui/form-field';
import type { UseFormReturn } from '@/lib/forms';
import type { ProfileMetadata } from '@/lib/profiles/metadata';
import type { ProfileRecord } from '@/lib/profiles/types';
import { cn } from '@/lib/utils';

type ProfileMedicalSectionProps = {
  form: UseFormReturn<ProfileFormValues>;
  t: (key: string, values?: Record<string, unknown>) => string;
  isRequiredField: (field: keyof ProfileRecord) => boolean;
  metadata: ProfileMetadata;
  isBusy: boolean;
};

export function ProfileMedicalSection({
  form,
  t,
  isRequiredField,
  metadata,
  isBusy,
}: ProfileMedicalSectionProps) {
  const bloodTypeOptions = metadata.bloodTypes ?? [];

  return (
    <ProfileFormSection
      title={t('sections.medical.title')}
      description={t('sections.medical.description')}
    >
      <div className="space-y-3">
        <FormField
          label={t('fields.bloodType')}
          required={isRequiredField('bloodType')}
          error={form.errors.bloodType}
        >
          <select
            className={cn(
              'w-full appearance-none rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition',
              'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30',
              form.errors.bloodType && 'border-destructive focus-visible:border-destructive',
            )}
            {...form.register('bloodType')}
            disabled={isBusy}
          >
            <option value="">{t('selectOption')}</option>
            {bloodTypeOptions.map((type) => (
              <option key={type} value={type}>
                {type.toUpperCase()}
              </option>
            ))}
          </select>
        </FormField>

        <FormField
          label={t('fields.medicalConditions')}
          required={isRequiredField('medicalConditions')}
          error={form.errors.medicalConditions}
        >
          <textarea
            className={cn(
              'min-h-[80px] w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition',
              'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30',
              form.errors.medicalConditions &&
                'border-destructive focus-visible:border-destructive',
            )}
            {...form.register('medicalConditions')}
            disabled={isBusy}
            maxLength={5000}
          />
          <p className="text-xs text-muted-foreground">{t('hints.medicalConditions')}</p>
        </FormField>

        <FormField label={t('fields.bio')} error={form.errors.bio}>
          <textarea
            className={cn(
              'min-h-[80px] w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition',
              'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30',
              form.errors.bio && 'border-destructive focus-visible:border-destructive',
            )}
            {...form.register('bio')}
            disabled={isBusy}
            maxLength={500}
          />
        </FormField>
      </div>
    </ProfileFormSection>
  );
}
