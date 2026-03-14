const mockForwardGeocode = jest.fn();
const mockSearchPlaces = jest.fn();

jest.mock('@/lib/location/location-provider', () => ({
  getLocationProvider: () => ({
    forwardGeocode: (...args: unknown[]) => mockForwardGeocode(...args),
    searchPlaces: (...args: unknown[]) => mockSearchPlaces(...args),
  }),
}));

import {
  extractLocationIntentQuery,
  resolveAiWizardLocationIntent,
} from '@/lib/events/ai-wizard/location-resolution';

describe('ai wizard location resolution', () => {
  beforeEach(() => {
    mockForwardGeocode.mockReset();
    mockSearchPlaces.mockReset();
  });

  it('extracts a location query from explicit basics phrasing', () => {
    expect(
      extractLocationIntentQuery(
        'La ubicación exacta es Bosque de Chapultepec, Ciudad de México. Actualiza la ubicación real del evento.',
      ),
    ).toBe('Bosque de Chapultepec, Ciudad de México');
  });

  it('extracts a clarified location from organizer phrasing that uses "como ubicación real"', () => {
    expect(
      extractLocationIntentQuery(
        'Usa Bosque de Chapultepec — Área de Campamento, Ciudad de México, México como ubicación real del evento.',
      ),
    ).toBe('Bosque de Chapultepec — Área de Campamento, Ciudad de México, México');
  });

  it('extracts the location cleanly when the organizer keeps writing after the real-location phrase', () => {
    expect(
      extractLocationIntentQuery(
        'Usa Bosque de Chapultepec — Área de Campamento, Ciudad de México, México como ubicación real del evento y crea una distancia de 10 km con precio inicial de 350 MXN.',
      ),
    ).toBe('Bosque de Chapultepec — Área de Campamento, Ciudad de México, México');
  });

  it('extracts only the location clause when the organizer combines start-date and location instructions', () => {
    expect(
      extractLocationIntentQuery(
        'Usa 29 de marzo de 2026 como fecha de inicio y Bosque de Chapultepec, Ciudad de México, México como ubicación real del evento.',
      ),
    ).toBe('Bosque de Chapultepec, Ciudad de México, México');
  });

  it('returns matched for a strong specific result', async () => {
    mockSearchPlaces.mockResolvedValue([]);
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
    mockSearchPlaces.mockResolvedValue([]);
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
    mockSearchPlaces.mockResolvedValue([]);
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

  it('falls back to a simplified venue query when the original text includes a sub-area qualifier', async () => {
    mockSearchPlaces.mockImplementation(async (query: string) => {
      if (query === 'Bosque de Chapultepec — Área de Campamento, Ciudad de México, México') {
        return [];
      }

      if (query === 'Bosque de Chapultepec, Ciudad de México, México') {
        return [
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
        ];
      }

      return [];
    });

    mockForwardGeocode.mockResolvedValue([]);

    await expect(
      resolveAiWizardLocationIntent(
        'Bosque de Chapultepec — Área de Campamento, Ciudad de México, México',
        {
          locale: 'es',
          country: 'MX',
        },
      ),
    ).resolves.toMatchObject({
      status: 'matched',
      query: 'Bosque de Chapultepec, Ciudad de México, México',
      candidate: {
        formattedAddress: 'Bosque de Chapultepec, Ciudad de México, México',
        lat: 19.4204,
        lng: -99.1819,
      },
    });
  });

  it('does not drop city context and wrongly match a different city when only the bare place name would resolve', async () => {
    mockSearchPlaces.mockImplementation(async (query: string) => {
      if (query === 'Bosque de Chapultepec — Área de Campamento, Ciudad de México, México') {
        return [];
      }

      if (query === 'Bosque de Chapultepec, Ciudad de México, México') {
        return [];
      }

      if (query === 'Bosque de Chapultepec') {
        return [
          {
            lat: 19.0414,
            lng: -98.2063,
            formattedAddress: 'Bosque de Chapultepec, 72710 San Jacinto, Puebla, México',
            city: 'San Jacinto',
            region: 'Puebla',
            countryCode: 'MX',
            placeId: 'wrong-puebla',
            provider: 'mapbox',
          },
        ];
      }

      return [];
    });

    mockForwardGeocode.mockResolvedValue([]);

    await expect(
      resolveAiWizardLocationIntent(
        'Bosque de Chapultepec — Área de Campamento, Ciudad de México, México',
        {
          locale: 'es',
          country: 'MX',
        },
      ),
    ).resolves.toEqual({
      status: 'no_match',
      query: 'Bosque de Chapultepec — Área de Campamento, Ciudad de México, México',
    });
  });

  it('returns no_match when the provider finds nothing usable', async () => {
    mockSearchPlaces.mockResolvedValue([]);
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

  it('prefers the Search Box path for venue-style queries when it returns a grounded result', async () => {
    mockSearchPlaces.mockResolvedValue([
      {
        lat: 24.1426,
        lng: -110.3128,
        formattedAddress:
          'Área de Campamento, Bosque de la Ciudad, La Paz, Baja California Sur, México',
        city: 'La Paz',
        region: 'Baja California Sur',
        countryCode: 'MX',
        placeId: 'searchbox-camp',
        provider: 'mapbox',
      },
    ]);
    mockForwardGeocode.mockResolvedValue([
      {
        lat: 19.4326,
        lng: -99.1332,
        formattedAddress: 'Ciudad de México, México',
        city: 'Ciudad de México',
        region: 'Ciudad de México',
        countryCode: 'MX',
        placeId: 'geocode-cdmx',
        provider: 'mapbox',
      },
    ]);

    await expect(
      resolveAiWizardLocationIntent('Área de Campamento Bosque de la Ciudad, La Paz, BCS, México', {
        locale: 'es',
        country: 'MX',
      }),
    ).resolves.toMatchObject({
      status: 'matched',
      candidate: {
        formattedAddress:
          'Área de Campamento, Bosque de la Ciudad, La Paz, Baja California Sur, México',
        lat: 24.1426,
        lng: -110.3128,
      },
    });
  });
});
