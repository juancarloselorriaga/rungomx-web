'use client';

import { FormField } from '@/components/ui/form-field';
import { cn } from '@/lib/utils';
import type { PublicLocationValue } from '@/types/location';
import { MapPinIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { useState } from 'react';

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
  onLocationChangeAction: (location: PublicLocationValue | null) => void;
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
  const locationDisplay = displayValue?.trim() || location?.formattedAddress?.trim() || '';
  const hasLocation = Boolean(locationDisplay);

  return (
    <div className="space-y-2 min-w-0">
      <FormField label={label} required={required} error={error}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            className={cn(
              'flex w-full min-w-0 flex-1 items-center gap-2 rounded-md border bg-background px-3 py-2 text-left text-sm shadow-sm transition',
              'hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
              error && 'border-destructive focus-visible:ring-destructive/30',
              disabled && 'cursor-not-allowed opacity-60 hover:border-border'
            )}
            disabled={disabled}
            onClick={() => {
              if (!disabled) {
                setIsDialogOpen(true);
              }
            }}
          >
            <span
              className={cn(
                'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                'border-transparent bg-primary/10 text-primary'
              )}
            >
              <MapPinIcon className="h-3 w-3" />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">

              <span
                className={cn(
                  'truncate text-sm font-medium',
                  hasLocation ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                {hasLocation ? locationDisplay : t('field.emptyValue')}
              </span>
            </span>
          </button>
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
