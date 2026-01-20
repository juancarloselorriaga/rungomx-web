'use client';

import { useState, useCallback, useMemo } from 'react';
import Image from 'next/image';
import Lightbox from 'yet-another-react-lightbox';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';
import Thumbnails from 'yet-another-react-lightbox/plugins/thumbnails';
import Fullscreen from 'yet-another-react-lightbox/plugins/fullscreen';
import Counter from 'yet-another-react-lightbox/plugins/counter';
import Captions from 'yet-another-react-lightbox/plugins/captions';

// Import lightbox styles
import 'yet-another-react-lightbox/styles.css';
import 'yet-another-react-lightbox/plugins/thumbnails.css';
import 'yet-another-react-lightbox/plugins/captions.css';
import 'yet-another-react-lightbox/plugins/counter.css';

export interface GalleryPhoto {
  url: string;
  caption?: string;
  mediaId: string;
}

export interface PhotoGalleryProps {
  photos: GalleryPhoto[];
  columns?: 1 | 2 | 3 | 4;
}

export function PhotoGallery({ photos, columns = 3 }: PhotoGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState(-1);

  const handleOpen = useCallback((index: number) => {
    setLightboxIndex(index);
  }, []);

  const handleClose = useCallback(() => {
    setLightboxIndex(-1);
  }, []);

  // Filter out photos without URLs
  const validPhotos = useMemo(
    () => photos.filter((photo) => photo.url),
    [photos],
  );

  // Prepare slides for lightbox
  const slides = useMemo(
    () =>
      validPhotos.map((photo) => ({
        src: photo.url,
        title: photo.caption || undefined,
        description: photo.caption || undefined,
      })),
    [validPhotos],
  );

  const gridClassName = useMemo(() => {
    switch (columns) {
      case 1:
        return 'grid-cols-1';
      case 2:
        return 'grid-cols-1 sm:grid-cols-2';
      case 4:
        return 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4';
      case 3:
      default:
        return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
    }
  }, [columns]);

  if (validPhotos.length === 0) {
    return null;
  }

  return (
    <>
      <div className={`grid gap-4 ${gridClassName}`}>
        {validPhotos.map((photo, index) => (
          <figure key={photo.mediaId} className="space-y-2">
            <button
              type="button"
              onClick={() => handleOpen(index)}
              className="group block w-full rounded-lg border overflow-hidden bg-muted/30 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            >
              <div className="relative aspect-[4/3]">
                <Image
                  src={photo.url}
                  alt={photo.caption || ''}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="object-cover transition-transform group-hover:scale-[1.02]"
                />
                {/* Hover overlay */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                  <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5 text-gray-700"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"
                      />
                    </svg>
                  </div>
                </div>
              </div>
            </button>
            {photo.caption && (
              <figcaption className="text-sm text-muted-foreground px-1">
                {photo.caption}
              </figcaption>
            )}
          </figure>
        ))}
      </div>

      <Lightbox
        open={lightboxIndex >= 0}
        close={handleClose}
        index={lightboxIndex}
        slides={slides}
        plugins={[Zoom, Thumbnails, Fullscreen, Counter, Captions]}
        zoom={{
          maxZoomPixelRatio: 3,
          zoomInMultiplier: 2,
          doubleTapDelay: 300,
          doubleClickDelay: 300,
          doubleClickMaxStops: 2,
          keyboardMoveDistance: 50,
          wheelZoomDistanceFactor: 100,
          pinchZoomDistanceFactor: 100,
          scrollToZoom: true,
        }}
        thumbnails={{
          position: 'bottom',
          width: 80,
          height: 60,
          padding: 4,
          gap: 8,
          borderRadius: 4,
        }}
        captions={{
          showToggle: true,
          descriptionTextAlign: 'center',
        }}
        carousel={{
          finite: false,
          preload: 2,
        }}
        animation={{
          fade: 250,
          swipe: 500,
        }}
        controller={{
          closeOnBackdropClick: true,
          closeOnPullDown: true,
          closeOnPullUp: true,
        }}
        styles={{
          container: { backgroundColor: 'rgba(0, 0, 0, 0.9)' },
        }}
      />
    </>
  );
}
