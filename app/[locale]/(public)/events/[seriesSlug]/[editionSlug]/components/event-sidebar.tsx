import { Badge } from '@/components/common/badge';
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
  isRegistrationOpen: boolean;
  otherEditions: OtherEdition[];
  locale: string;
  labels: {
    eventDate: string;
    location: string;
    organizer: string;
    officialWebsite: string;
    viewMap: string;
    registrationDetails: string;
    registrationOpens: string;
    registrationCloses: string;
    registrationPaused: string;
    registrationOpen: string;
    registrationClosed: string;
    otherEditionsTitle: string;
    tba: string;
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
  isRegistrationOpen,
  otherEditions,
  locale,
  labels,
}: EventSidebarProps) {
  const hasRegistrationDetails = Boolean(
    registrationOpensAt || registrationClosesAt || isRegistrationPaused,
  );

  const formatEditionDate = (edition: OtherEdition) => {
    if (!edition.startsAt) return labels.tba;
    return new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: edition.timezone,
    }).format(new Date(edition.startsAt));
  };

  const getEditionLocation = (edition: OtherEdition) => {
    return edition.locationDisplay || [edition.city, edition.state].filter(Boolean).join(', ');
  };

  const currentRegistrationLabel = isRegistrationPaused
    ? labels.registrationPaused
    : isRegistrationOpen
      ? labels.registrationOpen
      : labels.registrationClosed;

  const currentRegistrationVariant: 'green' | 'indigo' | 'outline' = isRegistrationPaused
    ? 'indigo'
    : isRegistrationOpen
      ? 'green'
      : 'outline';

  return (
    <aside className="hidden lg:block">
      <div className="sticky top-24 rounded-[1.5rem] border border-border/45 bg-[color-mix(in_oklch,var(--background)_80%,var(--background-surface)_20%)] p-6 shadow-[0_24px_70px_-56px_rgba(15,23,42,0.45)]">
        <Badge variant={currentRegistrationVariant}>{currentRegistrationLabel}</Badge>

        <div className="mt-6 space-y-5 text-sm text-muted-foreground">
          <section className="border-t border-border/70 pt-4">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-foreground/75">
              {labels.eventDate}
            </p>
            <p className="mt-2 leading-7 text-foreground">{eventDate || labels.tba}</p>
          </section>

          {location ? (
            <section className="border-t border-border/70 pt-4">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-foreground/75">
                {labels.location}
              </p>
              <p className="mt-2 leading-7 text-foreground">{location}</p>
              {address ? <p className="mt-1 leading-7">{address}</p> : null}
              {latitude && longitude ? (
                <a
                  href={`https://www.google.com/maps?q=${latitude},${longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-foreground underline-offset-4 hover:underline"
                >
                  {labels.viewMap}
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : null}
            </section>
          ) : null}

          <section className="border-t border-border/70 pt-4">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-foreground/75">
              {labels.organizer}
            </p>
            <p className="mt-2 leading-7 text-foreground">{organizationName}</p>
            {externalUrl ? (
              <a
                href={externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-foreground underline-offset-4 hover:underline"
              >
                {labels.officialWebsite}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : null}
          </section>

          {hasRegistrationDetails ? (
            <section className="border-t border-border/70 pt-4">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-foreground/75">
                {labels.registrationDetails}
              </p>
              <div className="mt-3 space-y-2 leading-7">
                {registrationOpensAt && labels.registrationOpens ? <p>{labels.registrationOpens}</p> : null}
                {registrationClosesAt && labels.registrationCloses ? <p>{labels.registrationCloses}</p> : null}
                {isRegistrationPaused ? (
                  <p className="text-[var(--brand-indigo)]">{labels.registrationPaused}</p>
                ) : null}
              </div>
            </section>
          ) : null}

          {otherEditions.length > 0 ? (
            <section className="border-t border-border/70 pt-4">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-foreground/75">
                {labels.otherEditionsTitle}
              </p>
              <ul className="mt-3 space-y-3">
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
                        className="group block rounded-[1.1rem] border border-border/50 bg-background/70 px-4 py-3 transition-colors hover:bg-background"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-foreground">
                              {edition.editionLabel}
                            </p>
                            <p className="mt-1 truncate text-xs text-muted-foreground">
                              {[editionDate, editionLocation].filter(Boolean).join(' · ')}
                            </p>
                          </div>
                          <span
                            className={cn(
                              'shrink-0 text-[0.68rem] font-semibold uppercase tracking-[0.14em]',
                              edition.isRegistrationOpen
                                ? 'text-[var(--brand-green-dark)]'
                                : 'text-muted-foreground',
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
            </section>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
