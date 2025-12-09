import {
  getAllowedCountries,
  isValidCountryCode,
  getCountryName,
  getCountriesWithNames,
} from '@/lib/profiles/countries';

describe('Country Utilities', () => {
  describe('getAllowedCountries', () => {
    it('returns an array of country codes', () => {
      const countries = getAllowedCountries();
      expect(Array.isArray(countries)).toBe(true);
      expect(countries.length).toBeGreaterThan(0);
    });

    it('returns at least 240 countries (libphonenumber-js typically has ~245)', () => {
      const countries = getAllowedCountries();
      expect(countries.length).toBeGreaterThan(240);
    });

    it('includes common country codes', () => {
      const countries = getAllowedCountries();
      expect(countries).toContain('MX');
      expect(countries).toContain('US');
      expect(countries).toContain('CA');
      expect(countries).toContain('ES');
      expect(countries).toContain('BR');
      expect(countries).toContain('JP');
      expect(countries).toContain('FR');
      expect(countries).toContain('DE');
      expect(countries).toContain('CN');
      expect(countries).toContain('IN');
    });

    it('all codes are uppercase 2-character strings', () => {
      const countries = getAllowedCountries();
      countries.forEach((code) => {
        expect(code).toMatch(/^[A-Z]{2}$/);
      });
    });
  });

  describe('isValidCountryCode', () => {
    it('validates valid country codes', () => {
      expect(isValidCountryCode('MX')).toBe(true);
      expect(isValidCountryCode('US')).toBe(true);
      expect(isValidCountryCode('CA')).toBe(true);
      expect(isValidCountryCode('JP')).toBe(true);
      expect(isValidCountryCode('FR')).toBe(true);
    });

    it('validates lowercase country codes (case-insensitive)', () => {
      expect(isValidCountryCode('mx')).toBe(true);
      expect(isValidCountryCode('us')).toBe(true);
      expect(isValidCountryCode('ca')).toBe(true);
    });

    it('rejects invalid country codes', () => {
      expect(isValidCountryCode('ZZ')).toBe(false);
      expect(isValidCountryCode('XX')).toBe(false);
      expect(isValidCountryCode('INVALID')).toBe(false);
      expect(isValidCountryCode('123')).toBe(false);
      expect(isValidCountryCode('')).toBe(false);
    });

    it('rejects non-string inputs gracefully', () => {
      // Type casting to test runtime behavior
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Testing purposes
      expect(isValidCountryCode(123 as any)).toBe(false);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Testing purposes
      expect(isValidCountryCode(null as any)).toBe(false);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Testing purposes
      expect(isValidCountryCode(undefined as any)).toBe(false);
    });
  });

  describe('getCountryName', () => {
    it('returns correct English country names', () => {
      expect(getCountryName('MX', 'en')).toBe('Mexico');
      expect(getCountryName('US', 'en')).toBe('United States');
      expect(getCountryName('CA', 'en')).toBe('Canada');
      expect(getCountryName('ES', 'en')).toBe('Spain');
      expect(getCountryName('BR', 'en')).toBe('Brazil');
      expect(getCountryName('JP', 'en')).toBe('Japan');
      expect(getCountryName('FR', 'en')).toBe('France');
      expect(getCountryName('DE', 'en')).toBe('Germany');
    });

    it('returns correct Spanish country names', () => {
      expect(getCountryName('MX', 'es')).toBe('México');
      expect(getCountryName('US', 'es')).toBe('Estados Unidos');
      expect(getCountryName('CA', 'es')).toBe('Canadá');
      expect(getCountryName('ES', 'es')).toBe('España');
      expect(getCountryName('BR', 'es')).toBe('Brasil');
      expect(getCountryName('JP', 'es')).toBe('Japón');
      expect(getCountryName('FR', 'es')).toBe('Francia');
      expect(getCountryName('DE', 'es')).toBe('Alemania');
    });

    it('returns country code as fallback for unknown/invalid codes', () => {
      // For truly invalid codes that don't exist in the locale files
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Testing purposes
      expect(isValidCountryCode(undefined as any)).toBe(false);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Testing purposes
      expect(getCountryName('INVALID' as any, 'en')).toBe('INVALID');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Testing purposes
      expect(getCountryName('INVALID' as any, 'es')).toBe('INVALID');
    });

    it('handles all supported countries without errors', () => {
      const countries = getAllowedCountries();
      countries.forEach((code) => {
        expect(() => getCountryName(code, 'en')).not.toThrow();
        expect(() => getCountryName(code, 'es')).not.toThrow();
        expect(getCountryName(code, 'en')).toBeTruthy();
        expect(getCountryName(code, 'es')).toBeTruthy();
      });
    });
  });

  describe('getCountriesWithNames', () => {
    it('returns array of country objects with code and name', () => {
      const countriesEn = getCountriesWithNames('en');
      const countriesEs = getCountriesWithNames('es');

      expect(Array.isArray(countriesEn)).toBe(true);
      expect(Array.isArray(countriesEs)).toBe(true);
      expect(countriesEn.length).toBeGreaterThan(240);
      expect(countriesEs.length).toBeGreaterThan(240);

      // Check structure
      countriesEn.forEach((country) => {
        expect(country).toHaveProperty('code');
        expect(country).toHaveProperty('name');
        expect(typeof country.code).toBe('string');
        expect(typeof country.name).toBe('string');
      });
    });

    it('returns correctly localized names', () => {
      const countriesEn = getCountriesWithNames('en');
      const countriesEs = getCountriesWithNames('es');

      const mxEn = countriesEn.find((c) => c.code === 'MX');
      const mxEs = countriesEs.find((c) => c.code === 'MX');

      expect(mxEn?.name).toBe('Mexico');
      expect(mxEs?.name).toBe('México');

      const usEn = countriesEn.find((c) => c.code === 'US');
      const usEs = countriesEs.find((c) => c.code === 'US');

      expect(usEn?.name).toBe('United States');
      expect(usEs?.name).toBe('Estados Unidos');
    });

    it('both locales have the same country codes', () => {
      const countriesEn = getCountriesWithNames('en');
      const countriesEs = getCountriesWithNames('es');

      expect(countriesEn.length).toBe(countriesEs.length);

      const codesEn = countriesEn.map((c) => c.code).sort();
      const codesEs = countriesEs.map((c) => c.code).sort();

      expect(codesEn).toEqual(codesEs);
    });
  });
});
