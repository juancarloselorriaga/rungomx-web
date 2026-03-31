const mockFindFirstEdition = jest.fn();
const mockFindPricingTiers = jest.fn();
const mockWhere = jest.fn();

jest.mock('@/db', () => ({
  db: {
    query: {
      eventEditions: {
        findFirst: (...args: unknown[]) => mockFindFirstEdition(...args),
      },
      pricingTiers: {
        findMany: (...args: unknown[]) => mockFindPricingTiers(...args),
      },
    },
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: (...args: unknown[]) => mockWhere(...args),
      })),
    })),
  },
}));

import {
  preflightPatch,
  validateReferencedDistanceIds,
} from '@/lib/events/ai-wizard/server/apply/preflight';

const editionId = '11111111-1111-4111-8111-111111111111';

describe('ai wizard apply preflight', () => {
  beforeEach(() => {
    mockFindFirstEdition.mockReset();
    mockFindPricingTiers.mockReset();
    mockWhere.mockReset();

    mockFindFirstEdition.mockResolvedValue(null);
    mockFindPricingTiers.mockResolvedValue([]);
    mockWhere.mockResolvedValue([]);
  });

  it('rejects referenced distance ids that do not belong to the edition', async () => {
    mockWhere.mockResolvedValue([{ id: 'distance-1' }]);

    const result = await validateReferencedDistanceIds({
      editionId,
      patch: {
        title: 'Precios por distancia',
        summary: 'Usa una distancia válida',
        ops: [
          {
            type: 'update_distance_price',
            distanceId: 'distance-1',
            data: { price: 300 },
          },
          {
            type: 'create_pricing_tier',
            distanceId: 'distance-missing',
            data: { label: 'Early bird', price: 250 },
          },
        ],
      },
    } as never);

    expect(result).toEqual({
      code: 'INVALID_DISTANCE',
      details: { distanceId: 'distance-missing' },
    });
  });

  it('rejects slug collisions during update-edition preflight', async () => {
    mockFindFirstEdition.mockResolvedValue({ id: 'existing-edition' });

    const result = await preflightPatch({
      editionId,
      event: {
        id: editionId,
        slug: 'trail-2026',
        timezone: 'America/Mexico_City',
        seriesId: 'series-1',
        policyConfig: null,
      },
      patch: {
        title: 'Actualizar slug',
        summary: 'Evita choques',
        ops: [
          {
            type: 'update_edition',
            editionId,
            data: { slug: 'slug-ocupado' },
          },
        ],
      },
    } as never);

    expect(result).toEqual({
      code: 'INVALID_PATCH',
      details: { opIndex: 0, reason: 'SLUG_TAKEN' },
    });
  });

  it('still rejects malformed non-ambiguous distance start times', async () => {
    const result = await preflightPatch({
      editionId,
      event: {
        id: editionId,
        slug: 'trail-2026',
        timezone: 'America/Mexico_City',
        seriesId: 'series-1',
        policyConfig: null,
      },
      patch: {
        title: 'Crear distancia',
        summary: 'No acepta fechas inválidas',
        ops: [
          {
            type: 'create_distance',
            editionId,
            data: {
              label: '10K',
              distanceValue: 10,
              distanceUnit: 'km',
              startTimeLocal: 'not-a-date',
              price: 350,
            },
          },
        ],
      },
    } as never);

    expect(result).toEqual({
      code: 'INVALID_PATCH',
      details: { opIndex: 0, reason: 'INVALID_DATETIME' },
    });
  });
});
