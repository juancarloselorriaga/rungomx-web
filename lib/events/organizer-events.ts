import type { OrganizerEventSummary } from '@/lib/events/queries';

export type OrganizerEventsVisibilityFilter =
  | 'all'
  | 'draft'
  | 'published'
  | 'unlisted'
  | 'archived';

export type OrganizerEventsTimeFilter = 'all' | 'upcoming' | 'current' | 'past';

export type OrganizerEventsRegistrationFilter =
  | 'all'
  | 'open'
  | 'upcoming'
  | 'closed'
  | 'paused';

export type OrganizerEventsSort =
  | 'priority'
  | 'startsAt'
  | 'startsAtDesc'
  | 'createdAt'
  | 'registrations';

export type OrganizerEventsQuery = {
  search?: string;
  visibility?: OrganizerEventsVisibilityFilter;
  time?: OrganizerEventsTimeFilter;
  registration?: OrganizerEventsRegistrationFilter;
  organizationId?: string;
  sort?: OrganizerEventsSort;
};

export type NormalizedOrganizerEventsQuery = Required<
  Pick<
    OrganizerEventsQuery,
    'search' | 'visibility' | 'time' | 'registration' | 'organizationId' | 'sort'
  >
>;

const DEFAULT_QUERY: NormalizedOrganizerEventsQuery = {
  search: '',
  visibility: 'all',
  time: 'all',
  registration: 'all',
  organizationId: '',
  sort: 'priority',
};

type RawSearchParams = Record<string, string | string[] | undefined>;

const VISIBILITY_OPTIONS = new Set<OrganizerEventsVisibilityFilter>([
  'all',
  'draft',
  'published',
  'unlisted',
  'archived',
]);

const TIME_OPTIONS = new Set<OrganizerEventsTimeFilter>(['all', 'upcoming', 'current', 'past']);

const REGISTRATION_OPTIONS = new Set<OrganizerEventsRegistrationFilter>([
  'all',
  'open',
  'upcoming',
  'closed',
  'paused',
]);

const SORT_OPTIONS = new Set<OrganizerEventsSort>([
  'priority',
  'startsAt',
  'startsAtDesc',
  'createdAt',
  'registrations',
]);

export function normalizeOrganizerEventsQuery(
  query?: OrganizerEventsQuery,
): NormalizedOrganizerEventsQuery {
  const search = query?.search?.trim() ?? DEFAULT_QUERY.search;
  const visibility = VISIBILITY_OPTIONS.has(query?.visibility as OrganizerEventsVisibilityFilter)
    ? (query?.visibility as OrganizerEventsVisibilityFilter)
    : DEFAULT_QUERY.visibility;
  const time = TIME_OPTIONS.has(query?.time as OrganizerEventsTimeFilter)
    ? (query?.time as OrganizerEventsTimeFilter)
    : DEFAULT_QUERY.time;
  const registration = REGISTRATION_OPTIONS.has(
    query?.registration as OrganizerEventsRegistrationFilter,
  )
    ? (query?.registration as OrganizerEventsRegistrationFilter)
    : DEFAULT_QUERY.registration;
  const rawOrganizationId = query?.organizationId?.trim();
  const organizationId =
    rawOrganizationId && rawOrganizationId !== 'all'
      ? rawOrganizationId
      : DEFAULT_QUERY.organizationId;
  const sort = SORT_OPTIONS.has(query?.sort as OrganizerEventsSort)
    ? (query?.sort as OrganizerEventsSort)
    : DEFAULT_QUERY.sort;

  return { search, visibility, time, registration, organizationId, sort };
}

export function parseOrganizerEventsSearchParams(
  rawSearchParams?: RawSearchParams,
): OrganizerEventsQuery {
  if (!rawSearchParams) {
    return {};
  }

  const readValue = (value?: string | string[]) => (Array.isArray(value) ? value[0] : value);

  const search = readValue(rawSearchParams.search);
  const visibility = readValue(rawSearchParams.visibility);
  const time = readValue(rawSearchParams.time);
  const registration = readValue(rawSearchParams.registration);
  const organizationId = readValue(rawSearchParams.org);
  const sort = readValue(rawSearchParams.sort);

  return {
    search: search?.trim(),
    visibility: visibility as OrganizerEventsVisibilityFilter,
    time: time as OrganizerEventsTimeFilter,
    registration: registration as OrganizerEventsRegistrationFilter,
    organizationId: organizationId?.trim() === 'all' ? undefined : organizationId?.trim(),
    sort: sort as OrganizerEventsSort,
  };
}

export function buildOrganizerEventsQueryObject(
  query: OrganizerEventsQuery,
): Record<string, string> {
  const normalized = normalizeOrganizerEventsQuery(query);
  const params: Record<string, string> = {};

  if (normalized.search) params.search = normalized.search;
  if (normalized.visibility !== DEFAULT_QUERY.visibility)
    params.visibility = normalized.visibility;
  if (normalized.time !== DEFAULT_QUERY.time) params.time = normalized.time;
  if (normalized.registration !== DEFAULT_QUERY.registration)
    params.registration = normalized.registration;
  if (normalized.organizationId) params.org = normalized.organizationId;
  if (normalized.sort !== DEFAULT_QUERY.sort) params.sort = normalized.sort;

  return params;
}

export function hasOrganizerEventsFilters(query: OrganizerEventsQuery): boolean {
  const normalized = normalizeOrganizerEventsQuery(query);
  return (
    normalized.search !== DEFAULT_QUERY.search ||
    normalized.visibility !== DEFAULT_QUERY.visibility ||
    normalized.time !== DEFAULT_QUERY.time ||
    normalized.registration !== DEFAULT_QUERY.registration ||
    normalized.organizationId !== DEFAULT_QUERY.organizationId ||
    normalized.sort !== DEFAULT_QUERY.sort
  );
}

