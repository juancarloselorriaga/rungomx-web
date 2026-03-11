import { formatMoneyFromMinor, resolveMoneyLocale } from '@/lib/utils/format-money';

describe('format-money', () => {
  it('maps app locales to money locales', () => {
    expect(resolveMoneyLocale('es')).toBe('es-MX');
    expect(resolveMoneyLocale('en')).toBe('en-US');
    expect(resolveMoneyLocale('es-MX')).toBe('es-MX');
  });

  it('formats MXN in Mexican locale style', () => {
    expect(formatMoneyFromMinor(429_450, 'MXN', 'es')).toBe('$4,294.50');
  });

  it('respects zero-decimal display options', () => {
    expect(
      formatMoneyFromMinor(25_000, 'MXN', 'es', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }),
    ).toBe('$250');
  });
});
