export type LocationValue = {
  lat: number;
  lng: number;
  formattedAddress: string;
  placeId?: string;
  countryCode?: string;
  region?: string;
  city?: string;
  postalCode?: string;
  provider?: string;
  raw?: unknown;
};

export type PublicLocationValue = Omit<LocationValue, 'raw'>;

