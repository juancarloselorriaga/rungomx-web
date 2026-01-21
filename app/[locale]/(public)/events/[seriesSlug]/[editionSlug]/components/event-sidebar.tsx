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

type EventSidebarProps = {
  seriesSlug: string;
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
    otherEditionsTitle: string;
  };
};

export function EventSidebar({
  seriesSlug,
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
  otherEditions,
  locale,
  labels,
}: EventSidebarProps) {
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
    <div className="hidden lg:block space-y-6">
      <div className="rounded-lg border bg-card p-6 space-y-4 sticky top-24">
        <h3 className="font-semibold">{labels.eventDate}</h3>
        {eventDate ? (
          <p className="text-sm text-muted-foreground">{eventDate}</p>
        ) : (
          <p className="text-sm text-muted-foreground italic">TBA</p>
        )}

        {location && (
          <>
            <h3 className="font-semibold pt-2">{labels.location}</h3>
            <p className="text-sm text-muted-foreground">{location}</p>
            {address && <p className="text-sm text-muted-foreground">{address}</p>}
            {latitude && longitude && (
              <a
                href={`https://www.google.com/maps?q=${latitude},${longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline inline-flex items-center gap-1"
              >
                {labels.viewMap}
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </>
        )}

        <h3 className="font-semibold pt-2">{labels.organizer}</h3>
        <p className="text-sm text-muted-foreground">{organizationName}</p>

        {externalUrl && (
          <a
            href={externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline inline-flex items-center gap-1"
          >
            Official website
            <ExternalLink className="h-3 w-3" />
          </a>
        )}

        {hasRegistrationDetails && (
          <div className="border-t pt-4 space-y-2">
            <h3 className="font-semibold">{labels.registrationDetails}</h3>
            <div className="space-y-1 text-sm text-muted-foreground">
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

        {otherEditions.length > 0 && (
          <div className="border-t pt-4 space-y-3">
            <h3 className="font-semibold">{labels.otherEditionsTitle}</h3>
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
                      className="group block rounded-md -mx-2 px-2 py-1.5 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{edition.editionLabel}</p>
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
      </div>
    </div>
  );
}
