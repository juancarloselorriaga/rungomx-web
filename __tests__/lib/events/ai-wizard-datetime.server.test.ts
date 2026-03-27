import {
  formatEditionDateTimeForInputInTimeZone,
  formatEditionDateForInputInTimeZone,
  formatEditionTimeForInputInTimeZone,
  hasTrustedEventStartTime,
  normalizeEditionDateTimeForPersistence,
} from '@/lib/events/ai-wizard/datetime';

describe('event datetime helpers', () => {
  it('persists naive local event start datetimes using the event timezone instead of host-local parsing', () => {
    expect(
      normalizeEditionDateTimeForPersistence('2026-10-12T07:00', 'America/Mexico_City'),
    ).toBe('2026-10-12T13:00:00.000Z');
  });

  it('rebuilds saved UTC instants into the organizer-local date and time inputs', () => {
    const savedStart = new Date('2026-10-12T13:00:00.000Z');

    expect(formatEditionDateForInputInTimeZone(savedStart, 'America/Mexico_City')).toBe('2026-10-12');
    expect(formatEditionTimeForInputInTimeZone(savedStart, 'America/Mexico_City')).toBe('07:00');
  });

  it('rebuilds saved registration boundary instants into the same organizer-local datetime input values', () => {
    expect(
      formatEditionDateTimeForInputInTimeZone(
        new Date('2026-09-01T06:00:00.000Z'),
        'America/Mexico_City',
      ),
    ).toBe('2026-09-01T00:00');

    expect(
      formatEditionDateTimeForInputInTimeZone(
        new Date('2026-09-02T05:59:00.000Z'),
        'America/Mexico_City',
      ),
    ).toBe('2026-09-01T23:59');
  });

  it('keeps registration boundary datetimes stable across save, reload, and save-again cycles', () => {
    const firstSave = normalizeEditionDateTimeForPersistence(
      '2026-09-01T23:59',
      'America/Mexico_City',
    );

    expect(firstSave).toBe('2026-09-02T05:59:00.000Z');

    const reloadedInput = formatEditionDateTimeForInputInTimeZone(
      new Date(firstSave ?? ''),
      'America/Mexico_City',
    );

    expect(reloadedInput).toBe('2026-09-01T23:59');
    expect(
      normalizeEditionDateTimeForPersistence(reloadedInput, 'America/Mexico_City'),
    ).toBe(firstSave);
  });

  it('treats legacy UTC-midnight schedule values as missing a trustworthy event start time for non-UTC events', () => {
    expect(
      hasTrustedEventStartTime(new Date('2026-10-12T00:00:00.000Z'), 'America/Mexico_City'),
    ).toBe(false);
    expect(
      hasTrustedEventStartTime(new Date('2026-10-12T13:00:00.000Z'), 'America/Mexico_City'),
    ).toBe(true);
  });
});
