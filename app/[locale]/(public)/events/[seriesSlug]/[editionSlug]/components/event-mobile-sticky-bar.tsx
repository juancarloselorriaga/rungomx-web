'use client';

import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { Info } from 'lucide-react';
import { useEffect, useState } from 'react';

type EventMobileStickyBarProps = {
  eventName: string;
  price: string | null;
  seriesSlug: string;
  editionSlug: string;
  isRegistrationOpen: boolean;
  onInfoClick: () => void;
  labels: {
    registerNow: string;
    free: string;
    infoButtonLabel: string;
  };
};

export function EventMobileStickyBar({
  eventName,
  price,
  seriesSlug,
  editionSlug,
  isRegistrationOpen,
  onInfoClick,
  labels,
}: EventMobileStickyBarProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const SCROLL_THRESHOLD = 400;

    const handleScroll = () => {
      setIsVisible(window.scrollY > SCROLL_THRESHOLD);
    };

    handleScroll();

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div
      className={cn(
        'fixed left-0 right-0 top-0 z-40 border-b border-border/60 bg-[color-mix(in_oklch,var(--background)_88%,var(--background-surface)_12%)]/95 backdrop-blur-md transition-all duration-300 lg:hidden',
        isVisible ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none',
      )}
    >
      <div className="mx-auto max-w-7xl px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button
              type="button"
              onClick={onInfoClick}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background/85 text-muted-foreground transition-colors hover:text-foreground"
              aria-label={labels.infoButtonLabel}
            >
              <Info className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{eventName}</p>
              {price !== null ? (
                <p className="mt-0.5 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  {price === '0' ? labels.free : price}
                </p>
              ) : null}
            </div>
          </div>

          {isRegistrationOpen ? (
            <Button size="sm" asChild className="shrink-0">
              <Link
                href={{
                  pathname: '/events/[seriesSlug]/[editionSlug]/register',
                  params: { seriesSlug, editionSlug },
                }}
              >
                {labels.registerNow}
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
