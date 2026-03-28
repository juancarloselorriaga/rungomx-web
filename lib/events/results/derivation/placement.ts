import type { ResultEntryStatus } from '@/lib/events/results/status';
import { deriveResultAgeGroupKey } from '@/lib/events/results/derivation/age-group';

type StatusDerivationPolicy = {
  includeInOverall: boolean;
  includeInCategories: boolean;
};

type TieBreakKey =
  | 'finish_time_millis_asc'
  | 'runner_full_name_normalized_asc'
  | 'bib_number_asc'
  | 'entry_id_asc';

type RankingEntry = {
  id: string;
  runnerFullName: string;
  bibNumber: string | null;
  status: ResultEntryStatus;
  finishTimeMillis: number | null;
  gender: string | null;
  age: number | null;
  identitySnapshot?: unknown;
  rawSourceData?: unknown;
};

type DerivationByEntryId = {
  overallPlace: number | null;
  genderPlace: number | null;
  ageGroupPlace: number | null;
  genderCategoryKey: string | null;
  ageGroupCategoryKey: string | null;
};

type DerivationResult = {
  byEntryId: Record<string, DerivationByEntryId>;
  orderedEntryIds: string[];
};

type ResultsDerivationPolicyBaseline = {
  policyVersion: 'results-derivation-v1';
  timingBasis: 'elapsed_time_millis_only';
  tieBreakSequence: readonly TieBreakKey[];
};

const DEFAULT_STATUS_POLICY: Record<ResultEntryStatus, StatusDerivationPolicy> = {
  finish: {
    includeInOverall: true,
    includeInCategories: true,
  },
  dq: {
    includeInOverall: false,
    includeInCategories: false,
  },
  dnf: {
    includeInOverall: false,
    includeInCategories: false,
  },
  dns: {
    includeInOverall: false,
    includeInCategories: false,
  },
};

const RESULTS_DERIVATION_POLICY_BASELINE: ResultsDerivationPolicyBaseline = {
  policyVersion: 'results-derivation-v1',
  timingBasis: 'elapsed_time_millis_only',
  tieBreakSequence: [
    'finish_time_millis_asc',
    'runner_full_name_normalized_asc',
    'bib_number_asc',
    'entry_id_asc',
  ],
};

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeGenderCategory(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;

  if (['f', 'female', 'woman', 'mujer'].includes(normalized)) return 'female';
  if (['m', 'male', 'man', 'hombre'].includes(normalized)) return 'male';
  return normalized;
}

function normalizeFinishTime(value: number | null): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return Math.floor(value);
}

function compareBib(left: string | null, right: string | null): number {
  const leftValue = left?.trim() ?? '';
  const rightValue = right?.trim() ?? '';
  const leftNumeric = /^\d+$/.test(leftValue);
  const rightNumeric = /^\d+$/.test(rightValue);

  if (leftNumeric && rightNumeric) {
    const delta = Number.parseInt(leftValue, 10) - Number.parseInt(rightValue, 10);
    if (delta !== 0) return delta;
  }

  return leftValue.localeCompare(rightValue);
}

function toPolicy(
  override?: Partial<Record<ResultEntryStatus, Partial<StatusDerivationPolicy>>>,
): Record<ResultEntryStatus, StatusDerivationPolicy> {
  if (!override) return DEFAULT_STATUS_POLICY;

  return {
    finish: {
      ...DEFAULT_STATUS_POLICY.finish,
      ...(override.finish ?? {}),
    },
    dq: {
      ...DEFAULT_STATUS_POLICY.dq,
      ...(override.dq ?? {}),
    },
    dnf: {
      ...DEFAULT_STATUS_POLICY.dnf,
      ...(override.dnf ?? {}),
    },
    dns: {
      ...DEFAULT_STATUS_POLICY.dns,
      ...(override.dns ?? {}),
    },
  };
}

export function deriveResultPlacements(
  entries: readonly RankingEntry[],
  options?: {
    statusPolicy?: Partial<Record<ResultEntryStatus, Partial<StatusDerivationPolicy>>>;
  },
): DerivationResult {
  const policy = toPolicy(options?.statusPolicy);
  const byEntryId: Record<string, DerivationByEntryId> = Object.fromEntries(
    entries.map((entry) => [
      entry.id,
      {
        overallPlace: null,
        genderPlace: null,
        ageGroupPlace: null,
        genderCategoryKey: normalizeGenderCategory(entry.gender),
        ageGroupCategoryKey: deriveResultAgeGroupKey({
          age: entry.age,
          identitySnapshot: entry.identitySnapshot,
          rawSourceData: entry.rawSourceData,
        }),
      },
    ]),
  );

  const rankable = entries
    .map((entry) => {
      const effectiveFinishTime = normalizeFinishTime(entry.finishTimeMillis);
      const statusRules = policy[entry.status];
      const includeInOverall =
        Boolean(statusRules?.includeInOverall) && effectiveFinishTime !== null;
      const includeInCategories =
        Boolean(statusRules?.includeInCategories) && effectiveFinishTime !== null;

      return {
        entry,
        includeInOverall,
        includeInCategories,
        effectiveFinishTime,
        normalizedName: normalizeText(entry.runnerFullName),
      };
    })
    .filter((item) => item.includeInOverall)
    .sort((left, right) => {
      if (left.effectiveFinishTime !== right.effectiveFinishTime) {
        return (left.effectiveFinishTime ?? 0) - (right.effectiveFinishTime ?? 0);
      }

      const nameDelta = left.normalizedName.localeCompare(right.normalizedName);
      if (nameDelta !== 0) return nameDelta;

      const bibDelta = compareBib(left.entry.bibNumber, right.entry.bibNumber);
      if (bibDelta !== 0) return bibDelta;

      return left.entry.id.localeCompare(right.entry.id);
    });

  const orderedEntryIds = rankable.map((item) => item.entry.id);
  const genderCounters = new Map<string, number>();
  const ageGroupCounters = new Map<string, number>();

  rankable.forEach((item, index) => {
    const target = byEntryId[item.entry.id];
    if (!target) return;

    target.overallPlace = index + 1;
    if (!item.includeInCategories) return;

    if (target.genderCategoryKey) {
      const current = genderCounters.get(target.genderCategoryKey) ?? 0;
      const next = current + 1;
      genderCounters.set(target.genderCategoryKey, next);
      target.genderPlace = next;
    }

    if (target.ageGroupCategoryKey) {
      const current = ageGroupCounters.get(target.ageGroupCategoryKey) ?? 0;
      const next = current + 1;
      ageGroupCounters.set(target.ageGroupCategoryKey, next);
      target.ageGroupPlace = next;
    }
  });

  return {
    byEntryId,
    orderedEntryIds,
  };
}

export type {
  DerivationByEntryId,
  DerivationResult,
  RankingEntry,
  ResultsDerivationPolicyBaseline,
  StatusDerivationPolicy,
  TieBreakKey,
};
export { DEFAULT_STATUS_POLICY, RESULTS_DERIVATION_POLICY_BASELINE };
