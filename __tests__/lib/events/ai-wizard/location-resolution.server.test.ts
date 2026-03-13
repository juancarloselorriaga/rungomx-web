const mockForwardGeocode = jest.fn();

jest.mock('@/lib/location/location-provider', () => ({
  getLocationProvider: () => ({
    forwardGeocode: (...args: unknown[]) => mockForwardGeocode(...args),
  }),
}));

import {
  extractLocationIntentQuery,
  resolveAiWizardLocationIntent,
} from '@/lib/events/ai-wizard/location-resolution';

describe('ai wizard location resolution', () => {
  beforeEach(() => {
    mockForwardGeocode.mockReset();
  });

  it('extracts a location query from explicit basics phrasing', () => {
    expect(
      extractLocationIntentQuery(
        'La ubicación exacta es Bosque de Chapultepec, Ciudad de México. Actualiza la ubicación real del evento.',
      ),
    ).toBe('Bosque de Chapultepec, Ciudad de México');
  });

  it('returns matched for a strong specific result', async () => {
    mockForwardGeocode.mockResolvedValue([
      {
        lat: 19.4204,
        lng: -99.1819,
        formattedAddress: 'Bosque de Chapultepec, Ciudad de México, México',
        city: 'Ciudad de México',
        region: 'Ciudad de México',
        countryCode: 'MX',
        placeId: 'chapultepec',
        provider: 'mapbox',
      },
    ]);

    await expect(
      resolveAiWizardLocationIntent('Bosque de Chapultepec, Ciudad de México', {
        locale: 'es',
        country: 'MX',
      }),
    ).resolves.toMatchObject({
      status: 'matched',
      query: 'Bosque de Chapultepec, Ciudad de México',
      candidate: {
        formattedAddress: 'Bosque de Chapultepec, Ciudad de México, México',
        lat: 19.4204,
        lng: -99.1819,
      },
    });
  });

  it('returns ambiguous when several plausible results exist', async () => {
    mockForwardGeocode.mockResolvedValue([
      {
        lat: 20.6736,
        lng: -103.344,
        formattedAddress: 'Parque Metropolitano, Guadalajara, Jalisco, México',
        city: 'Guadalajara',
        region: 'Jalisco',
        countryCode: 'MX',
        placeId: 'metro-gdl',
        provider: 'mapbox',
      },
      {
        lat: 19.4326,
        lng: -99.1332,
        formattedAddress: 'Parque Metropolitano, Ciudad de México, México',
        city: 'Ciudad de México',
        region: 'Ciudad de México',
        countryCode: 'MX',
        placeId: 'metro-cdmx',
        provider: 'mapbox',
      },
    ]);

    await expect(
      resolveAiWizardLocationIntent('Parque Metropolitano', {
        locale: 'es',
        country: 'MX',
      }),
    ).resolves.toMatchObject({
      status: 'ambiguous',
      query: 'Parque Metropolitano',
      candidates: expect.arrayContaining([
        expect.objectContaining({
          formattedAddress: 'Parque Metropolitano, Guadalajara, Jalisco, México',
        }),
      ]),
    });
  });

  it('prefers the best grounded candidate when the query includes a specific city context', async () => {
    mockForwardGeocode.mockResolvedValue([
      {
        lat: 19.6125,
        lng: -99.0469,
        formattedAddress: 'Calle Bosque de Chapultepec, 55764 Ojo de Agua, Estado de México, México',
        city: 'Ojo de Agua',
        region: 'Estado de México',
        countryCode: 'MX',
        placeId: 'wrong-chapultepec',
        provider: 'mapbox',
      },
      {
        lat: 19.4204,
        lng: -99.1819,
        formattedAddress: 'Bosque de Chapultepec, Ciudad de México, México',
        city: 'Ciudad de México',
        region: 'Ciudad de México',
        countryCode: 'MX',
        placeId: 'chapultepec-cdmx',
        provider: 'mapbox',
      },
    ]);

    await expect(
      resolveAiWizardLocationIntent('Bosque de Chapultepec, Ciudad de México', {
        locale: 'es',
        country: 'MX',
      }),
    ).resolves.toMatchObject({
      status: 'matched',
      candidate: {
        formattedAddress: 'Bosque de Chapultepec, Ciudad de México, México',
        lat: 19.4204,
        lng: -99.1819,
      },
    });
  });

  it('returns no_match when the provider finds nothing usable', async () => {
    mockForwardGeocode.mockResolvedValue([]);

    await expect(
      resolveAiWizardLocationIntent('Lugar inventado sin coincidencia', {
        locale: 'es',
        country: 'MX',
      }),
    ).resolves.toEqual({
      status: 'no_match',
      query: 'Lugar inventado sin coincidencia',
    });
  });
});
