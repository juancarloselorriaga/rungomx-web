import { formatDate, normalizeMetadata, stringifyMetadata } from '@/lib/contact-submissions/utils';

describe('contact submissions utils', () => {
  describe('normalizeMetadata', () => {
    it('returns empty object for invalid inputs', () => {
      expect(normalizeMetadata(undefined)).toEqual({});
      expect(normalizeMetadata(null)).toEqual({});
      expect(normalizeMetadata('string')).toEqual({});
      expect(normalizeMetadata(['not', 'object'])).toEqual({});
    });

    it('strips undefined values and preserves other entries', () => {
      const metadata = {
        foo: 'bar',
        count: 1,
        optional: undefined,
      };

      expect(normalizeMetadata(metadata)).toEqual({
        foo: 'bar',
        count: 1,
      });
    });
  });

  describe('stringifyMetadata', () => {
    it('returns empty string when serialization fails', () => {
      const circular: Record<string, unknown> = {};
      circular.self = circular;

      expect(stringifyMetadata(circular)).toBe('');
    });

    it('stringifies objects when possible', () => {
      expect(stringifyMetadata({ foo: 'bar', nested: { a: 1 } })).toBe(
        JSON.stringify({ foo: 'bar', nested: { a: 1 } }, null, 2),
      );
    });
  });

  describe('formatDate', () => {
    it('uses provided date instance', () => {
      const date = new Date('2024-01-01T00:00:00.000Z');
      expect(formatDate(date)).toBe(date.toISOString());
    });

    it('falls back to current date for invalid inputs', () => {
      jest.useFakeTimers().setSystemTime(new Date('2024-05-05T12:00:00.000Z'));

      expect(formatDate('not-a-date')).toBe(new Date().toISOString());

      jest.useRealTimers();
    });
  });
});
