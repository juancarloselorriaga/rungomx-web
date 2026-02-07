type AgeGroupBracket = {
  key: string;
  minAge: number;
  maxAge: number | null;
};

const DEFAULT_AGE_GROUP_BRACKETS: readonly AgeGroupBracket[] = [
  { key: 'u18', minAge: 0, maxAge: 17 },
  { key: '18-24', minAge: 18, maxAge: 24 },
  { key: '25-34', minAge: 25, maxAge: 34 },
  { key: '35-44', minAge: 35, maxAge: 44 },
  { key: '45-54', minAge: 45, maxAge: 54 },
  { key: '55-64', minAge: 55, maxAge: 64 },
  { key: '65+', minAge: 65, maxAge: null },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeAge(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const normalized = Math.floor(value);
  return normalized >= 0 ? normalized : null;
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().replace(/\s+/g, ' ');
  return normalized.length > 0 ? normalized : null;
}

function readCategoryHint(record: unknown): string | null {
  if (!isRecord(record)) return null;
  const hint =
    normalizeString(record.ageGroup) ??
    normalizeString(record.age_group) ??
    normalizeString(record.category) ??
    normalizeString(record.categoryKey);
  return hint;
}

export function deriveResultAgeGroupKey(params: {
  age: number | null | undefined;
  identitySnapshot?: unknown;
  rawSourceData?: unknown;
  brackets?: readonly AgeGroupBracket[];
}): string | null {
  const fromIdentity = readCategoryHint(params.identitySnapshot);
  if (fromIdentity) return fromIdentity;

  const fromRaw = readCategoryHint(params.rawSourceData);
  if (fromRaw) return fromRaw;

  const age = normalizeAge(params.age);
  if (age === null) return null;

  const brackets = params.brackets ?? DEFAULT_AGE_GROUP_BRACKETS;
  const match = brackets.find(
    (bracket) =>
      age >= bracket.minAge &&
      (bracket.maxAge === null || age <= bracket.maxAge),
  );
  return match?.key ?? null;
}

export type { AgeGroupBracket };
export { DEFAULT_AGE_GROUP_BRACKETS };
