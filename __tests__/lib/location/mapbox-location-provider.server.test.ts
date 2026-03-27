import { mapboxLocationProvider } from '@/lib/location/mapbox-location-provider';

function jsonResponse(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

describe('mapboxLocationProvider', () => {
  const originalToken = process.env.MAPBOX_ACCESS_TOKEN;
  const mockFetch = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();

  beforeEach(() => {
    process.env.MAPBOX_ACCESS_TOKEN = 'test-token';
    mockFetch.mockReset();
    global.fetch = mockFetch as typeof fetch;
  });

  afterAll(() => {
    process.env.MAPBOX_ACCESS_TOKEN = originalToken;
  });

  it('keeps reverse-geocoded street addresses clean instead of duplicating hierarchy fragments', async () => {
    mockFetch.mockImplementation(() =>
      jsonResponse({
        features: [
          {
            id: 'bosque-reverse',
            geometry: {
              type: 'Point',
              coordinates: [-99.18333064, 19.41666781],
            },
            properties: {
              feature_type: 'address',
              name: 'Gran Avenida',
              address: 'Gran Avenida, 11580 Ciudad de México, México',
              full_address: 'Gran Avenida, 11580 Ciudad de México, México',
              context: {
                postcode: { name: '11580' },
                locality: { name: 'Miguel Hidalgo' },
                place: { name: 'Ciudad de México' },
                region: { name: 'Ciudad de México' },
                country: { name: 'México', country_code: 'MX' },
              },
            },
          },
        ],
      }),
    );

    const result = await mapboxLocationProvider.reverseGeocode(19.41666781, -99.18333064, {
      language: 'es',
      country: 'MX',
    });

    expect(result).toMatchObject({
      formattedAddress: 'Gran Avenida, 11580 Ciudad de México, México',
      address: 'Gran Avenida, 11580 Ciudad de México, México',
      city: 'Ciudad de México',
      locality: 'Miguel Hidalgo',
      region: 'Ciudad de México',
      country: 'México',
      countryCode: 'MX',
      postalCode: '11580',
    });
  });

  it('keeps POI display names human-readable while preserving a clean structured address', async () => {
    mockFetch.mockImplementation((input) => {
      const url = String(input);

      if (url.includes('/searchbox/v1/suggest')) {
        return jsonResponse({
          suggestions: [
            {
              name: 'Parque Metropolitano de Guadalajara',
              mapbox_id: 'mapbox-park-1',
              full_address: 'Calz. Circunvalacion Ote. 381, 45010 Zapopan, México',
              context: {
                postcode: { name: '45010' },
                place: { name: 'Zapopan' },
                region: { name: 'Jalisco' },
                country: { name: 'México', country_code: 'MX' },
              },
              coordinates: {
                latitude: 20.67046657,
                longitude: -103.43992534,
              },
            },
          ],
        });
      }

      if (url.includes('/searchbox/v1/retrieve/')) {
        return jsonResponse({
          features: [
            {
              id: 'mapbox-park-1',
              geometry: {
                type: 'Point',
                coordinates: [-103.43992534, 20.67046657],
              },
              properties: {
                feature_type: 'poi',
                name: 'Parque Metropolitano de Guadalajara',
                full_address: 'Calle Ludwig Van Beethoven 5800, 45010 Zapopan, Jalisco, México',
                context: {
                  postcode: { name: '45010' },
                  place: { name: 'Zapopan' },
                  region: { name: 'Jalisco' },
                  country: { name: 'México', country_code: 'MX' },
                },
              },
            },
          ],
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    const [result] = await mapboxLocationProvider.searchPlaces!(
      'Parque Metropolitano de Guadalajara',
      {
        language: 'es',
        country: 'MX',
        limit: 5,
      },
    );

    expect(result).toMatchObject({
      formattedAddress: 'Parque Metropolitano de Guadalajara, Zapopan, Jalisco, México',
      address: 'Calle Ludwig Van Beethoven 5800, 45010 Zapopan, Jalisco, México',
      city: 'Zapopan',
      region: 'Jalisco',
      country: 'México',
      countryCode: 'MX',
    });
  });
});
