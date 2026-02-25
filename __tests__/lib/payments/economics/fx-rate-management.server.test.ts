import { projectFxRateActionFlags } from '@/lib/payments/economics/fx-rate-management';

describe('daily FX rate action flags', () => {
  it('flags missing and stale currencies deterministically', () => {
    const result = projectFxRateActionFlags({
      requiredEventDatesByCurrency: {
        USD: ['2026-02-01', '2026-02-02'],
        EUR: ['2026-02-02'],
        BRL: ['2026-02-03'],
      },
      ratesByCurrency: {
        USD: [
          { effectiveDate: new Date('2026-01-31T00:00:00.000Z') },
          { effectiveDate: new Date('2026-02-02T00:00:00.000Z') },
        ],
        EUR: [{ effectiveDate: new Date('2026-01-20T00:00:00.000Z') }],
      },
      now: new Date('2026-02-10T12:00:00.000Z'),
      staleAfterDays: 3,
    });

    expect(result).toEqual({
      checkedCurrencies: ['BRL', 'EUR', 'USD'],
      missingRates: [
        {
          sourceCurrency: 'BRL',
          missingEventDates: ['2026-02-03'],
        },
      ],
      staleRates: [
        {
          sourceCurrency: 'EUR',
          latestEffectiveDate: '2026-01-20',
          daysStale: 21,
        },
        {
          sourceCurrency: 'USD',
          latestEffectiveDate: '2026-02-02',
          daysStale: 8,
        },
      ],
      hasActions: true,
    });
  });

  it('does not flag actions when all currencies have fresh applicable rates', () => {
    const first = projectFxRateActionFlags({
      requiredEventDatesByCurrency: {
        USD: ['2026-02-01', '2026-02-03'],
        CAD: ['2026-02-02'],
      },
      ratesByCurrency: {
        USD: [{ effectiveDate: new Date('2026-02-01T00:00:00.000Z') }],
        CAD: [{ effectiveDate: new Date('2026-02-01T00:00:00.000Z') }],
      },
      now: new Date('2026-02-03T10:00:00.000Z'),
      staleAfterDays: 5,
    });

    const second = projectFxRateActionFlags({
      requiredEventDatesByCurrency: {
        CAD: ['2026-02-02'],
        USD: ['2026-02-03', '2026-02-01'],
      },
      ratesByCurrency: {
        CAD: [{ effectiveDate: new Date('2026-02-01T00:00:00.000Z') }],
        USD: [{ effectiveDate: new Date('2026-02-01T00:00:00.000Z') }],
      },
      now: new Date('2026-02-03T10:00:00.000Z'),
      staleAfterDays: 5,
    });

    expect(first).toEqual({
      checkedCurrencies: ['CAD', 'USD'],
      missingRates: [],
      staleRates: [],
      hasActions: false,
    });
    expect(second).toEqual(first);
  });
});
