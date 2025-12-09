'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { reverseGeocodeClient, searchLocationsClient } from '@/lib/location/client';
import { cn } from '@/lib/utils';
import type { PublicLocationValue } from '@/types/location';
import { useEffect, useRef, useState } from 'react';
import Map, { Marker } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useAppTheme } from '@/components/providers/app-theme';
import { MapPin, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';

type LocationPickerDialogProps = {
  initialLocation: PublicLocationValue | null;
  onLocationSelectAction: (location: PublicLocationValue) => void;
  onCloseAction: () => void;
  country?: string;
  language?: string;
};

type ViewState = {
  longitude: number;
  latitude: number;
  zoom: number;
};

const DEFAULT_VIEW_STATE: ViewState = {
  longitude: -99.1332,
  latitude: 19.4326,
  zoom: 5,
};

export function LocationPickerDialog({
  initialLocation,
  onLocationSelectAction,
  onCloseAction,
  country,
  language,
}: LocationPickerDialogProps) {
  const { theme } = useAppTheme();
  const t = useTranslations('components.location');

  const [markerCoords, setMarkerCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(() => {
    if (initialLocation) {
      return { lat: initialLocation.lat, lng: initialLocation.lng };
    }
    return null;
  });

  const [searchQuery, setSearchQuery] = useState(
    initialLocation?.formattedAddress ?? ''
  );
  const [searchResults, setSearchResults] = useState<PublicLocationValue[]>([]);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<PublicLocationValue | null>(
    initialLocation ?? null
  );
  const [isReverseLoading, setIsReverseLoading] = useState(false);
  const searchTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current !== null) {
        window.clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  const effectiveCenter = (() => {
    if (markerCoords) {
      return {
        longitude: markerCoords.lng,
        latitude: markerCoords.lat,
        zoom: 13,
      };
    }
    if (selectedLocation) {
      return {
        longitude: selectedLocation.lng,
        latitude: selectedLocation.lat,
        zoom: 13,
      };
    }
    return DEFAULT_VIEW_STATE;
  })();

  const proximity = markerCoords ?? selectedLocation ?? {
    lat: DEFAULT_VIEW_STATE.latitude,
    lng: DEFAULT_VIEW_STATE.longitude,
  };

  const handleConfirm = () => {
    if (selectedLocation) {
      onLocationSelectAction(selectedLocation);
      onCloseAction();
    }
  };

  const handleSearchSelect = (location: PublicLocationValue) => {
    setSearchQuery(location.formattedAddress);
    setMarkerCoords({ lat: location.lat, lng: location.lng });
    setSelectedLocation(location);
  };

  const handleMapClick = (event: { lngLat: { lng: number; lat: number } }) => {
    const next = {
      lat: event.lngLat.lat,
      lng: event.lngLat.lng,
    };
    setMarkerCoords(next);

    setIsReverseLoading(true);
    reverseGeocodeClient({
      lat: next.lat,
      lng: next.lng,
      country,
      language,
    })
      .then((location) => {
        if (location) {
          setSelectedLocation(location);
          setSearchQuery((current) => current || location.formattedAddress);
        } else {
          const fallback: PublicLocationValue = {
            lat: next.lat,
            lng: next.lng,
            formattedAddress: `${next.lat.toFixed(5)}, ${next.lng.toFixed(5)}`,
          };
          setSelectedLocation(fallback);
          setSearchQuery((current) => current || fallback.formattedAddress);
        }
      })
      .catch((error) => {
        console.error('[LocationPickerDialog] Reverse geocoding failed', error);
        const fallback: PublicLocationValue = {
          lat: next.lat,
          lng: next.lng,
          formattedAddress: `${next.lat.toFixed(5)}, ${next.lng.toFixed(5)}`,
        };
        setSelectedLocation(fallback);
      })
      .finally(() => {
        setIsReverseLoading(false);
      });
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);

    if (searchTimeoutRef.current !== null) {
      window.clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }

    const trimmed = value.trim();
    if (trimmed.length < 3) {
      setSearchResults([]);
      setIsSearchLoading(false);
      return;
    }

    setIsSearchLoading(true);

    searchTimeoutRef.current = window.setTimeout(() => {
      searchLocationsClient({
        query: trimmed,
        limit: 5,
        country,
        language,
        proximity,
      })
        .then((results) => {
          setSearchResults(results);
        })
        .catch((error) => {
          console.error('[LocationPickerDialog] Location search failed', error);
          setSearchResults([]);
        })
        .finally(() => {
          setIsSearchLoading(false);
        });
    }, 300);
  };

  const isBusy = isSearchLoading || isReverseLoading;

  const mapStyleUrl =
    theme === 'dark'
      ? process.env.NEXT_PUBLIC_MAP_STYLE_DARK ??
        process.env.NEXT_PUBLIC_MAP_STYLE_LIGHT ??
        'https://demotiles.maplibre.org/style.json'
      : process.env.NEXT_PUBLIC_MAP_STYLE_LIGHT ??
        'https://demotiles.maplibre.org/style.json';

  return (
    <Dialog open onOpenChange={(nextOpen) => {
      if (!nextOpen) {
        onCloseAction();
      }
    }}>
      <DialogContent className="sm:max-w-3xl border-none bg-gradient-to-b from-background/95 via-background to-background/98 shadow-2xl shadow-black/20 ring-1 ring-border/60 backdrop-blur-xl">
        <DialogHeader className="space-y-1">
          <DialogTitle className="flex items-center gap-2 text-xl font-semibold">
            <span className="inline-flex size-7 items-center justify-center rounded-full bg-primary/10 text-primary">
              <MapPin className="size-4" />
            </span>
            <span>{t('picker.title')}</span>
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {t('picker.description')}
          </p>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative space-y-2">
            <input
              className={cn(
                'w-full rounded-full border bg-background/80 px-3 py-2 pl-9 text-sm shadow-sm outline-none ring-0 transition',
                'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30',
                'backdrop-blur-sm'
              )}
              placeholder={t('picker.searchPlaceholder')}
              value={searchQuery}
              onChange={(event) => handleSearchChange(event.target.value)}
            />
            <Search className="pointer-events-none absolute left-4 top-3 h-4 w-4 text-muted-foreground" />
            {searchResults.length > 0 ? (
              <div className="max-h-44 overflow-y-auto rounded-xl border bg-card/90 text-sm shadow-sm backdrop-blur-sm">
                {searchResults.map((location) => (
                  <button
                    key={location.placeId ?? `${location.lat}-${location.lng}-${location.formattedAddress}`}
                    type="button"
                    className={cn(
                      'flex w-full flex-col items-start px-3 py-2 text-left transition-colors hover:bg-accent/60',
                      selectedLocation &&
                        selectedLocation.lat === location.lat &&
                        selectedLocation.lng === location.lng &&
                        'bg-accent'
                    )}
                    onClick={() => handleSearchSelect(location)}
                  >
                    <span className="font-medium">
                      {location.formattedAddress}
                    </span>
                    {location.city || location.region ? (
                      <span className="text-xs text-muted-foreground">
                        {[location.city, location.region, location.countryCode]
                          .filter(Boolean)
                          .join(', ')}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="relative h-80 w-full overflow-hidden rounded-2xl border border-border/70 bg-muted/40 shadow-inner">
            <Map
              initialViewState={effectiveCenter}
              onClick={handleMapClick}
              style={{ width: '100%', height: '100%' }}
              mapStyle={mapStyleUrl}
            >
              {markerCoords ? (
                <Marker
                  longitude={markerCoords.lng}
                  latitude={markerCoords.lat}
                  anchor="bottom"
                >
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
                    <span className="text-xs">●</span>
                  </div>
                </Marker>
              ) : null}
            </Map>
          </div>

          <div className="space-y-1 text-xs text-muted-foreground">
            {selectedLocation ? (
              <>
                <div className="font-medium text-foreground">
                  {selectedLocation.formattedAddress}
                </div>
                <div>
                  {selectedLocation.lat.toFixed(5)}, {selectedLocation.lng.toFixed(5)}
                </div>
              </>
            ) : (
              <div>{t('picker.emptySelectionHelper')}</div>
            )}
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button
            type="button"
            variant="outline"
            onClick={onCloseAction}
            disabled={isBusy}
          >
            {t('picker.actions.cancel')}
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={!selectedLocation || isBusy}
          >
            {t('picker.actions.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