type EventTiming = {
  isPast: boolean;
  isCurrent: boolean;
  isUpcoming: boolean;
};

function getEventTiming(event: OrganizerEventSummary, now: Date): EventTiming {
  const startsAt = event.startsAt;
  const endsAt = event.endsAt;
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  const isPast = endsAt ? endsAt < now : startsAt ? startsAt < todayStart : false;
  const isCurrent = startsAt
    ? endsAt
      ? startsAt <= now && endsAt >= now
      : startsAt >= todayStart && startsAt <= todayEnd
    : false;
  const isUpcoming = startsAt ? startsAt > now : false;

  return { isPast, isCurrent, isUpcoming };
}

type RegistrationTiming = {
  isOpen: boolean;
  isUpcoming: boolean;
  isClosed: boolean;
  isPaused: boolean;
};

function getRegistrationTiming(event: OrganizerEventSummary, now: Date): RegistrationTiming {
  const opensAt = event.registrationOpensAt;
  const closesAt = event.registrationClosesAt;
  const isPaused = event.isRegistrationPaused;

  const isOpen =
    !isPaused &&
    (!opensAt || opensAt <= now) &&
    (!closesAt || closesAt >= now);
  const isUpcoming = !isPaused && Boolean(opensAt && opensAt > now);
  const isClosed = !isPaused && Boolean(closesAt && closesAt < now);

  return { isOpen, isUpcoming, isClosed, isPaused };
}

function normalizeSearchValue(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

function matchesSearch(event: OrganizerEventSummary, query: string): boolean {
  if (!query) return true;
  const tokens = normalizeSearchValue(query)
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length === 0) return true;

  const haystack = normalizeSearchValue(
    [
      event.seriesName,
      event.editionLabel,
      event.organizationName,
      event.city,
      event.state,
      event.slug,
      event.seriesSlug,
      event.publicCode,
    ]
      .filter(Boolean)
      .join(' '),
  );

  return tokens.every((token) => haystack.includes(token));
}

function compareDates(
  left: Date | null,
  right: Date | null,
  direction: 'asc' | 'desc',
): number {
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return direction === 'asc' ? left.getTime() - right.getTime() : right.getTime() - left.getTime();
}

function compareCreatedAt(left: OrganizerEventSummary, right: OrganizerEventSummary): number {
  return right.createdAt.getTime() - left.createdAt.getTime();
}

function compareRegistrationCount(
  left: OrganizerEventSummary,
  right: OrganizerEventSummary,
): number {
  if (left.registrationCount !== right.registrationCount) {
    return right.registrationCount - left.registrationCount;
  }
  return compareCreatedAt(left, right);
}

function getPriorityBucket(event: OrganizerEventSummary, timing: EventTiming): number {
  if (event.visibility === 'archived') return 3;
  if (timing.isPast) return 2;
  if (event.visibility === 'published' || timing.isCurrent) return 0;
  return 1;
}

function compareByPriority(
  left: OrganizerEventSummary,
  right: OrganizerEventSummary,
  leftTiming: EventTiming,
  rightTiming: EventTiming,
): number {
  const leftBucket = getPriorityBucket(left, leftTiming);
  const rightBucket = getPriorityBucket(right, rightTiming);

  if (leftBucket !== rightBucket) {
    return leftBucket - rightBucket;
  }

  if (leftBucket === 2) {
    const dateCompare = compareDates(left.startsAt, right.startsAt, 'desc');
    return dateCompare !== 0 ? dateCompare : compareCreatedAt(left, right);
  }

  const dateCompare = compareDates(left.startsAt, right.startsAt, 'asc');
  return dateCompare !== 0 ? dateCompare : compareCreatedAt(left, right);
}

export function applyOrganizerEventsQuery(
  events: OrganizerEventSummary[],
  query: OrganizerEventsQuery,
): OrganizerEventSummary[] {
  const normalized = normalizeOrganizerEventsQuery(query);
  const now = new Date();

  const filtered = events.filter((event) => {
    if (!matchesSearch(event, normalized.search)) return false;
    if (normalized.visibility !== 'all' && event.visibility !== normalized.visibility) return false;
    if (normalized.organizationId && event.organizationId !== normalized.organizationId) return false;

    const timing = getEventTiming(event, now);
    if (normalized.time === 'upcoming' && !timing.isUpcoming) return false;
    if (normalized.time === 'current' && !timing.isCurrent) return false;
    if (normalized.time === 'past' && !timing.isPast) return false;

    const registration = getRegistrationTiming(event, now);
    if (normalized.registration === 'open' && !registration.isOpen) return false;
    if (normalized.registration === 'upcoming' && !registration.isUpcoming) return false;
    if (normalized.registration === 'closed' && !registration.isClosed) return false;
    if (normalized.registration === 'paused' && !registration.isPaused) return false;

    return true;
  });

  return filtered.sort((left, right) => {
    const leftTiming = getEventTiming(left, now);
    const rightTiming = getEventTiming(right, now);

    switch (normalized.sort) {
      case 'startsAt':
        return (
          compareDates(left.startsAt, right.startsAt, 'asc') ||
          compareCreatedAt(left, right)
        );
      case 'startsAtDesc':
        return (
          compareDates(left.startsAt, right.startsAt, 'desc') ||
          compareCreatedAt(left, right)
        );
      case 'createdAt':
        return compareCreatedAt(left, right);
      case 'registrations':
        return compareRegistrationCount(left, right);
      case 'priority':
      default:
        return compareByPriority(left, right, leftTiming, rightTiming);
    }
  });
}
