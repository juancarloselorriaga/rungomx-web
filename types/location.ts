export type LocationValue = {
  lat: number;
  lng: number;
  formattedAddress: string;
  name?: string;
  address?: string;
  placeId?: string;
  countryCode?: string;
  country?: string;
  region?: string;
  city?: string;
  locality?: string;
  postalCode?: string;
  provider?: string;
  raw?: unknown;
};

export type PublicLocationValue = Omit<LocationValue, 'raw'>;
