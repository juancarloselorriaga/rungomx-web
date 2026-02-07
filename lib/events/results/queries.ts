import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  or,
  sql,
} from 'drizzle-orm';

import { db } from '@/db';
import {
  auditLogs,
  eventDistances,
  eventEditions,
  eventSeries,
  organizations,
  resultCorrectionRequests,
  resultEntries,
  resultEntryClaims,
  resultVersions,
  users,
} from '@/db/schema';
import {
  resultsEditionTag,
  resultsOfficialTag,
  resultsSearchTag,
} from '@/lib/events/results/cache-tags';
import { resultEntryLookupSchema, type ResultEntryLookupInput } from '@/lib/events/results/schemas';
import type {
  CorrectionLifecycleAgingHighlightItem,
  CorrectionLifecycleExportRow,
  CorrectionLifecycleMetrics,
  CorrectionLifecycleMetricsFilters,
  CorrectionAuditTrailItem,
  CorrectionChangeSummaryItem,
  OrganizerCorrectionRequestQueueItem,
  InternalCorrectionTransitionInvestigationItem,
  InternalResultsInvestigationViewData,
  InternalResultVersionDiffSummary,
  InternalResultVersionInvestigationItem,
  PendingResultClaimReviewItem,
  PublicOfficialResultSearchItem,
  PublicOfficialResultsDirectoryItem,
  PublicOfficialResultsPageData,
  PublicCorrectionSummaryItem,
  RankingSourceEligibility,
  ResultCorrectionRequestStatus,
  ResultEntryStatus,
  ResultEntryRecord,
  ResultDiscipline,
  ResultTrustAuditAction,
  ResultTrustAuditLogFilters,
  ResultTrustAuditLogItem,
  ResultClaimResolutionTraceItem,
  ResultVersionRecord,
  ResultVersionStatus,
} from '@/lib/events/results/types';
import { safeCacheLife, safeCacheTag } from '@/lib/next-cache';

