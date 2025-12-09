'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { MapPinIcon } from 'lucide-react';
import { FormField } from '@/components/ui/form-field';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { PublicLocationValue } from '@/types/location';
import { useTranslations } from 'next-intl';

const LocationPickerDialog = dynamic(
  () =>
    import('./location-picker-dialog').then(
      (mod) => mod.LocationPickerDialog
    ),
  {
    ssr: false,
    loading: () => null,
  }
);

type LocationFieldProps = {
  label: string;
  displayValue?: string;
  required?: boolean;
  error?: string | null;
  disabled?: boolean;
  hint?: string;
  location: PublicLocationValue | null;
  country?: string;
  language?: string;
  onLocationChangeAction: (location: PublicLocationValue) => void;
};

export function LocationField({
  label,
  displayValue,
  required,
  error,
  disabled,
  hint,
  location,
  country,
  language,
  onLocationChangeAction,
}: LocationFieldProps) {
  const t = useTranslations('components.location');
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  return (
    <div className="space-y-2">
      <FormField label={label} required={required} error={error}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            className={cn(
              'group flex min-h-[3rem] flex-1 items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2 text-left text-sm shadow-sm transition-colors',
              'hover:bg-accent/40 hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
              disabled && 'cursor-default opacity-60 hover:bg-muted/40 hover:border-border'
            )}
            onClick={() => {
              if (!disabled) {
                setIsDialogOpen(true);
              }
            }}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <MapPinIcon className="h-4 w-4" />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-xs font-medium text-muted-foreground">
                {t('field.currentLabel')}
              </span>
              <span className={cn('truncate text-sm', displayValue ? 'text-foreground' : 'text-muted-foreground')}>
                {displayValue && displayValue.trim()
                  ? displayValue
                  : t('field.emptyValue')}
              </span>
            </span>
          </button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 sm:w-auto w-full"
            onClick={() => setIsDialogOpen(true)}
            disabled={disabled}
          >
            <MapPinIcon className="mr-1 h-4 w-4" />
            {t('field.mapButton')}
          </Button>
        </div>
        {hint ? (
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        ) : null}
      </FormField>

      {isDialogOpen ? (
        <LocationPickerDialog
          initialLocation={location}
          onLocationSelectAction={onLocationChangeAction}
          onCloseAction={() => setIsDialogOpen(false)}
          country={country}
          language={language}
        />
      ) : null}
    </div>
  );
}
