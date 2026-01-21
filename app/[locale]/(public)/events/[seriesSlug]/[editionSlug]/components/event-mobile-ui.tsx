'use client';

import { useState } from 'react';
import { EventMobileStickyBar } from './event-mobile-sticky-bar';
import { EventMobileInfoSheet } from './event-mobile-info-sheet';

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

type EventMobileUIProps = {
  eventName: string;
  price: string | null;
  seriesSlug: string;
  editionSlug: string;
  isRegistrationOpen: boolean;
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
    registerNow: string;
    free: string;
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

export function EventMobileUI({
  eventName,
  price,
  seriesSlug,
  editionSlug,
  isRegistrationOpen,
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
}: EventMobileUIProps) {
  const [isInfoSheetOpen, setIsInfoSheetOpen] = useState(false);

  return (
    <>
      <EventMobileStickyBar
        eventName={eventName}
        price={price}
        seriesSlug={seriesSlug}
        editionSlug={editionSlug}
        isRegistrationOpen={isRegistrationOpen}
        onInfoClick={() => setIsInfoSheetOpen(true)}
        labels={{
          registerNow: labels.registerNow,
          free: labels.free,
        }}
      />
      <EventMobileInfoSheet
        isOpen={isInfoSheetOpen}
        onOpenChange={setIsInfoSheetOpen}
        eventDate={eventDate}
        location={location}
        address={address}
        latitude={latitude}
        longitude={longitude}
        organizationName={organizationName}
        externalUrl={externalUrl}
        registrationOpensAt={registrationOpensAt}
        registrationClosesAt={registrationClosesAt}
        isRegistrationPaused={isRegistrationPaused}
        isRegistrationOpen={isRegistrationOpen}
        seriesSlug={seriesSlug}
        editionSlug={editionSlug}
        otherEditions={otherEditions}
        locale={locale}
        labels={{
          eventDate: labels.eventDate,
          location: labels.location,
          organizer: labels.organizer,
          viewMap: labels.viewMap,
          registrationDetails: labels.registrationDetails,
          registrationOpens: labels.registrationOpens,
          registrationCloses: labels.registrationCloses,
          registrationPaused: labels.registrationPaused,
          registrationOpen: labels.registrationOpen,
          registrationClosed: labels.registrationClosed,
          registerNow: labels.registerNow,
          otherEditionsTitle: labels.otherEditionsTitle,
        }}
      />
    </>
  );
}
