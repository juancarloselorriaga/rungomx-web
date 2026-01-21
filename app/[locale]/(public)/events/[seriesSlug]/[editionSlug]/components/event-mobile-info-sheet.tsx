'use client';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { ExternalLink } from 'lucide-react';

type OtherEdition = {
  id: string;
  slug: string;
  editionLabel: string;
  startsAt: Date | null;
  timezone: string;
  city: string | null;
  state: string | null;
  locationDisplay: string | null;
  isRegistrationOpen: boolean;
};

type EventMobileInfoSheetProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  eventDate: string | null;
  location: string | null;
  address: string | null;
  latitude: string | null;
  longitude: string | null;
  organizationName: string;
  externalUrl: string | null;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
  isRegistrationPaused: boolean;
  isRegistrationOpen: boolean;
  seriesSlug: string;
  editionSlug: string;
  otherEditions: OtherEdition[];
  locale: string;
  labels: {
    eventDate: string;
    location: string;
    organizer: string;
    viewMap: string;
    registrationDetails: string;
    registrationOpens: string;
    registrationCloses: string;
    registrationPaused: string;
    registrationOpen: string;
    registrationClosed: string;
    registerNow: string;
    otherEditionsTitle: string;
  };
};

export function EventMobileInfoSheet({
  isOpen,
  onOpenChange,
  eventDate,
  location,
  address,
  latitude,
  longitude,
  organizationName,
  externalUrl,
  registrationOpensAt,
  registrationClosesAt,
  isRegistrationPaused,
  isRegistrationOpen,
  seriesSlug,
  editionSlug,
  otherEditions,
  locale,
  labels,
}: EventMobileInfoSheetProps) {
  const hasRegistrationDetails = Boolean(
    registrationOpensAt || registrationClosesAt || isRegistrationPaused,
  );

  const formatEditionDate = (edition: OtherEdition) => {
    if (!edition.startsAt) return 'TBA';
    return new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: edition.timezone,
    }).format(new Date(edition.startsAt));
  };

  const getEditionLocation = (edition: OtherEdition) => {
    return (
      edition.locationDisplay ||
      [edition.city, edition.state].filter(Boolean).join(', ')
    );
  };

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-xl">
        <SheetHeader className="border-b pb-4">
          <SheetTitle>Event Details</SheetTitle>
        </SheetHeader>

        <div className="py-4 space-y-6">
          {/* Event Date */}
          <div>
            <h3 className="font-semibold text-sm text-muted-foreground mb-1">
              {labels.eventDate}
            </h3>
            <p className="text-sm">
              {eventDate || <span className="italic">TBA</span>}
            </p>
          </div>

          {/* Location */}
          {location && (
            <div>
              <h3 className="font-semibold text-sm text-muted-foreground mb-1">
                {labels.location}
              </h3>
              <p className="text-sm">{location}</p>
              {address && (
                <p className="text-sm text-muted-foreground mt-0.5">{address}</p>
              )}
              {latitude && longitude && (
                <a
                  href={`https://www.google.com/maps?q=${latitude},${longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline inline-flex items-center gap-1 mt-1"
                >
                  {labels.viewMap}
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          )}

          {/* Organizer */}
          <div>
            <h3 className="font-semibold text-sm text-muted-foreground mb-1">
              {labels.organizer}
            </h3>
            <p className="text-sm">{organizationName}</p>
            {externalUrl && (
              <a
                href={externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline inline-flex items-center gap-1 mt-1"
              >
                Official website
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          {/* Registration Details */}
          {hasRegistrationDetails && (
            <div className="border-t pt-4">
              <h3 className="font-semibold text-sm text-muted-foreground mb-2">
                {labels.registrationDetails}
              </h3>
              <div className="space-y-1 text-sm">
                {registrationOpensAt && labels.registrationOpens && (
                  <p>{labels.registrationOpens}</p>
                )}
                {registrationClosesAt && labels.registrationCloses && (
                  <p>{labels.registrationCloses}</p>
                )}
                {isRegistrationPaused && (
                  <p className="text-destructive">{labels.registrationPaused}</p>
                )}
              </div>
            </div>
          )}

          {/* Other Editions */}
          {otherEditions.length > 0 && (
            <div className="border-t pt-4">
              <h3 className="font-semibold text-sm text-muted-foreground mb-3">
                {labels.otherEditionsTitle}
              </h3>
              <ul className="space-y-2">
                {otherEditions.map((edition) => {
                  const editionDate = formatEditionDate(edition);
                  const editionLocation = getEditionLocation(edition);

                  return (
                    <li key={edition.id}>
                      <Link
                        href={{
                          pathname: '/events/[seriesSlug]/[editionSlug]',
                          params: { seriesSlug, editionSlug: edition.slug },
                        }}
                        onClick={() => onOpenChange(false)}
                        className="group block rounded-md -mx-2 px-2 py-2 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {edition.editionLabel}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {[editionDate, editionLocation].filter(Boolean).join(' · ')}
                            </p>
                          </div>
                          <span
                            className={cn(
                              'text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap',
                              edition.isRegistrationOpen
                                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                : 'bg-muted text-muted-foreground',
                            )}
                          >
                            {edition.isRegistrationOpen
                              ? labels.registrationOpen
                              : labels.registrationClosed}
                          </span>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Register CTA */}
          {isRegistrationOpen && (
            <div className="border-t pt-4">
              <Button asChild className="w-full">
                <Link
                  href={{
                    pathname: '/events/[seriesSlug]/[editionSlug]/register',
                    params: { seriesSlug, editionSlug },
                  }}
                  onClick={() => onOpenChange(false)}
                >
                  {labels.registerNow}
                </Link>
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
