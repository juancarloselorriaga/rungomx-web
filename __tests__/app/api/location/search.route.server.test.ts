import { NextRequest } from 'next/server';

const mockForwardGeocode = jest.fn();
const mockSearchPlaces = jest.fn();
const mockReverseGeocode = jest.fn();

jest.mock('@/lib/location/location-provider', () => ({
  getLocationProvider: () => ({
    forwardGeocode: (...args: unknown[]) => mockForwardGeocode(...args),
    searchPlaces: (...args: unknown[]) => mockSearchPlaces(...args),
    reverseGeocode: (...args: unknown[]) => mockReverseGeocode(...args),
  }),
}));

jest.mock('next/navigation', () => ({
  unstable_rethrow: jest.fn(),
}));

async function loadRoute() {
  jest.resetModules();
  return import('@/app/api/location/search/route');
}

describe('GET /api/location/search', () => {
  beforeEach(() => {
    mockForwardGeocode.mockReset();
    mockSearchPlaces.mockReset();
    mockReverseGeocode.mockReset();
  });

  it('routes landmark-style plain Basics queries through the POI-capable search path', async () => {
    mockSearchPlaces.mockResolvedValue([
      {
        lat: 19.4204,
        lng: -99.1816,
        formattedAddress: 'Bosque de Chapultepec, Ciudad de México, México',
        address: '11580 Ciudad de México, México',
        city: 'Ciudad de México',
        locality: 'Miguel Hidalgo',
        region: 'Ciudad de México',
        country: 'México',
        countryCode: 'MX',
        raw: { provider: 'mapbox' },
      },
    ]);

    const { GET } = await loadRoute();
    const response = await GET(
      new NextRequest(
        'http://localhost/api/location/search?q=Bosque%20de%20Chapultepec%20Ciudad%20de%20M%C3%A9xico&country=MX&language=es',
      ),
    );
    const body = (await response.json()) as { locations: Array<Record<string, unknown>> };

    expect(response.status).toBe(200);
    expect(mockSearchPlaces).toHaveBeenCalledWith('Bosque de Chapultepec Ciudad de México', {
      limit: 5,
      language: 'es',
      country: 'MX',
      proximity: undefined,
    });
    expect(mockForwardGeocode).not.toHaveBeenCalled();
    expect(body).toEqual({
      locations: [
        {
          lat: 19.4204,
          lng: -99.1816,
          formattedAddress: 'Bosque de Chapultepec, Ciudad de México, México',
          address: '11580 Ciudad de México, México',
          city: 'Ciudad de México',
          locality: 'Miguel Hidalgo',
          region: 'Ciudad de México',
          country: 'México',
          countryCode: 'MX',
        },
      ],
    });
  });

  it('keeps the public location payload shape stable for picker/save consumers', async () => {
    mockSearchPlaces.mockResolvedValue([
      {
        lat: 20.67046657,
        lng: -103.43992534,
        formattedAddress: 'Parque Metropolitano de Guadalajara, Zapopan, Jalisco, México',
        name: 'Parque Metropolitano de Guadalajara',
        address: 'Calle Ludwig Van Beethoven 5800, 45010 Zapopan, Jalisco, México',
        placeId: 'mapbox-park-1',
        city: 'Zapopan',
        locality: 'Zapopan',
        region: 'Jalisco',
        country: 'México',
        countryCode: 'MX',
        provider: 'mapbox',
        raw: { hidden: true },
      },
    ]);

    const { GET } = await loadRoute();
    const response = await GET(
      new NextRequest(
        'http://localhost/api/location/search?q=Parque%20Metropolitano%20de%20Guadalajara&country=MX&language=es',
      ),
    );
    const body = (await response.json()) as { locations: Array<Record<string, unknown>> };
    const [location] = body.locations;

    expect(response.status).toBe(200);
    expect(location).toMatchObject({
      lat: 20.67046657,
      lng: -103.43992534,
      formattedAddress: 'Parque Metropolitano de Guadalajara, Zapopan, Jalisco, México',
      name: 'Parque Metropolitano de Guadalajara',
      address: 'Calle Ludwig Van Beethoven 5800, 45010 Zapopan, Jalisco, México',
      placeId: 'mapbox-park-1',
      city: 'Zapopan',
      locality: 'Zapopan',
      region: 'Jalisco',
      country: 'México',
      countryCode: 'MX',
      provider: 'mapbox',
    });
    expect(location).not.toHaveProperty('raw');
  });
});