function toResultVersionRecord(row: typeof resultVersions.$inferSelect): ResultVersionRecord {
  return {
    id: row.id,
    editionId: row.editionId,
    status: row.status,
    source: row.source,
    versionNumber: row.versionNumber,
    parentVersionId: row.parentVersionId,
    createdByUserId: row.createdByUserId,
    finalizedByUserId: row.finalizedByUserId,
    finalizedAt: row.finalizedAt,
    sourceFileChecksum: row.sourceFileChecksum,
    sourceReference: row.sourceReference,
    provenanceJson: row.provenanceJson,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toResultEntryRecord(row: typeof resultEntries.$inferSelect): ResultEntryRecord {
  return {
    id: row.id,
    resultVersionId: row.resultVersionId,
    distanceId: row.distanceId,
    userId: row.userId,
    discipline: row.discipline,
    runnerFullName: row.runnerFullName,
    bibNumber: row.bibNumber,
    gender: row.gender,
    age: row.age,
    status: row.status,
    finishTimeMillis: row.finishTimeMillis,
    overallPlace: row.overallPlace,
    genderPlace: row.genderPlace,
    ageGroupPlace: row.ageGroupPlace,
    identitySnapshot: row.identitySnapshot,
    rawSourceData: row.rawSourceData,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getDraftResultVersionById(
  resultVersionId: string,
): Promise<ResultVersionRecord | null> {
  const version = await db.query.resultVersions.findFirst({
    where: and(
      eq(resultVersions.id, resultVersionId),
      eq(resultVersions.status, 'draft'),
      isNull(resultVersions.deletedAt),
    ),
  });

  if (!version) return null;
  return toResultVersionRecord(version);
}

export async function listDraftResultEntries(
  resultVersionId: string,
  limit = 200,
): Promise<ResultEntryRecord[]> {
  const draftVersion = await getDraftResultVersionById(resultVersionId);
  if (!draftVersion) return [];

  const rows = await db.query.resultEntries.findMany({
    where: and(
      eq(resultEntries.resultVersionId, resultVersionId),
      isNull(resultEntries.deletedAt),
    ),
    orderBy: [asc(resultEntries.createdAt)],
    limit,
  });

  return rows.map(toResultEntryRecord);
}

export async function findDraftEntriesByIdentity(
  input: ResultEntryLookupInput,
): Promise<ResultEntryRecord[]> {
  const parsed = resultEntryLookupSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Invalid identity lookup input');
  }

  const { resultVersionId, bibNumber, runnerFullName, limit } = parsed.data;
  const draftVersion = await getDraftResultVersionById(resultVersionId);
  if (!draftVersion) return [];

  const identityPredicate =
    bibNumber && runnerFullName
      ? and(eq(resultEntries.bibNumber, bibNumber), eq(resultEntries.runnerFullName, runnerFullName))
      : bibNumber
        ? eq(resultEntries.bibNumber, bibNumber)
        : eq(resultEntries.runnerFullName, runnerFullName!);

  const rows = await db.query.resultEntries.findMany({
    where: and(
      eq(resultEntries.resultVersionId, resultVersionId),
      isNull(resultEntries.deletedAt),
      identityPredicate,
    ),
    orderBy: [asc(resultEntries.createdAt)],
    limit,
  });

  return rows.map(toResultEntryRecord);
}

export type UnclaimedResultClaimCandidateRow = {
  entryId: string;
  resultVersionId: string;
  runnerFullName: string;
  bibNumber: string | null;
  discipline: (typeof resultEntries.$inferSelect)['discipline'];
  status: (typeof resultEntries.$inferSelect)['status'];
  finishTimeMillis: number | null;
  overallPlace: number | null;
  genderPlace: number | null;
  ageGroupPlace: number | null;
  gender: string | null;
  age: number | null;
  entryCreatedAt: Date;
  seriesName: string;
  seriesSlug: string;
  editionId: string;
  editionLabel: string;
  editionSlug: string;
  editionStartsAt: Date | null;
  editionCity: string | null;
  editionState: string | null;
  distanceLabel: string | null;
};

type FindUnclaimedResultClaimCandidatesInput = {
  runnerName: string;
  runnerNameTokens: string[];
  limit: number;
};

type FindUnclaimedResultClaimCandidateByEntryIdInput = {
  entryId: string;
  runnerName: string;
  runnerNameTokens: string[];
};

export type RankingEligibilityCandidateVersion = {
  id: string;
  editionId: string;
  status: ResultVersionStatus;
  versionNumber: number;
  createdAt: Date;
};

const CLAIM_CANDIDATE_QUERY_STATUSES: (typeof resultVersions.$inferSelect)['status'][] = [
  'official',
  'corrected',
];
const ACTIVE_RESULT_CLAIM_STATUSES: (typeof resultEntryClaims.$inferSelect)['status'][] = [
  'pending_review',
  'linked',
];
const RESOLVED_RESULT_CLAIM_STATUSES: (typeof resultEntryClaims.$inferSelect)['status'][] = [
  'linked',
  'rejected',
];
const RANKING_ELIGIBILITY_STATUSES: Extract<ResultVersionStatus, 'official' | 'corrected'>[] = [
  'official',
  'corrected',
];

const CLAIM_CANDIDATE_QUERY_LIMIT_MAX = 100;
const CLAIM_REVIEW_QUERY_LIMIT_MAX = 200;
const CORRECTION_REVIEW_QUERY_LIMIT_MAX = 200;
const PUBLIC_CORRECTION_SUMMARY_LIMIT_MAX = 50;
const PUBLIC_OFFICIAL_RESULTS_ENTRY_LIMIT_MAX = 500;
const PUBLIC_RESULTS_DISCOVERY_LIMIT_MAX = 200;
const PUBLIC_RESULTS_SEARCH_LIMIT_MAX = 200;
const CORRECTION_AUDIT_TRAIL_LIMIT_MAX = 200;
const CORRECTION_LIFECYCLE_EXPORT_LIMIT_MAX = 1000;
const CORRECTION_LIFECYCLE_AGING_HIGHLIGHT_LIMIT = 10;
const INTERNAL_INVESTIGATION_VERSION_LIMIT_MAX = 120;
const INTERNAL_INVESTIGATION_CORRECTION_LIMIT_MAX = 120;
const RESULTS_TRUST_AUDIT_LIMIT_MAX = 200;
const RESULTS_TRUST_AUDIT_ACTIONS: readonly ResultTrustAuditAction[] = [
  'results.ingestion.initialize',
  'results.version.finalize',
  'results.correction.review.approve',
  'results.correction.publish',
];

const CORRECTION_PATCH_FIELD_LABELS: Record<string, string> = {
  runnerFullName: 'Runner name',
  bibNumber: 'Bib number',
  gender: 'Gender',
  age: 'Age',
  status: 'Result status',
  finishTimeMillis: 'Finish time (ms)',
  distanceId: 'Distance',
};

function buildClaimNameSearchTerms(runnerName: string, runnerNameTokens: string[]): string[] {
  const terms = new Set<string>();

  const fullName = runnerName.trim();
  if (fullName) terms.add(fullName);

  for (const token of runnerNameTokens) {
    const normalized = token.trim();
    if (normalized.length >= 2) terms.add(normalized);
  }

  return [...terms];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toDisplayValue(value: unknown): string {
  if (value === null || value === undefined) return 'N/A';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function toUserDisplayName(user: { name: string | null; email: string } | null | undefined): string | null {
  if (!user) return null;
  const trimmedName = user.name?.trim();
  return trimmedName && trimmedName.length > 0 ? trimmedName : user.email;
}

function computeMedian(values: number[]): number | null {
  if (values.length === 0) return null;

  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) return sorted[midpoint] ?? null;

  const left = sorted[midpoint - 1];
  const right = sorted[midpoint];
  if (left === undefined || right === undefined) return null;
  return Math.round((left + right) / 2);
}

function toPublishedContext(value: unknown): {
  correctedResultVersionId: string;
  publishedAt: Date | null;
} | null {
  if (!isRecord(value)) return null;
  const resultVersionId = value.publishedResultVersionId;
  if (typeof resultVersionId !== 'string' || resultVersionId.length === 0) return null;

  const publishedAtRaw = value.publishedAt;
  const publishedAt =
    typeof publishedAtRaw === 'string'
      ? new Date(publishedAtRaw)
      : publishedAtRaw instanceof Date
        ? publishedAtRaw
        : null;

  return {
    correctedResultVersionId: resultVersionId,
    publishedAt:
      publishedAt && !Number.isNaN(publishedAt.getTime())
        ? publishedAt
        : null,
  };
}

function extractEditionIdFromAuditPayload(
  before: unknown,
  after: unknown,
): string | null {
  const readEditionId = (candidate: unknown): string | null => {
    if (!isRecord(candidate)) return null;
    const editionId = candidate.editionId;
    return typeof editionId === 'string' && editionId.length > 0 ? editionId : null;
  };

  return readEditionId(after) ?? readEditionId(before);
}

function toCorrectionPatchSummary(requestContext: unknown): CorrectionChangeSummaryItem[] {
  if (!isRecord(requestContext)) return [];
  const rawPatch = isRecord(requestContext.correctionPatch)
    ? requestContext.correctionPatch
    : requestContext;

  if (!isRecord(rawPatch)) return [];

  return Object.entries(rawPatch)
    .filter(([key]) => key in CORRECTION_PATCH_FIELD_LABELS)
    .map(([key, value]) => ({
      field: CORRECTION_PATCH_FIELD_LABELS[key] ?? key,
      value: toDisplayValue(value),
    }));
}

function toClaimConfidenceScore(basisPoints: number | null): number {
  if (typeof basisPoints !== 'number') return 0;
  return Number((basisPoints / 1000).toFixed(3));
}

function sortRankingEligibilityCandidates(
  candidates: readonly RankingEligibilityCandidateVersion[],
): RankingEligibilityCandidateVersion[] {
  return [...candidates].sort((left, right) => {
    if (left.versionNumber !== right.versionNumber) {
      return right.versionNumber - left.versionNumber;
    }
    return right.createdAt.getTime() - left.createdAt.getTime();
  });
}

export function selectLatestRankingEligibleVersion(
  candidates: readonly RankingEligibilityCandidateVersion[],
): RankingEligibilityCandidateVersion | null {
  const ordered = sortRankingEligibilityCandidates(candidates);
  return (
    ordered.find((candidate) =>
      RANKING_ELIGIBILITY_STATUSES.includes(
        candidate.status as Extract<ResultVersionStatus, 'official' | 'corrected'>,
      ),
    ) ?? null
  );
}

export function resolveRankingSourceEligibility(params: {
  editionId: string;
  candidates: readonly RankingEligibilityCandidateVersion[];
}): RankingSourceEligibility {
  const eligible = selectLatestRankingEligibleVersion(params.candidates);
  if (!eligible) {
    return {
      editionId: params.editionId,
      state: 'not_finalized',
      resultVersionId: null,
      resultVersionStatus: null,
    };
  }

  return {
    editionId: params.editionId,
    state: 'eligible',
    resultVersionId: eligible.id,
    resultVersionStatus: eligible.status as Extract<ResultVersionStatus, 'official' | 'corrected'>,
  };
}

export async function getRankingSourceEligibilityForEdition(
  editionId: string,
): Promise<RankingSourceEligibility> {
  const candidates = await db.query.resultVersions.findMany({
    where: and(eq(resultVersions.editionId, editionId), isNull(resultVersions.deletedAt)),
    columns: {
      id: true,
      editionId: true,
      status: true,
      versionNumber: true,
      createdAt: true,
    },
    orderBy: [desc(resultVersions.versionNumber), desc(resultVersions.createdAt)],
    limit: 100,
  });

  return resolveRankingSourceEligibility({
    editionId,
    candidates,
  });
}

type PublicOfficialEditionLookup = {
  editionId: string;
  editionLabel: string;
  editionSlug: string;
  visibility: string;
  organizerName: string | null;
  startsAt: Date | null;
  timezone: string;
  city: string | null;
  state: string | null;
  seriesSlug: string;
  seriesName: string;
};

type PublicOfficialEntryRow = {
  entryId: string;
  runnerFullName: string;
  bibNumber: string | null;
  discipline: ResultDiscipline;
  status: ResultEntryStatus;
  finishTimeMillis: number | null;
  overallPlace: number | null;
  genderPlace: number | null;
  ageGroupPlace: number | null;
  distanceLabel: string | null;
};

export async function getPublicOfficialResultsPageData(
  seriesSlug: string,
  editionSlug: string,
  options: { entryLimit?: number } = {},
): Promise<PublicOfficialResultsPageData> {
  'use cache: remote';
  safeCacheLife({ expire: 60 });

  const safeLimit = Math.min(
    Math.max(options.entryLimit ?? 200, 1),
    PUBLIC_OFFICIAL_RESULTS_ENTRY_LIMIT_MAX,
  );

  const editionRows = await db
    .select({
      editionId: eventEditions.id,
      editionLabel: eventEditions.editionLabel,
      editionSlug: eventEditions.slug,
      visibility: eventEditions.visibility,
      organizerName: organizations.name,
      startsAt: eventEditions.startsAt,
      timezone: eventEditions.timezone,
      city: eventEditions.city,
      state: eventEditions.state,
      seriesSlug: eventSeries.slug,
      seriesName: eventSeries.name,
    })
    .from(eventEditions)
    .innerJoin(eventSeries, eq(eventEditions.seriesId, eventSeries.id))
    .leftJoin(organizations, eq(eventSeries.organizationId, organizations.id))
    .where(
      and(
        eq(eventSeries.slug, seriesSlug),
        eq(eventEditions.slug, editionSlug),
        or(eq(eventEditions.visibility, 'published'), eq(eventEditions.visibility, 'unlisted')),
        isNull(eventSeries.deletedAt),
        isNull(eventEditions.deletedAt),
      ),
    )
    .limit(1);

  const edition = (editionRows[0] ?? null) as PublicOfficialEditionLookup | null;
  if (!edition) return { state: 'not_found' };

  safeCacheTag(resultsEditionTag(edition.editionId), resultsOfficialTag(edition.editionId));

  const activeVersion = await db.query.resultVersions.findFirst({
    where: and(
      eq(resultVersions.editionId, edition.editionId),
      inArray(resultVersions.status, RANKING_ELIGIBILITY_STATUSES),
      isNull(resultVersions.deletedAt),
    ),
    columns: {
      id: true,
      status: true,
      versionNumber: true,
      finalizedAt: true,
      updatedAt: true,
      createdAt: true,
    },
    orderBy: [desc(resultVersions.versionNumber), desc(resultVersions.createdAt)],
  });

  if (!activeVersion) {
    return {
      state: 'not_finalized',
      edition,
    };
  }

  const entryRows = await db
    .select({
      entryId: resultEntries.id,
      runnerFullName: resultEntries.runnerFullName,
      bibNumber: resultEntries.bibNumber,
      discipline: resultEntries.discipline,
      status: resultEntries.status,
      finishTimeMillis: resultEntries.finishTimeMillis,
      overallPlace: resultEntries.overallPlace,
      genderPlace: resultEntries.genderPlace,
      ageGroupPlace: resultEntries.ageGroupPlace,
      distanceLabel: eventDistances.label,
    })
    .from(resultEntries)
    .leftJoin(eventDistances, eq(resultEntries.distanceId, eventDistances.id))
    .where(
      and(
        eq(resultEntries.resultVersionId, activeVersion.id),
        isNull(resultEntries.deletedAt),
        or(isNull(resultEntries.distanceId), isNull(eventDistances.deletedAt)),
      ),
    )
    .orderBy(
      sql`${resultEntries.overallPlace} is null`,
      asc(resultEntries.overallPlace),
      sql`${resultEntries.finishTimeMillis} is null`,
      asc(resultEntries.finishTimeMillis),
      asc(resultEntries.runnerFullName),
      asc(resultEntries.id),
    )
    .limit(safeLimit);

  const entries = entryRows as PublicOfficialEntryRow[];

  return {
    state: 'official',
    edition,
    activeVersion: {
      id: activeVersion.id,
      status: activeVersion.status as Extract<ResultVersionStatus, 'official' | 'corrected'>,
      versionNumber: activeVersion.versionNumber,
      finalizedAt: activeVersion.finalizedAt,
      updatedAt: activeVersion.updatedAt,
    },
    entries: entries.map((entry) => ({
      id: entry.entryId,
      runnerFullName: entry.runnerFullName,
      bibNumber: entry.bibNumber,
      discipline: entry.discipline,
      status: entry.status,
      finishTimeMillis: entry.finishTimeMillis,
      overallPlace: entry.overallPlace,
      genderPlace: entry.genderPlace,
      ageGroupPlace: entry.ageGroupPlace,
      distanceLabel: entry.distanceLabel,
    })),
  };
}

type ActiveOfficialVersionPointer = {
  editionId: string;
  resultVersionId: string;
  status: Extract<ResultVersionStatus, 'official' | 'corrected'>;
  versionNumber: number;
};

async function listActiveOfficialVersionPointers(): Promise<ActiveOfficialVersionPointer[]> {
  const candidates = await db.query.resultVersions.findMany({
    where: and(
      inArray(resultVersions.status, RANKING_ELIGIBILITY_STATUSES),
      isNull(resultVersions.deletedAt),
    ),
    columns: {
      id: true,
      editionId: true,
      status: true,
      versionNumber: true,
      createdAt: true,
    },
    orderBy: [asc(resultVersions.editionId), desc(resultVersions.versionNumber), desc(resultVersions.createdAt)],
  });

  const pointerByEdition = new Map<string, ActiveOfficialVersionPointer>();

  for (const candidate of candidates) {
    if (pointerByEdition.has(candidate.editionId)) continue;
    pointerByEdition.set(candidate.editionId, {
      editionId: candidate.editionId,
      resultVersionId: candidate.id,
      status: candidate.status as Extract<ResultVersionStatus, 'official' | 'corrected'>,
      versionNumber: candidate.versionNumber,
    });
  }

  return [...pointerByEdition.values()];
}

type PublicResultsDirectoryFilters = {
  seriesSlug?: string;
  limit?: number;
};

export async function listPublicOfficialResultsDirectory(
  filters: PublicResultsDirectoryFilters = {},
): Promise<PublicOfficialResultsDirectoryItem[]> {
  'use cache: remote';
  safeCacheLife({ expire: 60 });
  safeCacheTag(resultsSearchTag());

  const safeLimit = Math.min(
    Math.max(filters.limit ?? 40, 1),
    PUBLIC_RESULTS_DISCOVERY_LIMIT_MAX,
  );

  const activePointers = await listActiveOfficialVersionPointers();
  if (activePointers.length === 0) return [];

  const activePointerByEditionId = new Map(
    activePointers.map((pointer) => [pointer.editionId, pointer]),
  );
  const activeEditionIds = [...activePointerByEditionId.keys()];

  const predicates = [
    inArray(eventEditions.id, activeEditionIds),
    or(eq(eventEditions.visibility, 'published'), eq(eventEditions.visibility, 'unlisted')),
    isNull(eventEditions.deletedAt),
    isNull(eventSeries.deletedAt),
  ];

  if (filters.seriesSlug) {
    predicates.push(eq(eventSeries.slug, filters.seriesSlug));
  }

  const rows = await db
    .select({
      editionId: eventEditions.id,
      editionSlug: eventEditions.slug,
      editionLabel: eventEditions.editionLabel,
      startsAt: eventEditions.startsAt,
      city: eventEditions.city,
      state: eventEditions.state,
      seriesSlug: eventSeries.slug,
      seriesName: eventSeries.name,
    })
    .from(eventEditions)
    .innerJoin(eventSeries, eq(eventEditions.seriesId, eventSeries.id))
    .where(and(...predicates))
    .orderBy(desc(eventEditions.startsAt), asc(eventSeries.name), asc(eventEditions.editionLabel))
    .limit(safeLimit);

  return rows
    .map((row) => {
      const pointer = activePointerByEditionId.get(row.editionId);
      if (!pointer) return null;

      return {
        editionId: row.editionId,
        seriesSlug: row.seriesSlug,
        seriesName: row.seriesName,
        editionSlug: row.editionSlug,
        editionLabel: row.editionLabel,
        startsAt: row.startsAt,
        city: row.city,
        state: row.state,
        activeVersionStatus: pointer.status,
        activeVersionNumber: pointer.versionNumber,
      } satisfies PublicOfficialResultsDirectoryItem;
    })
    .filter((row): row is PublicOfficialResultsDirectoryItem => row !== null);
}

type PublicResultsSearchInput = {
  query?: string;
  bib?: string;
  seriesSlug?: string;
  editionSlug?: string;
  limit?: number;
};

export async function searchPublicOfficialResultEntries(
  input: PublicResultsSearchInput,
): Promise<PublicOfficialResultSearchItem[]> {
  'use cache: remote';
  safeCacheLife({ expire: 30 });
  safeCacheTag(resultsSearchTag());

  const query = input.query?.trim() ?? '';
  const bib = input.bib?.trim() ?? '';
  if (!query && !bib) return [];

  const safeLimit = Math.min(Math.max(input.limit ?? 60, 1), PUBLIC_RESULTS_SEARCH_LIMIT_MAX);

  const activePointers = await listActiveOfficialVersionPointers();
  if (activePointers.length === 0) return [];

  const activePointerByVersionId = new Map(
    activePointers.map((pointer) => [pointer.resultVersionId, pointer]),
  );
  const activeVersionIds = [...activePointerByVersionId.keys()];

  const predicates = [
    inArray(resultEntries.resultVersionId, activeVersionIds),
    or(eq(eventEditions.visibility, 'published'), eq(eventEditions.visibility, 'unlisted')),
    isNull(resultEntries.deletedAt),
    isNull(resultVersions.deletedAt),
    isNull(eventEditions.deletedAt),
    isNull(eventSeries.deletedAt),
    or(isNull(resultEntries.distanceId), isNull(eventDistances.deletedAt)),
  ];

  if (query) {
    predicates.push(ilike(resultEntries.runnerFullName, `%${query}%`));
  }

  if (bib) {
    predicates.push(ilike(resultEntries.bibNumber, `%${bib}%`));
  }

  if (input.seriesSlug) {
    predicates.push(eq(eventSeries.slug, input.seriesSlug));
  }

  if (input.editionSlug) {
    predicates.push(eq(eventEditions.slug, input.editionSlug));
  }

  const rows = await db
    .select({
      editionId: eventEditions.id,
      seriesSlug: eventSeries.slug,
      seriesName: eventSeries.name,
      editionSlug: eventEditions.slug,
      editionLabel: eventEditions.editionLabel,
      resultVersionId: resultEntries.resultVersionId,
      runnerFullName: resultEntries.runnerFullName,
      bibNumber: resultEntries.bibNumber,
      resultStatus: resultEntries.status,
      finishTimeMillis: resultEntries.finishTimeMillis,
      overallPlace: resultEntries.overallPlace,
      genderPlace: resultEntries.genderPlace,
      ageGroupPlace: resultEntries.ageGroupPlace,
      distanceLabel: eventDistances.label,
    })
    .from(resultEntries)
    .innerJoin(resultVersions, eq(resultEntries.resultVersionId, resultVersions.id))
    .innerJoin(eventEditions, eq(resultVersions.editionId, eventEditions.id))
    .innerJoin(eventSeries, eq(eventEditions.seriesId, eventSeries.id))
    .leftJoin(eventDistances, eq(resultEntries.distanceId, eventDistances.id))
    .where(and(...predicates))
    .orderBy(
      desc(eventEditions.startsAt),
      sql`${resultEntries.overallPlace} is null`,
      asc(resultEntries.overallPlace),
      asc(resultEntries.runnerFullName),
      asc(resultEntries.id),
    )
    .limit(safeLimit);

  return rows
    .map((row) => {
      const pointer = activePointerByVersionId.get(row.resultVersionId);
      if (!pointer) return null;

      return {
        editionId: row.editionId,
        seriesSlug: row.seriesSlug,
        seriesName: row.seriesName,
        editionSlug: row.editionSlug,
        editionLabel: row.editionLabel,
        runnerFullName: row.runnerFullName,
        bibNumber: row.bibNumber,
        resultStatus: row.resultStatus,
        finishTimeMillis: row.finishTimeMillis,
        overallPlace: row.overallPlace,
        genderPlace: row.genderPlace,
        ageGroupPlace: row.ageGroupPlace,
        distanceLabel: row.distanceLabel,
        activeVersionStatus: pointer.status,
        activeVersionNumber: pointer.versionNumber,
      } satisfies PublicOfficialResultSearchItem;
    })
    .filter((row): row is PublicOfficialResultSearchItem => row !== null);
}

export async function findUnclaimedResultClaimCandidates(
  input: FindUnclaimedResultClaimCandidatesInput,
): Promise<UnclaimedResultClaimCandidateRow[]> {
  const limit = Math.min(Math.max(input.limit, 1), CLAIM_CANDIDATE_QUERY_LIMIT_MAX);
  const searchTerms = buildClaimNameSearchTerms(input.runnerName, input.runnerNameTokens);

  if (searchTerms.length === 0) return [];

  const identityPredicate = or(
    ...searchTerms.map((term) => ilike(resultEntries.runnerFullName, `%${term}%`)),
  );

  const rows = await db
    .select({
      entryId: resultEntries.id,
      resultVersionId: resultEntries.resultVersionId,
      runnerFullName: resultEntries.runnerFullName,
      bibNumber: resultEntries.bibNumber,
      discipline: resultEntries.discipline,
      status: resultEntries.status,
      finishTimeMillis: resultEntries.finishTimeMillis,
      overallPlace: resultEntries.overallPlace,
      genderPlace: resultEntries.genderPlace,
      ageGroupPlace: resultEntries.ageGroupPlace,
      gender: resultEntries.gender,
      age: resultEntries.age,
      entryCreatedAt: resultEntries.createdAt,
      seriesName: eventSeries.name,
      seriesSlug: eventSeries.slug,
      editionId: eventEditions.id,
      editionLabel: eventEditions.editionLabel,
      editionSlug: eventEditions.slug,
      editionStartsAt: eventEditions.startsAt,
      editionCity: eventEditions.city,
      editionState: eventEditions.state,
      distanceLabel: eventDistances.label,
    })
    .from(resultEntries)
    .innerJoin(resultVersions, eq(resultEntries.resultVersionId, resultVersions.id))
    .innerJoin(eventEditions, eq(resultVersions.editionId, eventEditions.id))
    .innerJoin(eventSeries, eq(eventEditions.seriesId, eventSeries.id))
    .leftJoin(
      resultEntryClaims,
      and(
        eq(resultEntries.id, resultEntryClaims.resultEntryId),
        inArray(resultEntryClaims.status, ACTIVE_RESULT_CLAIM_STATUSES),
        isNull(resultEntryClaims.deletedAt),
      ),
    )
    .leftJoin(eventDistances, eq(resultEntries.distanceId, eventDistances.id))
    .where(
      and(
        isNull(resultEntries.deletedAt),
        isNull(resultVersions.deletedAt),
        isNull(eventEditions.deletedAt),
        isNull(eventSeries.deletedAt),
        isNull(eventDistances.deletedAt),
        isNull(resultEntryClaims.id),
        isNull(resultEntries.userId),
        inArray(resultVersions.status, CLAIM_CANDIDATE_QUERY_STATUSES),
        identityPredicate,
      ),
    )
    .orderBy(
      desc(eventEditions.startsAt),
      desc(resultEntries.createdAt),
      asc(resultEntries.id),
    )
    .limit(limit);

  return rows;
}

export async function findUnclaimedResultClaimCandidateByEntryId(
  input: FindUnclaimedResultClaimCandidateByEntryIdInput,
): Promise<UnclaimedResultClaimCandidateRow | null> {
  const searchTerms = buildClaimNameSearchTerms(input.runnerName, input.runnerNameTokens);
  if (searchTerms.length === 0) return null;

  const identityPredicate = or(
    ...searchTerms.map((term) => ilike(resultEntries.runnerFullName, `%${term}%`)),
  );

  const [candidate] = await db
    .select({
      entryId: resultEntries.id,
      resultVersionId: resultEntries.resultVersionId,
      runnerFullName: resultEntries.runnerFullName,
      bibNumber: resultEntries.bibNumber,
      discipline: resultEntries.discipline,
      status: resultEntries.status,
      finishTimeMillis: resultEntries.finishTimeMillis,
      overallPlace: resultEntries.overallPlace,
      genderPlace: resultEntries.genderPlace,
      ageGroupPlace: resultEntries.ageGroupPlace,
      gender: resultEntries.gender,
      age: resultEntries.age,
      entryCreatedAt: resultEntries.createdAt,
      seriesName: eventSeries.name,
      seriesSlug: eventSeries.slug,
      editionId: eventEditions.id,
      editionLabel: eventEditions.editionLabel,
      editionSlug: eventEditions.slug,
      editionStartsAt: eventEditions.startsAt,
      editionCity: eventEditions.city,
      editionState: eventEditions.state,
      distanceLabel: eventDistances.label,
    })
    .from(resultEntries)
    .innerJoin(resultVersions, eq(resultEntries.resultVersionId, resultVersions.id))
    .innerJoin(eventEditions, eq(resultVersions.editionId, eventEditions.id))
    .innerJoin(eventSeries, eq(eventEditions.seriesId, eventSeries.id))
    .leftJoin(
      resultEntryClaims,
      and(
        eq(resultEntries.id, resultEntryClaims.resultEntryId),
        inArray(resultEntryClaims.status, ACTIVE_RESULT_CLAIM_STATUSES),
        isNull(resultEntryClaims.deletedAt),
      ),
    )
    .leftJoin(eventDistances, eq(resultEntries.distanceId, eventDistances.id))
    .where(
      and(
        eq(resultEntries.id, input.entryId),
        isNull(resultEntries.deletedAt),
        isNull(resultVersions.deletedAt),
        isNull(eventEditions.deletedAt),
        isNull(eventSeries.deletedAt),
        isNull(eventDistances.deletedAt),
        isNull(resultEntryClaims.id),
        isNull(resultEntries.userId),
        inArray(resultVersions.status, CLAIM_CANDIDATE_QUERY_STATUSES),
        identityPredicate,
      ),
    )
    .limit(1);

  return candidate ?? null;
}

export async function listPendingResultClaimReviewsForEdition(
  editionId: string,
  limit = 100,
): Promise<PendingResultClaimReviewItem[]> {
  const safeLimit = Math.min(Math.max(limit, 1), CLAIM_REVIEW_QUERY_LIMIT_MAX);

  const rows = await db
    .select({
      claimId: resultEntryClaims.id,
      entryId: resultEntryClaims.resultEntryId,
      resultVersionId: resultEntries.resultVersionId,
      requestedByUserId: resultEntryClaims.requestedByUserId,
      confidenceBasisPoints: resultEntryClaims.confidenceBasisPoints,
      runnerFullName: resultEntries.runnerFullName,
      bibNumber: resultEntries.bibNumber,
      createdAt: resultEntryClaims.createdAt,
    })
    .from(resultEntryClaims)
    .innerJoin(resultEntries, eq(resultEntryClaims.resultEntryId, resultEntries.id))
    .innerJoin(resultVersions, eq(resultEntries.resultVersionId, resultVersions.id))
    .where(
      and(
        eq(resultVersions.editionId, editionId),
        eq(resultEntryClaims.status, 'pending_review'),
        isNull(resultEntryClaims.deletedAt),
        isNull(resultEntries.deletedAt),
        isNull(resultVersions.deletedAt),
      ),
    )
    .orderBy(asc(resultEntryClaims.createdAt))
    .limit(safeLimit);

  return rows.map((row) => ({
    claimId: row.claimId,
    entryId: row.entryId,
    resultVersionId: row.resultVersionId,
    requestedByUserId: row.requestedByUserId,
    confidenceScore: toClaimConfidenceScore(row.confidenceBasisPoints),
    runnerFullName: row.runnerFullName,
    bibNumber: row.bibNumber,
    createdAt: row.createdAt,
  }));
}

export async function listOrganizerCorrectionRequestsForEdition(
  editionId: string,
  limit = 100,
): Promise<OrganizerCorrectionRequestQueueItem[]> {
  const safeLimit = Math.min(Math.max(limit, 1), CORRECTION_REVIEW_QUERY_LIMIT_MAX);

  const rows = await db
    .select({
      requestId: resultCorrectionRequests.id,
      entryId: resultCorrectionRequests.resultEntryId,
      resultVersionId: resultCorrectionRequests.resultVersionId,
      resultVersionStatus: resultVersions.status,
      status: resultCorrectionRequests.status,
      reason: resultCorrectionRequests.reason,
      requestContext: resultCorrectionRequests.requestContext,
      requestedByUserId: resultCorrectionRequests.requestedByUserId,
      requestedAt: resultCorrectionRequests.requestedAt,
      reviewedByUserId: resultCorrectionRequests.reviewedByUserId,
      reviewedAt: resultCorrectionRequests.reviewedAt,
      reviewDecisionNote: resultCorrectionRequests.reviewDecisionNote,
      runnerFullName: resultEntries.runnerFullName,
      bibNumber: resultEntries.bibNumber,
      resultStatus: resultEntries.status,
      finishTimeMillis: resultEntries.finishTimeMillis,
    })
    .from(resultCorrectionRequests)
    .innerJoin(resultEntries, eq(resultCorrectionRequests.resultEntryId, resultEntries.id))
    .innerJoin(resultVersions, eq(resultCorrectionRequests.resultVersionId, resultVersions.id))
    .where(
      and(
        eq(resultVersions.editionId, editionId),
        isNull(resultCorrectionRequests.deletedAt),
        isNull(resultEntries.deletedAt),
        isNull(resultVersions.deletedAt),
      ),
    )
    .orderBy(
      sql`CASE WHEN ${resultCorrectionRequests.status} = 'pending' THEN 0 ELSE 1 END`,
      desc(resultCorrectionRequests.requestedAt),
      asc(resultCorrectionRequests.id),
    )
    .limit(safeLimit);

  return rows.map((row) => ({
    requestId: row.requestId,
    entryId: row.entryId,
    resultVersionId: row.resultVersionId,
    resultVersionStatus: row.resultVersionStatus,
    status: row.status as ResultCorrectionRequestStatus,
    reason: row.reason,
    requestContext: row.requestContext ?? {},
    requestedByUserId: row.requestedByUserId,
    requestedAt: row.requestedAt,
    reviewedByUserId: row.reviewedByUserId,
    reviewedAt: row.reviewedAt,
    reviewDecisionNote: row.reviewDecisionNote,
    runnerFullName: row.runnerFullName,
    bibNumber: row.bibNumber,
    resultStatus: row.resultStatus,
    finishTimeMillis: row.finishTimeMillis,
  }));
}

export async function listRecentPublicCorrectionSummaries(
  limit = 6,
): Promise<PublicCorrectionSummaryItem[]> {
  const safeLimit = Math.min(Math.max(limit, 1), PUBLIC_CORRECTION_SUMMARY_LIMIT_MAX);

  const rows = await db
    .select({
      requestId: resultCorrectionRequests.id,
      sourceResultVersionId: resultCorrectionRequests.resultVersionId,
      reason: resultCorrectionRequests.reason,
      requestContext: resultCorrectionRequests.requestContext,
      reviewedAt: resultCorrectionRequests.reviewedAt,
      reviewedByUserId: resultCorrectionRequests.reviewedByUserId,
      editionId: eventEditions.id,
      editionLabel: eventEditions.editionLabel,
      editionSlug: eventEditions.slug,
      seriesSlug: eventSeries.slug,
    })
    .from(resultCorrectionRequests)
    .innerJoin(resultVersions, eq(resultCorrectionRequests.resultVersionId, resultVersions.id))
    .innerJoin(eventEditions, eq(resultVersions.editionId, eventEditions.id))
    .innerJoin(eventSeries, eq(eventEditions.seriesId, eventSeries.id))
    .where(
      and(
        eq(resultCorrectionRequests.status, 'approved'),
        isNull(resultCorrectionRequests.deletedAt),
        isNull(resultVersions.deletedAt),
        isNull(eventEditions.deletedAt),
        isNull(eventSeries.deletedAt),
      ),
    )
    .orderBy(desc(resultCorrectionRequests.reviewedAt), desc(resultCorrectionRequests.requestedAt))
    .limit(safeLimit * 4);

  const publicationRows = rows
    .map((row) => {
      const context = toPublishedContext(
        isRecord(row.requestContext) ? row.requestContext.publication : null,
      );
      if (!context) return null;
      return {
        ...row,
        publication: context,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  const reviewerIds = [...new Set(
    publicationRows.map((row) => row.reviewedByUserId).filter((value): value is string => Boolean(value)),
  )];

  const reviewerRows =
    reviewerIds.length > 0
      ? await db.query.users.findMany({
          where: and(inArray(users.id, reviewerIds), isNull(users.deletedAt)),
          columns: {
            id: true,
            name: true,
            email: true,
          },
        })
      : [];

  const reviewerById = new Map(
    reviewerRows.map((row) => [row.id, row.name?.trim() || row.email]),
  );

  return publicationRows
    .map((row) => ({
      requestId: row.requestId,
      sourceResultVersionId: row.sourceResultVersionId,
      correctedResultVersionId: row.publication.correctedResultVersionId,
      editionId: row.editionId,
      editionLabel: row.editionLabel,
      editionSlug: row.editionSlug,
      seriesSlug: row.seriesSlug,
      reason: row.reason,
      changeSummary: toCorrectionPatchSummary(row.requestContext),
      approvedAt: row.publication.publishedAt ?? row.reviewedAt,
      approvedByUserId: row.reviewedByUserId,
      approvedByDisplayName: row.reviewedByUserId
        ? (reviewerById.get(row.reviewedByUserId) ?? null)
        : null,
    }))
    .sort((left, right) => {
      const leftTime = left.approvedAt?.getTime() ?? 0;
      const rightTime = right.approvedAt?.getTime() ?? 0;
      if (rightTime !== leftTime) return rightTime - leftTime;
      return left.requestId.localeCompare(right.requestId);
    })
    .slice(0, safeLimit);
}

export async function listCorrectionAuditTrailForEdition(
  editionId: string,
  limit = 100,
): Promise<CorrectionAuditTrailItem[]> {
  const safeLimit = Math.min(Math.max(limit, 1), CORRECTION_AUDIT_TRAIL_LIMIT_MAX);

  const rows = await db
    .select({
      requestId: resultCorrectionRequests.id,
      sourceResultVersionId: resultCorrectionRequests.resultVersionId,
      status: resultCorrectionRequests.status,
      reason: resultCorrectionRequests.reason,
      requestContext: resultCorrectionRequests.requestContext,
      requestedByUserId: resultCorrectionRequests.requestedByUserId,
      reviewedByUserId: resultCorrectionRequests.reviewedByUserId,
      requestedAt: resultCorrectionRequests.requestedAt,
      reviewedAt: resultCorrectionRequests.reviewedAt,
    })
    .from(resultCorrectionRequests)
    .innerJoin(resultVersions, eq(resultCorrectionRequests.resultVersionId, resultVersions.id))
    .where(
      and(
        eq(resultVersions.editionId, editionId),
        eq(resultCorrectionRequests.status, 'approved'),
        isNull(resultCorrectionRequests.deletedAt),
        isNull(resultVersions.deletedAt),
      ),
    )
    .orderBy(desc(resultCorrectionRequests.reviewedAt), desc(resultCorrectionRequests.requestedAt))
    .limit(safeLimit * 4);

  return rows
    .map((row) => {
      const publication = toPublishedContext(
        isRecord(row.requestContext) ? row.requestContext.publication : null,
      );
      if (!publication) return null;

      return {
        requestId: row.requestId,
        sourceResultVersionId: row.sourceResultVersionId,
        correctedResultVersionId: publication.correctedResultVersionId,
        status: row.status as ResultCorrectionRequestStatus,
        reason: row.reason,
        requestedByUserId: row.requestedByUserId,
        reviewedByUserId: row.reviewedByUserId,
        requestedAt: row.requestedAt,
        reviewedAt: row.reviewedAt,
        publishedAt: publication.publishedAt ?? row.reviewedAt,
      };
    })
    .filter((row): row is CorrectionAuditTrailItem => row !== null)
    .sort((left, right) => {
      const leftTime = left.publishedAt?.getTime() ?? 0;
      const rightTime = right.publishedAt?.getTime() ?? 0;
      if (rightTime !== leftTime) return rightTime - leftTime;
      return left.requestId.localeCompare(right.requestId);
    })
    .slice(0, safeLimit);
}

export async function getInternalResultsInvestigationViewData(params: {
  editionId: string;
  fromVersionId?: string | null;
  toVersionId?: string | null;
  versionLimit?: number;
  correctionLimit?: number;
}): Promise<InternalResultsInvestigationViewData> {
  const safeVersionLimit = Math.min(
    Math.max(params.versionLimit ?? 50, 1),
    INTERNAL_INVESTIGATION_VERSION_LIMIT_MAX,
  );
  const safeCorrectionLimit = Math.min(
    Math.max(params.correctionLimit ?? 60, 1),
    INTERNAL_INVESTIGATION_CORRECTION_LIMIT_MAX,
  );

  type InvestigationUserRow = {
    id: string;
    name: string | null;
    email: string;
  } | null;

  type InvestigationIngestionSessionRow = {
    id: string;
    sourceLane: InternalResultVersionInvestigationItem['ingestion']['sourceLane'];
    startedByUserId: string | null;
    sourceReference: string | null;
    sourceFileChecksum: string | null;
    provenanceJson: Record<string, unknown>;
    startedAt: Date;
    startedByUser?: InvestigationUserRow;
  } | null;

  type InvestigationVersionRow = {
    id: string;
    versionNumber: number;
    status: InternalResultVersionInvestigationItem['status'];
    source: InternalResultVersionInvestigationItem['source'];
    parentVersionId: string | null;
    createdAt: Date;
    finalizedAt: Date | null;
    createdByUserId: string | null;
    createdByUser?: InvestigationUserRow;
    finalizedByUserId: string | null;
    finalizedByUser?: InvestigationUserRow;
    sourceReference: string | null;
    sourceFileChecksum: string | null;
    provenanceJson: Record<string, unknown>;
    ingestionSession?: InvestigationIngestionSessionRow;
    editionId: string;
  };

  const toInvestigationVersion = (
    row: InvestigationVersionRow,
  ): InternalResultVersionInvestigationItem => ({
    id: row.id,
    versionNumber: row.versionNumber,
    status: row.status,
    source: row.source,
    parentVersionId: row.parentVersionId,
    createdAt: row.createdAt,
    finalizedAt: row.finalizedAt,
    createdByUserId: row.createdByUserId,
    createdByDisplayName: toUserDisplayName(row.createdByUser),
    finalizedByUserId: row.finalizedByUserId,
    finalizedByDisplayName: toUserDisplayName(row.finalizedByUser),
    sourceReference: row.sourceReference ?? null,
    sourceFileChecksum: row.sourceFileChecksum ?? null,
    provenanceJson: isRecord(row.provenanceJson) ? row.provenanceJson : {},
    ingestion: {
      sessionId: row.ingestionSession?.id ?? null,
      sourceLane: row.ingestionSession?.sourceLane ?? null,
      startedAt: row.ingestionSession?.startedAt ?? null,
      startedByUserId: row.ingestionSession?.startedByUserId ?? null,
      startedByDisplayName: toUserDisplayName(row.ingestionSession?.startedByUser),
      sourceReference: row.ingestionSession?.sourceReference ?? null,
      sourceFileChecksum: row.ingestionSession?.sourceFileChecksum ?? null,
      provenanceJson: isRecord(row.ingestionSession?.provenanceJson)
        ? row.ingestionSession.provenanceJson
        : {},
    },
  });

  const versionRows = await db.query.resultVersions.findMany({
    where: and(
      eq(resultVersions.editionId, params.editionId),
      isNull(resultVersions.deletedAt),
    ),
    columns: {
      id: true,
      editionId: true,
      status: true,
      source: true,
      versionNumber: true,
      parentVersionId: true,
      createdByUserId: true,
      finalizedByUserId: true,
      finalizedAt: true,
      sourceFileChecksum: true,
      sourceReference: true,
      provenanceJson: true,
      createdAt: true,
    },
    with: {
      createdByUser: {
        columns: {
          id: true,
          name: true,
          email: true,
        },
      },
      finalizedByUser: {
        columns: {
          id: true,
          name: true,
          email: true,
        },
      },
      ingestionSession: {
        columns: {
          id: true,
          sourceLane: true,
          startedByUserId: true,
          sourceReference: true,
          sourceFileChecksum: true,
          provenanceJson: true,
          startedAt: true,
        },
        with: {
          startedByUser: {
            columns: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
    },
    orderBy: [desc(resultVersions.versionNumber), desc(resultVersions.createdAt)],
    limit: safeVersionLimit,
  });

  const versionById = new Map<string, InternalResultVersionInvestigationItem>();
  for (const row of versionRows) {
    const mapped = toInvestigationVersion(row);
    versionById.set(mapped.id, mapped);
  }

  const correctionRows = await db.query.resultCorrectionRequests.findMany({
    where: and(
      eq(resultCorrectionRequests.status, 'approved'),
      isNull(resultCorrectionRequests.deletedAt),
    ),
    columns: {
      id: true,
      resultVersionId: true,
      reason: true,
      requestContext: true,
      requestedByUserId: true,
      reviewedByUserId: true,
      requestedAt: true,
      reviewedAt: true,
    },
    with: {
      resultVersion: {
        columns: {
          editionId: true,
          deletedAt: true,
        },
      },
      requestedByUser: {
        columns: {
          id: true,
          name: true,
          email: true,
        },
      },
      reviewedByUser: {
        columns: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: [
      desc(resultCorrectionRequests.reviewedAt),
      desc(resultCorrectionRequests.requestedAt),
    ],
    limit: safeCorrectionLimit * 4,
  });

  const corrections = correctionRows
    .map((row): InternalCorrectionTransitionInvestigationItem | null => {
      if (!row.resultVersion || row.resultVersion.deletedAt) return null;
      if (row.resultVersion.editionId !== params.editionId) return null;

      const publication = toPublishedContext(
        isRecord(row.requestContext) ? row.requestContext.publication : null,
      );
      if (!publication) return null;

      return {
        requestId: row.id,
        sourceResultVersionId: row.resultVersionId,
        correctedResultVersionId: publication.correctedResultVersionId,
        reason: row.reason,
        requestedAt: row.requestedAt,
        reviewedAt: row.reviewedAt,
        publishedAt: publication.publishedAt ?? row.reviewedAt,
        requestedByUserId: row.requestedByUserId,
        requestedByDisplayName: toUserDisplayName(row.requestedByUser),
        reviewedByUserId: row.reviewedByUserId,
        reviewedByDisplayName: toUserDisplayName(row.reviewedByUser),
      };
    })
    .filter((row): row is InternalCorrectionTransitionInvestigationItem => row !== null)
    .sort((left, right) => {
      const leftTime = left.publishedAt?.getTime() ?? 0;
      const rightTime = right.publishedAt?.getTime() ?? 0;
      if (rightTime !== leftTime) return rightTime - leftTime;
      return left.requestId.localeCompare(right.requestId);
    })
    .slice(0, safeCorrectionLimit);

  const missingVersionIds = [...new Set(
    corrections
      .flatMap((item) => [item.sourceResultVersionId, item.correctedResultVersionId])
      .filter((versionId) => !versionById.has(versionId)),
  )];

  if (missingVersionIds.length > 0) {
    const extraRows = await db.query.resultVersions.findMany({
      where: and(
        inArray(resultVersions.id, missingVersionIds),
        isNull(resultVersions.deletedAt),
      ),
      columns: {
        id: true,
        editionId: true,
        status: true,
        source: true,
        versionNumber: true,
        parentVersionId: true,
        createdByUserId: true,
        finalizedByUserId: true,
        finalizedAt: true,
        sourceFileChecksum: true,
        sourceReference: true,
        provenanceJson: true,
        createdAt: true,
      },
      with: {
        createdByUser: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
        finalizedByUser: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
        ingestionSession: {
          columns: {
            id: true,
            sourceLane: true,
            startedByUserId: true,
            sourceReference: true,
            sourceFileChecksum: true,
            provenanceJson: true,
            startedAt: true,
          },
          with: {
            startedByUser: {
              columns: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
      orderBy: [desc(resultVersions.versionNumber), desc(resultVersions.createdAt)],
      limit: missingVersionIds.length,
    });

    for (const row of extraRows) {
      if (row.editionId !== params.editionId) continue;
      const mapped = toInvestigationVersion(row);
      versionById.set(mapped.id, mapped);
    }
  }

  const versions = [...versionById.values()].sort((left, right) => {
    if (left.versionNumber !== right.versionNumber) {
      return right.versionNumber - left.versionNumber;
    }
    return right.createdAt.getTime() - left.createdAt.getTime();
  });

  const requestedFromVersionId = params.fromVersionId?.trim() || null;
  const requestedToVersionId = params.toVersionId?.trim() || null;

  const selectedCorrection =
    (requestedFromVersionId && requestedToVersionId
      ? corrections.find(
          (item) =>
            item.sourceResultVersionId === requestedFromVersionId &&
            item.correctedResultVersionId === requestedToVersionId,
        )
      : null) ?? corrections[0] ?? null;

  let selectedDiff: InternalResultVersionDiffSummary | null = null;

  if (selectedCorrection) {
    const sourceVersion = versionById.get(selectedCorrection.sourceResultVersionId) ?? null;
    const correctedVersion = versionById.get(selectedCorrection.correctedResultVersionId) ?? null;

    selectedDiff = {
      fromVersionId: selectedCorrection.sourceResultVersionId,
      toVersionId: selectedCorrection.correctedResultVersionId,
      fromVersionNumber: sourceVersion?.versionNumber ?? null,
      toVersionNumber: correctedVersion?.versionNumber ?? null,
      fromStatus: sourceVersion?.status ?? null,
      toStatus: correctedVersion?.status ?? null,
      fromSource: sourceVersion?.source ?? null,
      toSource: correctedVersion?.source ?? null,
      approverUserId: selectedCorrection.reviewedByUserId,
      approverDisplayName: selectedCorrection.reviewedByDisplayName,
      reviewedAt: selectedCorrection.reviewedAt,
      publishedAt: selectedCorrection.publishedAt,
      reason: selectedCorrection.reason,
    };
  }

  return {
    editionId: params.editionId,
    versions,
    corrections,
    selectedDiff,
  };
}

export async function listResultTrustAuditLogsForEdition(
  filters: ResultTrustAuditLogFilters,
): Promise<ResultTrustAuditLogItem[]> {
  const safeLimit = Math.min(
    Math.max(filters.limit ?? 60, 1),
    RESULTS_TRUST_AUDIT_LIMIT_MAX,
  );

  const predicates = [inArray(auditLogs.action, RESULTS_TRUST_AUDIT_ACTIONS)];
  if (filters.action) {
    predicates.push(eq(auditLogs.action, filters.action));
  }
  if (filters.createdFrom) {
    predicates.push(gte(auditLogs.createdAt, filters.createdFrom));
  }
  if (filters.createdTo) {
    predicates.push(lte(auditLogs.createdAt, filters.createdTo));
  }

  const rows = await db
    .select({
      id: auditLogs.id,
      organizationId: auditLogs.organizationId,
      actorUserId: auditLogs.actorUserId,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      beforeJson: auditLogs.beforeJson,
      afterJson: auditLogs.afterJson,
      createdAt: auditLogs.createdAt,
      actorName: users.name,
      actorEmail: users.email,
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.actorUserId, users.id))
    .where(and(...predicates))
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
    .limit(safeLimit * 4);

  return rows
    .map((row): ResultTrustAuditLogItem | null => {
      const editionId = extractEditionIdFromAuditPayload(row.beforeJson, row.afterJson);
      if (editionId !== filters.editionId) return null;

      const actorDisplayName = row.actorName?.trim() || row.actorEmail || null;
      const beforeJson = isRecord(row.beforeJson) ? row.beforeJson : null;
      const afterJson = isRecord(row.afterJson) ? row.afterJson : null;

      return {
        id: row.id,
        organizationId: row.organizationId,
        actorUserId: row.actorUserId,
        actorDisplayName,
        action: row.action as ResultTrustAuditAction,
        entityType: row.entityType,
        entityId: row.entityId,
        editionId,
        createdAt: row.createdAt,
        beforeJson,
        afterJson,
      };
    })
    .filter((row): row is ResultTrustAuditLogItem => row !== null)
    .slice(0, safeLimit);
}

export async function getCorrectionLifecycleMetrics(
  filters: CorrectionLifecycleMetricsFilters = {},
): Promise<CorrectionLifecycleMetrics> {
  const predicates = [
    isNull(resultCorrectionRequests.deletedAt),
    isNull(resultVersions.deletedAt),
    isNull(eventEditions.deletedAt),
    isNull(eventSeries.deletedAt),
  ];

  if (filters.editionId) {
    predicates.push(eq(resultVersions.editionId, filters.editionId));
  }

  if (filters.organizationId) {
    predicates.push(eq(eventSeries.organizationId, filters.organizationId));
  }

  if (filters.requestedFrom) {
    predicates.push(gte(resultCorrectionRequests.requestedAt, filters.requestedFrom));
  }

  if (filters.requestedTo) {
    predicates.push(lte(resultCorrectionRequests.requestedAt, filters.requestedTo));
  }

  const rows = await db
    .select({
      requestId: resultCorrectionRequests.id,
      status: resultCorrectionRequests.status,
      reason: resultCorrectionRequests.reason,
      requestedByUserId: resultCorrectionRequests.requestedByUserId,
      reviewedByUserId: resultCorrectionRequests.reviewedByUserId,
      requestedAt: resultCorrectionRequests.requestedAt,
      reviewedAt: resultCorrectionRequests.reviewedAt,
      editionId: resultVersions.editionId,
      editionLabel: eventEditions.editionLabel,
      organizationId: eventSeries.organizationId,
    })
    .from(resultCorrectionRequests)
    .innerJoin(resultVersions, eq(resultCorrectionRequests.resultVersionId, resultVersions.id))
    .innerJoin(eventEditions, eq(resultVersions.editionId, eventEditions.id))
    .innerJoin(eventSeries, eq(eventEditions.seriesId, eventSeries.id))
    .where(and(...predicates))
    .orderBy(desc(resultCorrectionRequests.requestedAt), asc(resultCorrectionRequests.id))
    .limit(CORRECTION_LIFECYCLE_EXPORT_LIMIT_MAX);

  const nowMillis = Date.now();
  const statusCounts: CorrectionLifecycleMetrics['statusCounts'] = {
    total: rows.length,
    pending: 0,
    approved: 0,
    rejected: 0,
  };

  const resolutionDurations: number[] = [];
  const pendingHighlights: CorrectionLifecycleAgingHighlightItem[] = [];
  const exportRows: CorrectionLifecycleExportRow[] = [];
  const pendingAgingBuckets: CorrectionLifecycleMetrics['pendingAging']['buckets'] = {
    lessThan24Hours: 0,
    oneToThreeDays: 0,
    threeToSevenDays: 0,
    moreThanSevenDays: 0,
  };

  let oldestPendingAgeHours: number | null = null;

  for (const row of rows) {
    const status = row.status as ResultCorrectionRequestStatus;
    if (status === 'pending') statusCounts.pending += 1;
    if (status === 'approved') statusCounts.approved += 1;
    if (status === 'rejected') statusCounts.rejected += 1;

    const requestedAtMillis = row.requestedAt.getTime();
    const reviewedAtMillis = row.reviewedAt?.getTime() ?? null;
    const resolutionMillis =
      reviewedAtMillis !== null ? Math.max(0, reviewedAtMillis - requestedAtMillis) : null;

    if (resolutionMillis !== null) {
      resolutionDurations.push(resolutionMillis);
    }

    const pendingAgeHours =
      status === 'pending'
        ? Math.max(0, (nowMillis - requestedAtMillis) / (60 * 60 * 1000))
        : null;

    if (pendingAgeHours !== null) {
      if (pendingAgeHours < 24) pendingAgingBuckets.lessThan24Hours += 1;
      else if (pendingAgeHours < 72) pendingAgingBuckets.oneToThreeDays += 1;
      else if (pendingAgeHours < 168) pendingAgingBuckets.threeToSevenDays += 1;
      else pendingAgingBuckets.moreThanSevenDays += 1;

      oldestPendingAgeHours =
        oldestPendingAgeHours === null
          ? pendingAgeHours
          : Math.max(oldestPendingAgeHours, pendingAgeHours);

      pendingHighlights.push({
        requestId: row.requestId,
        editionId: row.editionId,
        editionLabel: row.editionLabel,
        organizationId: row.organizationId,
        requestedByUserId: row.requestedByUserId,
        requestedAt: row.requestedAt,
        pendingAgeHours: Number(pendingAgeHours.toFixed(1)),
      });
    }

    exportRows.push({
      requestId: row.requestId,
      status,
      reason: row.reason,
      editionId: row.editionId,
      editionLabel: row.editionLabel,
      organizationId: row.organizationId,
      requestedByUserId: row.requestedByUserId,
      reviewedByUserId: row.reviewedByUserId,
      requestedAt: row.requestedAt,
      reviewedAt: row.reviewedAt,
      resolutionMillis,
      pendingAgeHours: pendingAgeHours !== null ? Number(pendingAgeHours.toFixed(1)) : null,
    });
  }

  const medianResolutionMillis = computeMedian(resolutionDurations);

  const agingHighlights = pendingHighlights
    .sort((left, right) => {
      if (right.pendingAgeHours !== left.pendingAgeHours) {
        return right.pendingAgeHours - left.pendingAgeHours;
      }
      return left.requestId.localeCompare(right.requestId);
    })
    .slice(0, CORRECTION_LIFECYCLE_AGING_HIGHLIGHT_LIMIT);

  return {
    generatedAt: new Date(),
    filters: {
      editionId: filters.editionId ?? null,
      organizationId: filters.organizationId ?? null,
      requestedFrom: filters.requestedFrom ?? null,
      requestedTo: filters.requestedTo ?? null,
    },
    statusCounts,
    medianResolutionMillis,
    medianResolutionHours:
      medianResolutionMillis !== null ? Number((medianResolutionMillis / (60 * 60 * 1000)).toFixed(2)) : null,
    pendingAging: {
      totalPending: statusCounts.pending,
      oldestPendingAgeHours:
        oldestPendingAgeHours !== null ? Number(oldestPendingAgeHours.toFixed(1)) : null,
      buckets: pendingAgingBuckets,
    },
    agingHighlights,
    exportRows,
  };
}

export async function getResultClaimResolutionTrace(
  entryId: string,
): Promise<ResultClaimResolutionTraceItem[]> {
  const rows = await db
    .select({
      claimId: resultEntryClaims.id,
      entryId: resultEntryClaims.resultEntryId,
      resultVersionId: resultEntries.resultVersionId,
      status: resultEntryClaims.status,
      requestedByUserId: resultEntryClaims.requestedByUserId,
      linkedUserId: resultEntryClaims.linkedUserId,
      reviewedByUserId: resultEntryClaims.reviewedByUserId,
      reviewedAt: resultEntryClaims.reviewedAt,
      reviewReason: resultEntryClaims.reviewReason,
      reviewContext: resultEntryClaims.reviewContext,
      updatedAt: resultEntryClaims.updatedAt,
    })
    .from(resultEntryClaims)
    .innerJoin(resultEntries, eq(resultEntryClaims.resultEntryId, resultEntries.id))
    .where(
      and(
        eq(resultEntryClaims.resultEntryId, entryId),
        inArray(resultEntryClaims.status, RESOLVED_RESULT_CLAIM_STATUSES),
        isNull(resultEntryClaims.deletedAt),
        isNull(resultEntries.deletedAt),
      ),
    )
    .orderBy(desc(resultEntryClaims.updatedAt));

  return rows.map((row) => ({
    claimId: row.claimId,
    entryId: row.entryId,
    resultVersionId: row.resultVersionId,
    status: row.status as Extract<typeof row.status, 'linked' | 'rejected'>,
    requestedByUserId: row.requestedByUserId,
    linkedUserId: row.linkedUserId,
    reviewedByUserId: row.reviewedByUserId,
    reviewedAt: row.reviewedAt,
    reviewReason: row.reviewReason,
    reviewContext: row.reviewContext ?? {},
    updatedAt: row.updatedAt,
  }));
}
