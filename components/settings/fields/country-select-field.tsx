'use client';

import { FormField } from '@/components/ui/form-field';
import { type CountryCode, getCountryName } from '@/lib/profiles/countries';
import { cn } from '@/lib/utils';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';

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
  const sortedOptions = useMemo(
    () =>
      options
        .map((code) => ({
          code,
          name: getCountryName(code as CountryCode, locale),
        }))
        .sort((a, b) => a.name.localeCompare(b.name, locale, { sensitivity: 'base' })),
    [options, locale],
  );

  return (
    <FormField label={label} required={required} error={error}>
      <select
        className={cn(
          'w-full appearance-none rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition',
          'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30',
          error && 'border-destructive focus-visible:border-destructive',
        )}
        value={value}
        onChange={(event) => onChangeAction(event.target.value)}
        disabled={disabled}
      >
        <option value="">{placeholder}</option>
        {sortedOptions.map(({ code, name }) => (
          <option key={code} value={code}>
            {name}
          </option>
        ))}
      </select>
    </FormField>
  );
}
