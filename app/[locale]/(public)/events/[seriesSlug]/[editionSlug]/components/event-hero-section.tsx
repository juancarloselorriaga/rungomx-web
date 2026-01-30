import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { ArrowLeft, Calendar, MapPin, Users } from 'lucide-react';
import Image from 'next/image';

type GroupDiscountRule = {
  minParticipants: number;
  percentOff: number;
};

type EventHeroSectionProps = {
  seriesSlug: string;
  editionSlug: string;
  seriesName: string;
  editionLabel: string;
  sportTypeLabel: string;
  heroImageUrl: string | null;
  eventDate: string | null;
  location: string | null;
  isRegistrationOpen: boolean;
  formattedMinPrice: string | null;
  groupDiscountRules?: GroupDiscountRule[];
  labels: {
    backToEvents: string;
    registrationOpen: string;
    registrationClosed: string;
    fromPrice: string;
    free: string;
    registerNow: string;
    registerWithFriends: string;
    groupDiscountBadge?: string;
  };
};

export function EventHeroSection({
  seriesSlug,
  editionSlug,
  seriesName,
  editionLabel,
  sportTypeLabel,
  heroImageUrl,
  eventDate,
  location,
  isRegistrationOpen,
  formattedMinPrice,
  groupDiscountRules = [],
  labels,
}: EventHeroSectionProps) {
  const hasGroupDiscount = groupDiscountRules.length > 0;
  return (
    <div className="relative bg-muted rounded-2xl">
      <div className="container mx-auto px-4 py-12 max-w-7xl">
        <Link
          href="/events"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          {labels.backToEvents}
        </Link>

        {heroImageUrl && (
          <div className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl border bg-muted mb-6">
            <Image
              src={heroImageUrl}
              alt={`${seriesName} ${editionLabel}`}
              fill
              className="object-cover"
              priority
              sizes="100vw"
            />
          </div>
        )}

        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <span className="inline-block rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
                {sportTypeLabel}
              </span>
              {hasGroupDiscount && labels.groupDiscountBadge && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                  <Users className="h-4 w-4" />
                  {labels.groupDiscountBadge}
                </span>
              )}
            </div>

            <h1 className="text-4xl font-bold tracking-tight">{seriesName}</h1>
            <p className="text-xl text-muted-foreground">{editionLabel}</p>

            <div className="flex flex-wrap gap-4 text-sm">
              {eventDate && (
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-primary" />
                  <span>{eventDate}</span>
                </div>
              )}
              {location && (
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  <span>{location}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col items-start lg:items-end gap-2">
            <span
              className={cn(
                'text-sm font-medium px-3 py-1.5 rounded-full',
                isRegistrationOpen
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {isRegistrationOpen ? labels.registrationOpen : labels.registrationClosed}
            </span>
            {formattedMinPrice ? (
              <span className="text-lg font-semibold">{labels.fromPrice}</span>
            ) : (
              <span className="text-lg font-semibold text-green-600">{labels.free}</span>
            )}
            {isRegistrationOpen && (
              <div className="mt-2 flex flex-col gap-3 sm:flex-row lg:justify-end">
                <Button size="lg" asChild>
                  <Link
                    href={{
                      pathname: '/events/[seriesSlug]/[editionSlug]/register',
                      params: { seriesSlug, editionSlug },
                    }}
                  >
                    {labels.registerNow}
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link
                    href={{
                      pathname: '/events/[seriesSlug]/[editionSlug]/groups/new',
                      params: { seriesSlug, editionSlug },
                    }}
                  >
                    {labels.registerWithFriends}
                  </Link>
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
