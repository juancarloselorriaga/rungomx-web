import type { ProfileFormValues } from '@/components/settings/profile/profile-settings-form';
import { FormField } from '@/components/ui/form-field';
import { routing } from '@/i18n/routing';
import type { UseFormReturn } from '@/lib/forms';
import { cn } from '@/lib/utils';

type ProfilePreferencesSectionProps = {
  form: UseFormReturn<ProfileFormValues>;
  t: (key: string, values?: Record<string, unknown>) => string;
  isBusy: boolean;
};

export function ProfilePreferencesSection({ form, t, isBusy }: ProfilePreferencesSectionProps) {
  return (
    <section className="space-y-3 rounded-lg border bg-card p-4 shadow-sm">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{t('sections.preferences.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('sections.preferences.description')}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <FormField label={t('fields.locale')} error={form.errors.locale}>
          <select
            className={cn(
              'w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition',
              'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30',
              form.errors.locale && 'border-destructive focus-visible:border-destructive',
            )}
            {...form.register('locale')}
            disabled={isBusy}
          >
            <option value="">{t('fields.localeDefault')}</option>
            {routing.locales.map((loc) => (
              <option key={loc} value={loc}>
                {t('fields.localeOption', { locale: loc })}
              </option>
            ))}
          </select>
        </FormField>
      </div>
    </section>
  );
}
