'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Rows3, Rows4 } from 'lucide-react';
import { useCallback, useSyncExternalStore } from 'react';

export type ResultsDensityMode = 'compact' | 'full';

type ResultsDensitySwitchProps = {
  storageKey: string;
  labels: {
    label: string;
    compact: string;
    full: string;
  };
  className?: string;
  defaultMode?: ResultsDensityMode;
  onDensityChangeAction?: (mode: ResultsDensityMode) => void;
};

const RESULTS_DENSITY_EVENT = 'results-density-change';

function toDensityMode(
  value: string | null | undefined,
  fallback: ResultsDensityMode,
): ResultsDensityMode {
  if (value === 'compact' || value === 'full') return value;
  return fallback;
}

function readDensity(storageKey: string, fallback: ResultsDensityMode): ResultsDensityMode {
  if (typeof window === 'undefined') return fallback;
  return toDensityMode(window.localStorage.getItem(storageKey), fallback);
}

function subscribeToDensity(storageKey: string, callback: () => void) {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === storageKey) {
      callback();
    }
  };

  const handleCustomEvent = (event: Event) => {
    const detail = (event as CustomEvent<string | undefined>).detail;
    if (!detail || detail === storageKey) {
      callback();
    }
  };

  window.addEventListener('storage', handleStorage);
  window.addEventListener(RESULTS_DENSITY_EVENT, handleCustomEvent);

  return () => {
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener(RESULTS_DENSITY_EVENT, handleCustomEvent);
  };
}

export function useResultsDensityPreference(
  storageKey: string,
  fallback: ResultsDensityMode = 'full',
) {
  const subscribe = useCallback(
    (callback: () => void) => subscribeToDensity(storageKey, callback),
    [storageKey],
  );
  const getSnapshot = useCallback(() => readDensity(storageKey, fallback), [storageKey, fallback]);
  const getServerSnapshot = useCallback(() => fallback, [fallback]);

  const density = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setDensity = useCallback(
    (nextDensity: ResultsDensityMode) => {
      window.localStorage.setItem(storageKey, nextDensity);
      window.dispatchEvent(
        new CustomEvent<string>(RESULTS_DENSITY_EVENT, { detail: storageKey }),
      );
    },
    [storageKey],
  );

  return [density, setDensity] as const;
}

export function ResultsDensitySwitch({
  storageKey,
  labels,
  className,
  defaultMode = 'full',
  onDensityChangeAction,
}: ResultsDensitySwitchProps) {
  const [density, setDensity] = useResultsDensityPreference(storageKey, defaultMode);

  const handleDensityChange = (mode: ResultsDensityMode) => {
    setDensity(mode);
    onDensityChangeAction?.(mode);
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="text-xs font-medium text-muted-foreground">{labels.label}</span>
      <div className="inline-flex items-center rounded-md border bg-background p-1">
        <Button
          type="button"
          size="sm"
          variant={density === 'compact' ? 'secondary' : 'ghost'}
          className="min-w-0 px-2.5"
          aria-pressed={density === 'compact'}
          onClick={() => handleDensityChange('compact')}
        >
          <Rows4 className="h-3.5 w-3.5" />
          {labels.compact}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={density === 'full' ? 'secondary' : 'ghost'}
          className="min-w-0 px-2.5"
          aria-pressed={density === 'full'}
          onClick={() => handleDensityChange('full')}
        >
          <Rows3 className="h-3.5 w-3.5" />
          {labels.full}
        </Button>
      </div>
    </div>
  );
}
