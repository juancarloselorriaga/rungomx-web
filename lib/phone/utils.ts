import {
  parsePhoneNumberWithError,
  isValidPhoneNumber,
  type CountryCode,
  type NumberFormat,
} from 'libphonenumber-js';

/**
 * Parses a phone number to E.164 format
 * @param phone - Raw phone input (can include formatting)
 * @param defaultCountry - Fallback country code (e.g., "MX")
 * @returns E.164 format (+523317778888) or null if invalid
 *
 * @example
 * toE164("(331) 777-8888", "MX") // "+523317778888"
 * toE164("+1 555 123 4567") // "+15551234567"
 * toE164("invalid") // null
 */
export function toE164(phone: string, defaultCountry?: CountryCode): string | null {
  if (!phone) return null;

  const trimmed = phone.trim();
  if (!trimmed) return null;

  try {
    const parsed = parsePhoneNumberWithError(trimmed, defaultCountry);
    if (!parsed) return null;

    return parsed.format('E.164');
  } catch {
    return null;
  }
}

/**
 * Formats E.164 number for display
 * @param e164 - E.164 format phone number
 * @param format - Display format ("NATIONAL" | "INTERNATIONAL" | "E.164")
 * @returns Formatted phone number or original input if parsing fails
 *
 * @example
 * formatPhone("+523317778888", "NATIONAL") // "331 777 8888"
 * formatPhone("+523317778888", "INTERNATIONAL") // "+52 331 777 8888"
 * formatPhone("+523317778888") // "+52 331 777 8888" (defaults to INTERNATIONAL)
 */
export function formatPhone(e164: string, format: NumberFormat = 'INTERNATIONAL'): string {
  if (!e164 || typeof e164 !== 'string') return '';

  const trimmed = e164.trim();
  if (!trimmed) return '';

  try {
    const parsed = parsePhoneNumberWithError(trimmed);
    if (!parsed) return trimmed;

    return parsed.format(format);
  } catch {
    return trimmed;
  }
}

/**
 * Validates phone number
 * @param phone - Phone number to validate (can be E.164 or any format)
 * @param country - Optional country code for validation context
 * @returns true if valid phone number
 *
 * @example
 * isValidPhone("+523317778888") // true
 * isValidPhone("331 777 8888", "MX") // true
 * isValidPhone("12345") // false
 */
export function isValidPhone(phone: string, country?: CountryCode): boolean {
  if (!phone) return false;

  const trimmed = phone.trim();
  if (!trimmed) return false;

  try {
    return isValidPhoneNumber(trimmed, country);
  } catch {
    return false;
  }
}

/**
 * Extracts country code from E.164 phone number
 * @param e164 - E.164 format phone number
 * @returns Country code (e.g., "MX") or null
 *
 * @example
 * getCountryCode("+523317778888") // "MX"
 * getCountryCode("+15551234567") // "US"
 * getCountryCode("invalid") // null
 */
export function getCountryCode(e164: string): CountryCode | null {
  if (!e164) return null;

  const trimmed = e164.trim();
  if (!trimmed) return null;

  try {
    const parsed = parsePhoneNumberWithError(trimmed);
    if (!parsed) return null;

    return parsed.country ?? null;
  } catch {
    return null;
  }
}
