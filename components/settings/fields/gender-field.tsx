'use client';

import { FormField, FieldError, FieldLabel } from '@/components/ui/form-field';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';

type GenderFieldProps = {
  label: string;
  value: string;
  description: string;
  options: readonly string[];
  required?: boolean;
  error?: string | null;
  descriptionError?: string | null;
  disabled?: boolean;
  onChangeAction: (value: string) => void;
  onDescriptionChangeAction: (value: string) => void;
};

export function GenderField({
  label,
  value,
  description,
  options,
  required,
  error,
  descriptionError,
  disabled,
  onChangeAction,
  onDescriptionChangeAction,
}: GenderFieldProps) {
  const t = useTranslations('components.settings.profileForm');
  const placeholder = t('selectOption');
  const isSelfDescribed = value === 'self_described';

  const handleGenderChange = (next: string) => {
    onChangeAction(next);
    if (next !== 'self_described' && description) {
      onDescriptionChangeAction('');
    }
  };

  return (
    <div className="space-y-2 min-w-0">
      <FormField label={label} required={required} error={error}>
        <select
          className={cn(
            'w-full appearance-none rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition',
            'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30',
            error && 'border-destructive focus-visible:border-destructive'
          )}
          value={value}
          onChange={(event) => handleGenderChange(event.target.value)}
          disabled={disabled}
        >
          <option value="">{placeholder}</option>
          {options.map((code) => (
            <option key={code} value={code}>
              {t(`gender.options.${code}` as Parameters<typeof t>[0], { defaultValue: code })}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">{t('gender.helper')}</p>
      </FormField>

      {isSelfDescribed ? (
        <div className="space-y-1 rounded-md border bg-muted/30 p-3">
          <FieldLabel error={!!descriptionError}>
            {t('gender.selfDescribeLabel')}
          </FieldLabel>
          <input
            type="text"
            name="genderDescription"
            value={description}
            onChange={(event) => onDescriptionChangeAction(event.target.value)}
            className={cn(
              'w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition',
              'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30',
              descriptionError && 'border-destructive focus-visible:border-destructive'
            )}
            maxLength={100}
            disabled={disabled}
          />
          <FieldError error={descriptionError} />
          <p className="text-xs text-muted-foreground">{t('gender.selfDescribeHint')}</p>
        </div>
      ) : null}
    </div>
  );
}
