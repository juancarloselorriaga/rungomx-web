import type { WebsiteContentBlocks } from '@/lib/events/website/types';
import { MapPin, Clock, FileText, Image as ImageIcon, Download, Award } from 'lucide-react';
import { PhotoGallery } from '@/components/events/photo-gallery';
import { MarkdownContent } from '@/components/markdown/markdown-content';
import { SponsorTierDisplay } from '@/components/events/sponsor-tier-display';
import { Badge } from '@/components/common/badge';

type WebsiteContentRendererProps = {
  blocks: WebsiteContentBlocks;
  mediaUrls?: Map<string, string>;
  showSponsors?: boolean;
  labels?: {
    noAdditionalContent?: string;
    documents?: string;
    photos?: string;
    terrain?: string;
    elevationGain?: string;
    elevationProfile?: string;
    viewElevationProfile?: string;
    courseMap?: string;
    viewCourseMap?: string;
    aidStations?: string;
    distance?: string;
    cutoff?: string;
    packetPickup?: string;
    parking?: string;
    raceDay?: string;
    startTimes?: string;
    download?: string;
    sponsors?: string;
    gallery?: {
      loadMore?: string;
      showingOf?: string;
    };
  };
};

const surfaceClassName =
  'rounded-[1.3rem] border border-border/45 bg-[color-mix(in_oklch,var(--background)_80%,var(--background-surface)_20%)] p-4 md:p-5';

