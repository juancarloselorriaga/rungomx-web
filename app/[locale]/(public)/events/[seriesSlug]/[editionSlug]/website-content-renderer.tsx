import type { WebsiteContentBlocks } from '@/lib/events/website/types';
import { MapPin, Clock, FileText, Image as ImageIcon, Download } from 'lucide-react';
import { PhotoGallery } from '@/components/events/photo-gallery';

type WebsiteContentRendererProps = {
  blocks: WebsiteContentBlocks;
  mediaUrls?: Map<string, string>;
  labels?: {
    documents?: string;
    photos?: string;
    terrain?: string;
    download?: string;
    sponsors?: string;
    gallery?: {
      loadMore?: string;
      showingOf?: string;
    };
  };
};

export function WebsiteContentRenderer({ blocks, mediaUrls, labels }: WebsiteContentRendererProps) {
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

  // Check if any tier has at least one sponsor
  const hasSponsorsContent =
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
      <div className="text-center py-12 text-muted-foreground">
        <p>No additional content available at this time.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Overview Section */}
      {hasOverviewContent && overview && (
        <section>
          {overview.title && <h2 className="text-2xl font-bold mb-4">{overview.title}</h2>}
          {overview.content && (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <p className="whitespace-pre-wrap">{overview.content}</p>
            </div>
          )}
          {overview.terrain && (
            <div className="mt-4 rounded-lg border bg-muted/30 p-4">
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                {labels?.terrain || 'Terrain'}
              </h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {overview.terrain}
              </p>
            </div>
          )}
        </section>
      )}

      {/* Course Section */}
      {hasCourseContent && course && (
        <section>
          {course.title && <h2 className="text-2xl font-bold mb-4">{course.title}</h2>}
          {course.description && (
            <div className="prose prose-sm dark:prose-invert max-w-none mb-6">
              <p className="whitespace-pre-wrap">{course.description}</p>
            </div>
          )}

          <div className="grid gap-4">
            {/* Elevation */}
            {course.elevationGain && (
              <div className="rounded-lg border bg-card p-4">
                <h3 className="font-semibold mb-2">Elevation Gain</h3>
                <p className="text-sm text-muted-foreground">{course.elevationGain}</p>
              </div>
            )}

            {/* Elevation Profile */}
            {course.elevationProfileUrl && (
              <div className="rounded-lg border bg-card p-4">
                <h3 className="font-semibold mb-3">Elevation Profile</h3>
                <a
                  href={course.elevationProfileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline"
                >
                  View Elevation Profile
                </a>
              </div>
            )}

            {/* Course Map */}
            {course.mapUrl && (
              <div className="rounded-lg border bg-card p-4">
                <h3 className="font-semibold mb-3">Course Map</h3>
                <a
                  href={course.mapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline"
                >
                  View Course Map
                </a>
              </div>
            )}

            {/* Aid Stations */}
            {course.aidStations && course.aidStations.length > 0 && (
              <div className="rounded-lg border bg-card p-4">
                <h3 className="font-semibold mb-4">Aid Stations</h3>
                <div className="space-y-3">
                  {course.aidStations.map((station, index) => (
                    <div key={index} className="border-l-2 border-primary pl-4">
                      <p className="font-medium">{station.name}</p>
                      <div className="text-sm text-muted-foreground space-y-1">
                        {station.distanceKm !== undefined && (
                          <p>Distance: {station.distanceKm} km</p>
                        )}
                        {station.cutoffTime && <p>Cutoff: {station.cutoffTime}</p>}
                        {station.services && <p>{station.services}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Schedule Section */}
      {hasScheduleContent && schedule && (
        <section>
          {schedule.title && (
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <Clock className="h-6 w-6" />
              {schedule.title}
            </h2>
          )}

          <div className="grid gap-4">
            {/* Packet Pickup */}
            {schedule.packetPickup && (
              <div className="rounded-lg border bg-card p-4">
                <h3 className="font-semibold mb-2">Packet Pickup</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {schedule.packetPickup}
                </p>
              </div>
            )}

            {/* Parking */}
            {schedule.parking && (
              <div className="rounded-lg border bg-card p-4">
                <h3 className="font-semibold mb-2">Parking</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {schedule.parking}
                </p>
              </div>
            )}

            {/* Race Day */}
            {schedule.raceDay && (
              <div className="rounded-lg border bg-card p-4">
                <h3 className="font-semibold mb-2">Race Day</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {schedule.raceDay}
                </p>
              </div>
            )}

            {/* Start Times */}
            {schedule.startTimes && schedule.startTimes.length > 0 && (
              <div className="rounded-lg border bg-card p-4">
                <h3 className="font-semibold mb-3">Start Times</h3>
                <div className="space-y-2">
                  {schedule.startTimes.map((startTime, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between py-2 border-b last:border-0"
                    >
                      <span className="font-medium">{startTime.distanceLabel}</span>
                      <div className="text-right">
                        <p className="text-sm">{startTime.time}</p>
                        {startTime.notes && (
                          <p className="text-xs text-muted-foreground">{startTime.notes}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Media Section */}
      {hasMediaContent && media && (
        <section>
          {media.title && (
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <ImageIcon className="h-6 w-6" />
              {media.title}
            </h2>
          )}

          <div className="grid gap-6">
            {/* Documents */}
            {media.documents && media.documents.length > 0 && (
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  {labels?.documents || 'Documents'}
                </h3>
                <div className="grid gap-2">
                  {media.documents.map((doc, index) => {
                    const url = mediaUrls?.get(doc.mediaId);
                    return url ? (
                      <a
                        key={doc.mediaId}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg border bg-card p-3 flex items-center gap-3 hover:bg-muted/50 transition-colors group"
                      >
                        <FileText className="h-5 w-5 text-primary shrink-0" />
                        <span className="text-sm font-medium flex-1">{doc.label}</span>
                        <div className="flex items-center gap-2 text-muted-foreground group-hover:text-primary transition-colors">
                          <span className="text-xs hidden sm:inline">
                            {labels?.download || 'Download'}
                          </span>
                          <Download className="h-4 w-4" />
                        </div>
                      </a>
                    ) : (
                      <div
                        key={doc.mediaId || index}
                        className="rounded-lg border bg-card p-3 flex items-center gap-3"
                      >
                        <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium">{doc.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Photos Gallery */}
            {media.photos && media.photos.length > 0 && (
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <ImageIcon className="h-5 w-5" />
                  {labels?.photos || 'Photos'}
                </h3>
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
            )}
          </div>
        </section>
      )}
    </div>
  );
}
