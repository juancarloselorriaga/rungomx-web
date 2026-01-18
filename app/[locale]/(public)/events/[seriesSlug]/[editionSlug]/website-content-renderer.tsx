import type { WebsiteContentBlocks } from '@/lib/events/website/types';
import { MapPin, Clock, FileText, Image as ImageIcon, Download, ExternalLink } from 'lucide-react';

type WebsiteContentRendererProps = {
  blocks: WebsiteContentBlocks;
  documentUrls?: Map<string, string>;
  labels?: {
    documents?: string;
    terrain?: string;
    download?: string;
  };
};

export function WebsiteContentRenderer({ blocks, documentUrls, labels }: WebsiteContentRendererProps) {
  const enabledSections = [
    blocks.overview?.enabled && blocks.overview,
    blocks.course?.enabled && blocks.course,
    blocks.schedule?.enabled && blocks.schedule,
    blocks.media?.enabled && blocks.media,
  ].filter(Boolean);

  if (enabledSections.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>No additional content available at this time.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Overview Section */}
      {blocks.overview?.enabled && blocks.overview.content && (
        <section>
          {blocks.overview.title && (
            <h2 className="text-2xl font-bold mb-4">{blocks.overview.title}</h2>
          )}
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <p className="whitespace-pre-wrap">{blocks.overview.content}</p>
          </div>
          {blocks.overview.terrain && (
            <div className="mt-4 rounded-lg border bg-muted/30 p-4">
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                {labels?.terrain || 'Terrain'}
              </h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {blocks.overview.terrain}
              </p>
            </div>
          )}
        </section>
      )}

      {/* Course Section */}
      {blocks.course?.enabled && (
        <section>
          {blocks.course.title && (
            <h2 className="text-2xl font-bold mb-4">{blocks.course.title}</h2>
          )}
          {blocks.course.description && (
            <div className="prose prose-sm dark:prose-invert max-w-none mb-6">
              <p className="whitespace-pre-wrap">{blocks.course.description}</p>
            </div>
          )}

          <div className="grid gap-4">
            {/* Elevation */}
            {blocks.course.elevationGain && (
              <div className="rounded-lg border bg-card p-4">
                <h3 className="font-semibold mb-2">Elevation Gain</h3>
                <p className="text-sm text-muted-foreground">{blocks.course.elevationGain}</p>
              </div>
            )}

            {/* Elevation Profile */}
            {blocks.course.elevationProfileUrl && (
              <div className="rounded-lg border bg-card p-4">
                <h3 className="font-semibold mb-3">Elevation Profile</h3>
                <a
                  href={blocks.course.elevationProfileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline"
                >
                  View Elevation Profile
                </a>
              </div>
            )}

            {/* Course Map */}
            {blocks.course.mapUrl && (
              <div className="rounded-lg border bg-card p-4">
                <h3 className="font-semibold mb-3">Course Map</h3>
                <a
                  href={blocks.course.mapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline"
                >
                  View Course Map
                </a>
              </div>
            )}

            {/* Aid Stations */}
            {blocks.course.aidStations && blocks.course.aidStations.length > 0 && (
              <div className="rounded-lg border bg-card p-4">
                <h3 className="font-semibold mb-4">Aid Stations</h3>
                <div className="space-y-3">
                  {blocks.course.aidStations.map((station, index) => (
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
      {blocks.schedule?.enabled && (
        <section>
          {blocks.schedule.title && (
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <Clock className="h-6 w-6" />
              {blocks.schedule.title}
            </h2>
          )}

          <div className="grid gap-4">
            {/* Packet Pickup */}
            {blocks.schedule.packetPickup && (
              <div className="rounded-lg border bg-card p-4">
                <h3 className="font-semibold mb-2">Packet Pickup</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {blocks.schedule.packetPickup}
                </p>
              </div>
            )}

            {/* Parking */}
            {blocks.schedule.parking && (
              <div className="rounded-lg border bg-card p-4">
                <h3 className="font-semibold mb-2">Parking</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {blocks.schedule.parking}
                </p>
              </div>
            )}

            {/* Race Day */}
            {blocks.schedule.raceDay && (
              <div className="rounded-lg border bg-card p-4">
                <h3 className="font-semibold mb-2">Race Day</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {blocks.schedule.raceDay}
                </p>
              </div>
            )}

            {/* Start Times */}
            {blocks.schedule.startTimes && blocks.schedule.startTimes.length > 0 && (
              <div className="rounded-lg border bg-card p-4">
                <h3 className="font-semibold mb-3">Start Times</h3>
                <div className="space-y-2">
                  {blocks.schedule.startTimes.map((startTime, index) => (
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
      {blocks.media?.enabled && (blocks.media.photos?.length || blocks.media.documents?.length) && (
        <section>
          {blocks.media.title && (
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <ImageIcon className="h-6 w-6" />
              {blocks.media.title}
            </h2>
          )}

          <div className="grid gap-6">
            {/* Documents */}
            {blocks.media.documents && blocks.media.documents.length > 0 && (
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  {labels?.documents || 'Documents'}
                </h3>
                <div className="grid gap-2">
                  {blocks.media.documents.map((doc, index) => {
                    const url = documentUrls?.get(doc.mediaId);
                    return url ? (
                      <a
                        key={doc.mediaId}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg border bg-card p-3 flex items-center gap-3 hover:bg-muted/50 transition-colors group"
                      >
                        <FileText className="h-5 w-5 text-primary flex-shrink-0" />
                        <span className="text-sm font-medium flex-1">{doc.label}</span>
                        <div className="flex items-center gap-2 text-muted-foreground group-hover:text-primary transition-colors">
                          <span className="text-xs hidden sm:inline">{labels?.download || 'Download'}</span>
                          <Download className="h-4 w-4" />
                        </div>
                      </a>
                    ) : (
                      <div
                        key={doc.mediaId || index}
                        className="rounded-lg border bg-card p-3 flex items-center gap-3"
                      >
                        <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                        <span className="text-sm font-medium">{doc.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Photos Note */}
            {blocks.media.photos && blocks.media.photos.length > 0 && (
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-sm text-muted-foreground">
                  Photo gallery with {blocks.media.photos.length} image
                  {blocks.media.photos.length !== 1 ? 's' : ''} available.
                </p>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