export function WebsiteContentRenderer({
  blocks,
  mediaUrls,
  showSponsors = false,
  labels,
}: WebsiteContentRendererProps) {
  const overview = blocks.overview;
  const course = blocks.course;
  const schedule = blocks.schedule;
  const media = blocks.media;
  const sponsors = blocks.sponsors;

  const hasOverviewContent =
    Boolean(overview?.enabled) && Boolean(overview?.content || overview?.terrain);
  const hasCourseContent =
    Boolean(course?.enabled) &&
    Boolean(
      course?.title ||
        course?.description ||
        course?.elevationGain ||
        course?.elevationProfileUrl ||
        course?.mapUrl ||
        (course?.aidStations?.length ?? 0) > 0,
    );
  const hasScheduleContent =
    Boolean(schedule?.enabled) &&
    Boolean(
      schedule?.title ||
        schedule?.packetPickup ||
        schedule?.parking ||
        schedule?.raceDay ||
        (schedule?.startTimes?.length ?? 0) > 0,
    );
  const hasMediaContent =
    Boolean(media?.enabled) &&
    Boolean((media?.photos?.length ?? 0) > 0 || (media?.documents?.length ?? 0) > 0);
  const hasSponsorsContent =
    showSponsors &&
    Boolean(sponsors?.enabled) &&
    Boolean(sponsors?.tiers?.some((tier) => (tier.sponsors?.length ?? 0) > 0));

  if (
    !hasOverviewContent &&
    !hasCourseContent &&
    !hasScheduleContent &&
    !hasMediaContent &&
    !hasSponsorsContent
  ) {
    return (
      <div className="rounded-[1.3rem] border border-border/45 bg-[color-mix(in_oklch,var(--background)_82%,var(--background-surface)_18%)] px-5 py-6 text-sm leading-7 text-muted-foreground">
        <p>{labels?.noAdditionalContent || 'More event details will be added soon.'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {hasOverviewContent && overview ? (
        <section className="space-y-5">
          {overview.title ? (
            <h2 className="font-display text-[clamp(1.45rem,2.6vw,1.95rem)] font-medium leading-[0.98] tracking-[-0.03em] text-foreground">
              {overview.title}
            </h2>
          ) : null}
          {overview.content ? <MarkdownContent content={overview.content} /> : null}
          {overview.terrain ? (
            <div className={surfaceClassName}>
              <Badge variant="blue" size="sm" icon={<MapPin className="h-3.5 w-3.5" />}>
                {labels?.terrain || 'Terrain'}
              </Badge>
              <div className="mt-4">
                <MarkdownContent
                  content={overview.terrain}
                  className="text-sm leading-7 text-muted-foreground"
                />
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {hasCourseContent && course ? (
        <section className="space-y-5">
          {course.title ? (
            <h2 className="font-display text-[clamp(1.45rem,2.6vw,1.95rem)] font-medium leading-[0.98] tracking-[-0.03em] text-foreground">
              {course.title}
            </h2>
          ) : null}
          {course.description ? (
            <div>
              <MarkdownContent content={course.description} />
            </div>
          ) : null}

          <div className="grid gap-4">
            {course.elevationGain ? (
              <div className={surfaceClassName}>
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-foreground/75">
                  {labels?.elevationGain || 'Elevation gain'}
                </p>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">
                  {course.elevationGain}
                </p>
              </div>
            ) : null}

            {course.elevationProfileUrl ? (
              <div className={surfaceClassName}>
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-foreground/75">
                  {labels?.elevationProfile || 'Elevation profile'}
                </p>
                <a
                  href={course.elevationProfileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex text-sm font-semibold text-foreground underline-offset-4 hover:underline"
                >
                  {labels?.viewElevationProfile || 'View elevation profile'}
                </a>
              </div>
            ) : null}

            {course.mapUrl ? (
              <div className={surfaceClassName}>
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-foreground/75">
                  {labels?.courseMap || 'Course map'}
                </p>
                <a
                  href={course.mapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex text-sm font-semibold text-foreground underline-offset-4 hover:underline"
                >
                  {labels?.viewCourseMap || 'View course map'}
                </a>
              </div>
            ) : null}

            {course.aidStations && course.aidStations.length > 0 ? (
              <div className={surfaceClassName}>
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-foreground/75">
                  {labels?.aidStations || 'Aid stations'}
                </p>
                <div className="mt-4 space-y-4">
                  {course.aidStations.map((station, index) => (
                    <div key={index} className="border-t border-border/60 pt-4 first:border-t-0 first:pt-0">
                      <p className="text-sm font-semibold text-foreground">{station.name}</p>
                      <div className="mt-1 space-y-1 text-sm leading-7 text-muted-foreground">
                        {station.distanceKm !== undefined ? (
                          <p>
                            {labels?.distance || 'Distance'}: {station.distanceKm} km
                          </p>
                        ) : null}
                        {station.cutoffTime ? (
                          <p>
                            {labels?.cutoff || 'Cutoff'}: {station.cutoffTime}
                          </p>
                        ) : null}
                        {station.services ? <p>{station.services}</p> : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {hasScheduleContent && schedule ? (
        <section className="space-y-5">
          {schedule.title ? (
            <h2 className="font-display flex items-center gap-3 text-[clamp(1.45rem,2.6vw,1.95rem)] font-medium leading-[0.98] tracking-[-0.03em] text-foreground">
              <Clock className="h-5 w-5 text-muted-foreground" />
              {schedule.title}
            </h2>
          ) : null}

          <div className="grid gap-4">
            {schedule.packetPickup ? (
              <div className={surfaceClassName}>
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-foreground/75">
                  {labels?.packetPickup || 'Packet pickup'}
                </p>
                <div className="mt-3">
                  <MarkdownContent
                    content={schedule.packetPickup}
                    className="text-sm leading-7 text-muted-foreground"
                  />
                </div>
              </div>
            ) : null}

            {schedule.parking ? (
              <div className={surfaceClassName}>
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-foreground/75">
                  {labels?.parking || 'Parking'}
                </p>
                <div className="mt-3">
                  <MarkdownContent
                    content={schedule.parking}
                    className="text-sm leading-7 text-muted-foreground"
                  />
                </div>
              </div>
            ) : null}

            {schedule.raceDay ? (
              <div className={surfaceClassName}>
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-foreground/75">
                  {labels?.raceDay || 'Race day'}
                </p>
                <div className="mt-3">
                  <MarkdownContent
                    content={schedule.raceDay}
                    className="text-sm leading-7 text-muted-foreground"
                  />
                </div>
              </div>
            ) : null}

            {schedule.startTimes && schedule.startTimes.length > 0 ? (
              <div className={surfaceClassName}>
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-foreground/75">
                  {labels?.startTimes || 'Start times'}
                </p>
                <div className="mt-4 space-y-3">
                  {schedule.startTimes.map((startTime, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between gap-4 border-t border-border/60 pt-3 first:border-t-0 first:pt-0"
                    >
                      <span className="text-sm font-semibold text-foreground">
                        {startTime.distanceLabel}
                      </span>
                      <div className="text-right">
                        <p className="text-sm text-foreground">{startTime.time}</p>
                        {startTime.notes ? (
                          <p className="text-xs text-muted-foreground">{startTime.notes}</p>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {hasMediaContent && media ? (
        <section className="space-y-6">
          {media.title ? (
            <h2 className="font-display flex items-center gap-3 text-[clamp(1.45rem,2.6vw,1.95rem)] font-medium leading-[0.98] tracking-[-0.03em] text-foreground">
              <ImageIcon className="h-5 w-5 text-muted-foreground" />
              {media.title}
            </h2>
          ) : null}

          {media.documents && media.documents.length > 0 ? (
            <div>
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-foreground/75">
                {labels?.documents || 'Documents'}
              </p>
              <div className="mt-3 grid gap-2">
                {media.documents.map((doc, index) => {
                  const url = mediaUrls?.get(doc.mediaId);
                  return url ? (
                    <a
                      key={doc.mediaId}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 rounded-[1.1rem] border border-border/45 bg-[color-mix(in_oklch,var(--background)_80%,var(--background-surface)_20%)] px-4 py-3 transition-colors hover:bg-background"
                    >
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                        {doc.label}
                      </span>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <span className="hidden text-xs sm:inline">
                          {labels?.download || 'Download'}
                        </span>
                        <Download className="h-4 w-4" />
                      </div>
                    </a>
                  ) : (
                    <div
                      key={doc.mediaId || index}
                      className="flex items-center gap-3 rounded-[1.1rem] border border-border/45 bg-[color-mix(in_oklch,var(--background)_80%,var(--background-surface)_20%)] px-4 py-3"
                    >
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="text-sm font-semibold text-foreground">{doc.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {media.photos && media.photos.length > 0 ? (
            <div>
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-foreground/75">
                {labels?.photos || 'Photos'}
              </p>
              <div className="mt-4">
                <PhotoGallery
                  photos={media.photos
                    .slice()
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((photo) => ({
                      url: mediaUrls?.get(photo.mediaId) || '',
                      caption: photo.caption,
                      mediaId: photo.mediaId,
                    }))}
                  columns={3}
                  initialCount={12}
                  loadMoreCount={12}
                  labels={labels?.gallery}
                />
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {hasSponsorsContent && sponsors ? (
        <section className="space-y-6">
          {sponsors.title ? (
            <h2 className="font-display flex items-center gap-3 text-[clamp(1.45rem,2.6vw,1.95rem)] font-medium leading-[0.98] tracking-[-0.03em] text-foreground">
              <Award className="h-5 w-5 text-muted-foreground" />
              {sponsors.title}
            </h2>
          ) : null}
          {sponsors.subtitle ? (
            <p className="max-w-[42rem] text-sm leading-7 text-muted-foreground">{sponsors.subtitle}</p>
          ) : null}
          <div className="space-y-6">
            {sponsors.tiers
              ?.slice()
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((tier) => (
                <SponsorTierDisplay key={tier.id} tier={tier} mediaUrls={mediaUrls} />
              ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
