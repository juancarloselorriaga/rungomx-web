import { getCountries, isSupportedCountry, type CountryCode } from 'libphonenumber-js';
import enCountries from 'react-phone-number-input/locale/en.json';
import esCountries from 'react-phone-number-input/locale/es.json';

// Re-export CountryCode type for consistency
export type { CountryCode };

/**
 * Get all supported countries (245 countries from libphonenumber-js)
 * @returns Array of ISO 3166-1 alpha-2 country codes
 */
export function getAllowedCountries(): readonly CountryCode[] {
  return getCountries();
}

/**
 * Check if a string is a valid country code
 * @param code - Country code to validate (case-insensitive)
 * @returns true if valid country code
 */
export function isValidCountryCode(code: unknown): code is CountryCode {
  if (typeof code !== 'string') {
    return false;
  }

  const normalized = code.trim().toUpperCase();
  if (!normalized) {
    return false;
  }

  return isSupportedCountry(normalized);
}

/**
 * Get localized country name from react-phone-number-input locale files
 * @param code - ISO 3166-1 alpha-2 country code
 * @param locale - Locale ('en' or 'es')
 * @returns Localized country name, or code if translation not found
 */
export function getCountryName(code: CountryCode, locale: 'en' | 'es'): string {
  const names = locale === 'es' ? esCountries : enCountries;
  return names[code] ?? code;
}

/**
 * Get all countries with their names for a locale (useful for debugging/display)
 * @param locale - Locale ('en' or 'es')
 * @returns Array of objects with code and name
 */
export function getCountriesWithNames(
  locale: 'en' | 'es'
): Array<{ code: CountryCode; name: string }> {
  const countries = getAllowedCountries();
  return countries.map((code) => ({
    code,
    name: getCountryName(code, locale),
  }));
}
