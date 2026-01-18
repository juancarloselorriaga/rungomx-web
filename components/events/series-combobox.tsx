'use client';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Check, ChevronsUpDown, Plus, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState, useRef, useEffect } from 'react';

type EventSeriesSummary = {
  id: string;
  name: string;
  slug: string;
  sportType: string;
};

type SeriesComboboxProps = {
  series: EventSeriesSummary[];
  selectedSeriesId: string | null;
  showNewSeries: boolean;
  onSelectSeries: (seriesId: string) => void;
  onSelectNewSeries: () => void;
  disabled?: boolean;
};

export function SeriesCombobox({
  series,
  selectedSeriesId,
  showNewSeries,
  onSelectSeries,
  onSelectNewSeries,
  disabled = false,
}: SeriesComboboxProps) {
  const t = useTranslations('pages.dashboardEvents.createEvent');
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Focus search input when popover opens
  useEffect(() => {
    if (open && searchInputRef.current) {
      // Small delay to ensure popover is rendered
      setTimeout(() => searchInputRef.current?.focus(), 0);
    }
  }, [open]);

  // Filter series based on search query
  const filteredSeries = useMemo(() => {
    if (!searchQuery.trim()) return series;
    const query = searchQuery.toLowerCase();
    return series.filter((s) => s.name.toLowerCase().includes(query));
  }, [series, searchQuery]);

  // Get display value for the trigger button
  const displayValue = useMemo(() => {
    if (showNewSeries) {
      return t('event.newSeries');
    }
    if (selectedSeriesId) {
      const selected = series.find((s) => s.id === selectedSeriesId);
      return selected?.name || t('event.selectSeries');
    }
    return t('event.selectSeries');
  }, [showNewSeries, selectedSeriesId, series, t]);

  const handleSelectNew = () => {
    onSelectNewSeries();
    setOpen(false);
    setSearchQuery('');
  };

  const handleSelectSeries = (seriesId: string) => {
    onSelectSeries(seriesId);
    setOpen(false);
    setSearchQuery('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
            disabled={disabled}
          >
            <span className={cn(!showNewSeries && !selectedSeriesId && 'text-muted-foreground')}>
              {displayValue}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          {/* Search input */}
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('event.searchSeries')}
              className="flex h-10 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          {/* Options list */}
          <div className="max-h-60 overflow-auto p-1">
            {/* "Create new series" option - always at top */}
            <button
              type="button"
              onClick={handleSelectNew}
              className={cn(
                'relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors',
                'hover:bg-accent hover:text-accent-foreground',
                showNewSeries && 'bg-accent',
              )}
            >
              <Plus className="mr-2 h-4 w-4" />
              <span className="flex-1 text-left">{t('event.newSeries')}</span>
              {showNewSeries && <Check className="ml-2 h-4 w-4" />}
            </button>

            {/* Separator */}
            {series.length > 0 && <div className="my-1 h-px bg-border" />}

            {/* Existing series */}
            {filteredSeries.length === 0 && searchQuery && (
              <p className="px-2 py-4 text-center text-sm text-muted-foreground">
                {t('event.noSeriesFound')}
              </p>
            )}

            {filteredSeries.map((seriesItem) => (
              <button
                key={seriesItem.id}
                type="button"
                onClick={() => handleSelectSeries(seriesItem.id)}
                className={cn(
                  'relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors',
                  'hover:bg-accent hover:text-accent-foreground',
                  !showNewSeries && selectedSeriesId === seriesItem.id && 'bg-accent',
                )}
              >
                <span className="flex-1 text-left truncate">{seriesItem.name}</span>
                {!showNewSeries && selectedSeriesId === seriesItem.id && (
                  <Check className="ml-2 h-4 w-4 shrink-0" />
                )}
              </button>
            ))}
          </div>
        </PopoverContent>
    </Popover>
  );
}
