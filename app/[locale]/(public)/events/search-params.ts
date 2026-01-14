export const EVENTS_PAGE_LIMIT = 12;

export type EventsSearchParamValue = string | number | boolean | null | undefined;
export type EventsSearchParamUpdates = Record<string, EventsSearchParamValue>;

export type SearchParamsInput =
  | string
  | URLSearchParams
  | Record<string, string | string[] | undefined>
  | null
  | undefined;

export type EventsSearchParams = {
  q?: string;
  sportType?: string;
  state?: string;
  dateFrom?: string;
  dateTo?: string;
  openOnly?: boolean;
  isVirtual?: boolean;
  distanceMin?: number;
  distanceMax?: number;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  page?: number;
  limit?: number;
};

function buildParams(
  current: string | URLSearchParams | Record<string, string>,
  updates: EventsSearchParamUpdates,
): URLSearchParams {
  const params =
    current instanceof URLSearchParams
      ? new URLSearchParams(current.toString())
      : typeof current === 'string'
        ? new URLSearchParams(current)
        : new URLSearchParams(current);

  Object.entries(updates).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') {
      params.delete(key);
    } else {
      params.set(key, String(value));
    }
  });

  return params;
}

function isURLSearchParams(value: SearchParamsInput): value is URLSearchParams {
  return Boolean(value && typeof (value as URLSearchParams).get === 'function');
}

export function buildEventsQueryObject(
  current: string | URLSearchParams | Record<string, string>,
  updates: EventsSearchParamUpdates,
): Record<string, string> {
  const params = buildParams(current, updates);
  return Object.fromEntries(params.entries());
}

function getSearchParamValue(params: SearchParamsInput, key: string): string | undefined {
  if (!params) return undefined;

  if (isURLSearchParams(params)) {
    return params.get(key) ?? undefined;
  }

  if (typeof params === 'string') {
    return new URLSearchParams(params).get(key) ?? undefined;
  }

  const value = params[key];
  if (Array.isArray(value)) {
    return value[0];
  }

  return value ?? undefined;
}

function parseNumberParam(
  value: string | undefined,
  options: { min?: number; max?: number } = {},
): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  if (options.min !== undefined && parsed < options.min) return undefined;
  if (options.max !== undefined && parsed > options.max) return undefined;
  return parsed;
}

function parseBooleanParam(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

const EXPLICIT_LOCATION_PARAMS = ['lat', 'lng', 'radiusKm', 'location', 'state', 'city'] as const;

export function hasExplicitLocationIntent(params: SearchParamsInput): boolean {
  return EXPLICIT_LOCATION_PARAMS.some(
    (key) => getSearchParamValue(params, key) !== undefined,
  );
}

export function parseEventsSearchParams(params: SearchParamsInput): EventsSearchParams {
  const rawQuery = getSearchParamValue(params, 'q')?.trim();
  const q = rawQuery && rawQuery.length >= 3 ? rawQuery : undefined;
  const sportType = getSearchParamValue(params, 'sportType')?.trim();
  const state = getSearchParamValue(params, 'state')?.trim();
  const dateFrom = getSearchParamValue(params, 'dateFrom') || undefined;
  const dateTo = getSearchParamValue(params, 'dateTo') || undefined;
  const openOnly = parseBooleanParam(getSearchParamValue(params, 'openOnly'));
  const isVirtual = parseBooleanParam(getSearchParamValue(params, 'isVirtual'));
  const distanceMin = parseNumberParam(getSearchParamValue(params, 'distanceMin'), { min: 0 });
  const distanceMax = parseNumberParam(getSearchParamValue(params, 'distanceMax'), { min: 0 });
  const lat = parseNumberParam(getSearchParamValue(params, 'lat'), { min: -90, max: 90 });
  const lng = parseNumberParam(getSearchParamValue(params, 'lng'), { min: -180, max: 180 });
  const radiusKm = parseNumberParam(getSearchParamValue(params, 'radiusKm'), {
    min: 0,
    max: 500,
  });
  const page = parseNumberParam(getSearchParamValue(params, 'page'), { min: 1 });
  const limit = parseNumberParam(getSearchParamValue(params, 'limit'), { min: 1, max: 50 });

  return {
    q,
    sportType: sportType || undefined,
    state: state || undefined,
    dateFrom,
    dateTo,
    openOnly,
    isVirtual,
    distanceMin,
    distanceMax,
    lat,
    lng,
    radiusKm,
    page,
    limit,
  };
}

export function parseDateParam(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}
