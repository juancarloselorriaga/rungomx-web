'use client';

import { FormField } from '@/components/ui/form-field';
import { cn } from '@/lib/utils';
import { useTranslations, useLocale } from 'next-intl';
import { getCountryName, type CountryCode } from '@/lib/profiles/countries';

type CountrySelectFieldProps = {
  label: string;
  value: string;
  onChangeAction: (value: string) => void;
  options: readonly string[];
  required?: boolean;
  error?: string | null;
  disabled?: boolean;
};

export function CountrySelectField({
  label,
  value,
  onChangeAction,
  options,
  required,
  error,
  disabled,
}: CountrySelectFieldProps) {
  const t = useTranslations('components.settings.profileForm');
  const locale = useLocale() as 'en' | 'es';
  const placeholder = t('selectOption');

  return (
    <FormField label={label} required={required} error={error}>
      <select
        className={cn(
          'w-full appearance-none rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition',
          'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30',
          error && 'border-destructive focus-visible:border-destructive'
        )}
        value={value}
        onChange={(event) => onChangeAction(event.target.value)}
        disabled={disabled}
      >
        <option value="">{placeholder}</option>
        {options.map((code) => (
          <option key={code} value={code}>
            {getCountryName(code as CountryCode, locale)}
          </option>
        ))}
      </select>
    </FormField>
  );
}
