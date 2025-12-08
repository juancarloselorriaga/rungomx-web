'use client';

import { FieldLabel } from '@/components/ui/form-field';
import { PhoneInput } from '@/components/ui/phone-input-lazy';
import { CountryCode } from 'libphonenumber-js';

type PhoneFieldProps = {
  label: string;
  name: string;
  value: string;
  required?: boolean;
  error?: string | null;
  disabled?: boolean;
  defaultCountry?: CountryCode;
  onChangeAction: (value: string) => void;
};

export function PhoneField({
  label,
  name,
  value,
  required,
  error,
  disabled,
  defaultCountry = 'MX',
  onChangeAction,
}: PhoneFieldProps) {
  return (
    <PhoneInput
      label={
        <FieldLabel required={required} error={!!error}>
          {label}
        </FieldLabel>
      }
      name={name}
      value={value}
      onChangeAction={onChangeAction}
      defaultCountry={defaultCountry}
      error={error || undefined}
      disabled={disabled}
    />
  );
}
