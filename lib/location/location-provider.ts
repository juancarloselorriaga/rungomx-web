import type { LocationValue } from '@/types/location';
import { mapboxLocationProvider } from './mapbox-location-provider';

export type LocationSearchOptions = {
  limit?: number;
  language?: string;
  country?: string;
  proximity?: {
    lat: number;
    lng: number;
  };
};

export type ReverseGeocodeOptions = {
  language?: string;
  country?: string;
};

export interface LocationProvider {
  forwardGeocode(
    query: string,
    options?: LocationSearchOptions
  ): Promise<LocationValue[]>;

  reverseGeocode(
    lat: number,
    lng: number,
    options?: ReverseGeocodeOptions
  ): Promise<LocationValue | null>;
}

export function getLocationProvider(): LocationProvider {
  const providerName = (process.env.LOCATION_PROVIDER ?? 'mapbox').toLowerCase();

  switch (providerName) {
    case 'mapbox':
    default:
      return mapboxLocationProvider;
  }
}

