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
    // Show sticky bar when scrolled past hero section (roughly 400px)
    const SCROLL_THRESHOLD = 400;

    const handleScroll = () => {
      const scrollY = window.scrollY;
      setIsVisible(scrollY > SCROLL_THRESHOLD);
    };

    // Initial check
    handleScroll();

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div
      className={cn(
        'fixed top-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-sm border-b transition-all duration-300 lg:hidden',
        isVisible
          ? 'translate-y-0 opacity-100'
          : '-translate-y-full opacity-0 pointer-events-none',
      )}
    >
      <div className="container mx-auto px-4 py-3 max-w-7xl">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <button
              type="button"
              onClick={onInfoClick}
              className="flex-shrink-0 p-2 -m-2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Event information"
            >
              <Info className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate">{eventName}</p>
              {price !== null && (
                <p className="text-xs text-muted-foreground">
                  {price === '0' ? labels.free : price}
                </p>
              )}
            </div>
          </div>

          {isRegistrationOpen && (
            <Button size="sm" asChild className="flex-shrink-0">
              <Link
                href={{
                  pathname: '/events/[seriesSlug]/[editionSlug]/register',
                  params: { seriesSlug, editionSlug },
                }}
              >
                {labels.registerNow}
              </Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
