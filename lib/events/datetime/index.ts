type NaiveLocalDateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

type EventLocalScheduleFacts = {
  timeZone: string;
  dateLabel: string | null;
  startsAtLocal: string | null;
  endsAtLocal: string | null;
};

type EventTimeZoneInputParts = {
  date: string;
  time: string;
};

const DATE_TIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;
const EXPLICIT_OFFSET_RE = /(Z|[+-]\d{2}:\d{2})$/i;

function parseNaiveLocalDateTime(value: string): NaiveLocalDateTimeParts | null {
  const dateTimeMatch = DATE_TIME_RE.exec(value);
  if (!dateTimeMatch) return null;

  return {
    year: Number(dateTimeMatch[1]),
    month: Number(dateTimeMatch[2]),
    day: Number(dateTimeMatch[3]),
    hour: Number(dateTimeMatch[4]),
    minute: Number(dateTimeMatch[5]),
    second: Number(dateTimeMatch[6] ?? '0'),
  };
}

function getTimeZoneParts(date: Date, timeZone: string): NaiveLocalDateTimeParts | null {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);

    const values = Object.fromEntries(
      parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]),
    ) as Record<string, string>;

    return {
      year: Number(values.year),
      month: Number(values.month),
      day: Number(values.day),
      hour: Number(values.hour),
      minute: Number(values.minute),
      second: Number(values.second),
    };
  } catch {
    return null;
  }
}

function getTimeZoneOffsetMilliseconds(date: Date, timeZone: string): number | null {
  const values = getTimeZoneParts(date, timeZone);
  if (!values) return null;

  const localInstant = Date.UTC(
    values.year,
    values.month - 1,
    values.day,
    values.hour,
    values.minute,
    values.second,
  );

  return localInstant - date.getTime();
}

function convertNaiveLocalDateTimeToUtcIso(value: string, timeZone: string): string | null {
  const parsed = parseNaiveLocalDateTime(value);
  if (!parsed) return null;

  const utcGuess = Date.UTC(
    parsed.year,
    parsed.month - 1,
    parsed.day,
    parsed.hour,
    parsed.minute,
    parsed.second,
  );

  let candidate = utcGuess;

  for (let index = 0; index < 3; index += 1) {
    const offset = getTimeZoneOffsetMilliseconds(new Date(candidate), timeZone);
    if (offset === null) return null;

    const nextCandidate = utcGuess - offset;
    if (nextCandidate === candidate) break;
    candidate = nextCandidate;
  }

  const resolvedParts = getTimeZoneParts(new Date(candidate), timeZone);
  if (!resolvedParts) return null;

  if (
    resolvedParts.year !== parsed.year ||
    resolvedParts.month !== parsed.month ||
    resolvedParts.day !== parsed.day ||
    resolvedParts.hour !== parsed.hour ||
    resolvedParts.minute !== parsed.minute ||
    resolvedParts.second !== parsed.second
  ) {
    return null;
  }

  return new Date(candidate).toISOString();
}

function formatInputParts(parts: NaiveLocalDateTimeParts): EventTimeZoneInputParts {
  return {
    date: `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`,
    time: `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`,
  };
}

function getFallbackUtcInputParts(date: Date): EventTimeZoneInputParts {
  return {
    date: `${String(date.getUTCFullYear()).padStart(4, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`,
    time: `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`,
  };
}

function resolveLocale(locale: string | null | undefined): string {
  const normalized = locale?.trim();
  if (!normalized) return 'es-MX';

  const baseLocale = normalized.split('-')[0]?.toLowerCase();
  if (baseLocale === 'en') return 'en-US';
  if (baseLocale === 'es') return 'es-MX';
  return normalized;
}

function formatInTimeZone(
  date: Date,
  locale: string,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
): string | null {
  try {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(date);
  } catch {
    return null;
  }
}

export function normalizeEditionDateTimeForPersistence(
  value: string,
  timeZone?: string | null,
): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (!EXPLICIT_OFFSET_RE.test(trimmed) && trimmed.includes('T')) {
    const naiveLocal = parseNaiveLocalDateTime(trimmed);
    if (naiveLocal && timeZone) {
      return convertNaiveLocalDateTimeToUtcIso(trimmed, timeZone);
    }
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export function formatEditionDateForInputInTimeZone(date: Date, timeZone?: string | null): string {
  const parts = timeZone ? getTimeZoneParts(date, timeZone) : null;
  return parts ? formatInputParts(parts).date : getFallbackUtcInputParts(date).date;
}

export function formatEditionTimeForInputInTimeZone(date: Date, timeZone?: string | null): string {
  const parts = timeZone ? getTimeZoneParts(date, timeZone) : null;
  return parts ? formatInputParts(parts).time : getFallbackUtcInputParts(date).time;
}

export function formatEditionDateTimeForInputInTimeZone(
  date: Date,
  timeZone?: string | null,
): string {
  const parts = timeZone ? getTimeZoneParts(date, timeZone) : null;
  const inputParts = parts ? formatInputParts(parts) : getFallbackUtcInputParts(date);
  return `${inputParts.date}T${inputParts.time}`;
}

export function hasTrustedEventStartTime(
  startsAt?: Date | null,
  timeZone?: string | null,
): boolean {
  if (!startsAt) return false;
  if (!timeZone || timeZone === 'UTC') return true;

  return !(
    startsAt.getUTCHours() === 0 &&
    startsAt.getUTCMinutes() === 0 &&
    startsAt.getUTCSeconds() === 0 &&
    startsAt.getUTCMilliseconds() === 0
  );
}

export function getEventLocalScheduleFacts(params: {
  startsAt?: Date | null;
  endsAt?: Date | null;
  timeZone?: string | null;
  locale?: string | null;
}): EventLocalScheduleFacts | null {
  const { startsAt, endsAt, timeZone, locale } = params;
  if (!timeZone || (!startsAt && !endsAt)) return null;

  const resolvedLocale = resolveLocale(locale);
  const dateSource = startsAt ?? endsAt;
  if (!dateSource) return null;

  const dateLabel = formatInTimeZone(dateSource, resolvedLocale, timeZone, {
    dateStyle: 'long',
  });
  const startsAtLocal = startsAt
    ? formatInTimeZone(startsAt, resolvedLocale, timeZone, {
        timeStyle: 'short',
      })
    : null;
  const endsAtLocal = endsAt
    ? formatInTimeZone(endsAt, resolvedLocale, timeZone, {
        timeStyle: 'short',
      })
    : null;

  if (!dateLabel && !startsAtLocal && !endsAtLocal) return null;

  return {
    timeZone,
    dateLabel,
    startsAtLocal,
    endsAtLocal,
  };
}
