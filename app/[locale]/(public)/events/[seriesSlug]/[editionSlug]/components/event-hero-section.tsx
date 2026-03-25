import { Badge } from '@/components/common/badge';
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
    eventDate: string;
    location: string;
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
  const registrationLabel = isRegistrationOpen
    ? labels.registrationOpen
    : labels.registrationClosed;

  return (
    <section className="border-b border-border/60 bg-[color-mix(in_oklch,var(--background)_88%,var(--background-surface)_12%)]">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 md:py-10">
        <Link
          href="/events"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {labels.backToEvents}
        </Link>

        <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.95fr)] lg:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="blue">{sportTypeLabel}</Badge>
              {hasGroupDiscount && labels.groupDiscountBadge ? (
                <Badge variant="green" icon={<Users className="h-3.5 w-3.5" />}>
                  {labels.groupDiscountBadge}
                </Badge>
              ) : null}
              <Badge variant={isRegistrationOpen ? 'green' : 'outline'}>
                {registrationLabel}
              </Badge>
            </div>

            <h1 className="font-display mt-6 text-[clamp(3rem,7vw,6rem)] font-medium leading-[0.9] tracking-[-0.045em] text-foreground">
              {seriesName}
            </h1>
            <p className="mt-3 max-w-[40rem] text-[clamp(1.1rem,2.1vw,1.45rem)] leading-8 text-muted-foreground">
              {editionLabel}
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {eventDate ? (
                <div className="rounded-[1.25rem] border border-border/45 bg-[color-mix(in_oklch,var(--background)_82%,var(--background-surface)_18%)] px-4 py-3.5">
                  <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {labels.eventDate}
                  </p>
                  <p className="mt-2 flex items-start gap-2 text-sm leading-7 text-foreground">
                    <Calendar className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span>{eventDate}</span>
                  </p>
                </div>
              ) : null}
              {location ? (
                <div className="rounded-[1.25rem] border border-border/45 bg-[color-mix(in_oklch,var(--background)_82%,var(--background-surface)_18%)] px-4 py-3.5">
                  <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {labels.location}
                  </p>
                  <p className="mt-2 flex items-start gap-2 text-sm leading-7 text-foreground">
                    <MapPin className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span>{location}</span>
                  </p>
                </div>
              ) : null}
            </div>

            <div className="mt-8 border-t border-border/70 pt-6">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {isRegistrationOpen ? labels.registrationOpen : labels.registrationClosed}
              </p>
              <p className="font-display mt-3 text-[clamp(1.8rem,3.2vw,2.8rem)] font-medium leading-[0.95] tracking-[-0.035em] text-foreground">
                {formattedMinPrice ? labels.fromPrice : labels.free}
              </p>

              {isRegistrationOpen ? (
                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
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
              ) : null}
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[1.75rem] border border-border/45 bg-[color-mix(in_oklch,var(--background)_80%,var(--background-surface)_20%)]">
            {heroImageUrl ? (
              <div className="relative aspect-[4/3] w-full">
                <Image
                  src={heroImageUrl}
                  alt={`${seriesName} ${editionLabel}`}
                  fill
                  className="object-cover"
                  priority
                  sizes="(min-width: 1024px) 42vw, 100vw"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-black/0 to-transparent" />
              </div>
            ) : (
              <div className="flex aspect-[4/3] items-end bg-[radial-gradient(circle_at_top_left,rgba(30,138,110,0.18),transparent_48%),radial-gradient(circle_at_bottom_right,rgba(51,102,204,0.16),transparent_40%)] p-6">
                <div>
                  <Badge variant="primary">{sportTypeLabel}</Badge>
                  <p className="font-display mt-4 text-2xl font-medium leading-tight tracking-[-0.03em] text-foreground">
                    {seriesName}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{editionLabel}</p>
                </div>
              </div>
            )}
            <div
              aria-hidden
              className={cn(
                'pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-foreground/20 to-transparent',
                !heroImageUrl && 'hidden',
              )}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
