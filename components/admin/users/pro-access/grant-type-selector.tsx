'use client';

import { cn } from '@/lib/utils';
import { Calendar, Clock } from 'lucide-react';

type GrantType = 'duration' | 'until';

type GrantTypeSelectorProps = {
  value: GrantType;
  onChangeAction: (next: GrantType) => void;
  disabled?: boolean;
  label: string;
  durationLabel: string;
  durationDescription: string;
  untilLabel: string;
  untilDescription: string;
};

export function GrantTypeSelector({
  value,
  onChangeAction,
  disabled = false,
  label,
  durationLabel,
  durationDescription,
  untilLabel,
  untilDescription,
}: GrantTypeSelectorProps) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-2 sm:grid-cols-2">
      <button
        type="button"
        role="radio"
        aria-checked={value === 'duration'}
        disabled={disabled}
        className={cn(
          'rounded-lg border px-3 py-3 text-left shadow-sm transition',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
          value === 'duration' ? 'border-primary bg-primary/5' : 'border-border/60 bg-background/60 hover:bg-muted/20',
          disabled && 'cursor-not-allowed opacity-70 hover:bg-background/60',
        )}
        onClick={() => onChangeAction('duration')}
      >
        <div className="flex items-start gap-2">
          <Clock className="mt-0.5 size-4 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{durationLabel}</p>
            <p className="mt-1 text-xs text-muted-foreground">{durationDescription}</p>
          </div>
        </div>
      </button>

      <button
        type="button"
        role="radio"
        aria-checked={value === 'until'}
        disabled={disabled}
        className={cn(
          'rounded-lg border px-3 py-3 text-left shadow-sm transition',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
          value === 'until' ? 'border-primary bg-primary/5' : 'border-border/60 bg-background/60 hover:bg-muted/20',
          disabled && 'cursor-not-allowed opacity-70 hover:bg-background/60',
        )}
        onClick={() => onChangeAction('until')}
      >
        <div className="flex items-start gap-2">
          <Calendar className="mt-0.5 size-4 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{untilLabel}</p>
            <p className="mt-1 text-xs text-muted-foreground">{untilDescription}</p>
          </div>
        </div>
      </button>
    </div>
  );
}

