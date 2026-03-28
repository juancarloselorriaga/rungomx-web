import type {
  resultCorrectionRequests,
  resultEntries,
  resultEntryClaims,
  resultIngestionSessions,
  rankingRulesets,
  rankingSnapshotRows,
  rankingSnapshots,
  resultVersions,
} from '@/db/schema';
import type { ResultEntryStatus } from '@/lib/events/results/status';
export { RESULT_ENTRY_STATUSES } from '@/lib/events/results/status';
export type { ResultEntryStatus } from '@/lib/events/results/status';

export const RESULT_VERSION_STATUSES = ['draft', 'official', 'corrected'] as const;
export const RESULT_VERSION_SOURCES = ['manual_offline', 'csv_excel', 'correction'] as const;
export const RESULT_ENTRY_CLAIM_STATUSES = ['pending_review', 'linked', 'rejected'] as const;
export const RESULT_CORRECTION_REQUEST_STATUSES = ['pending', 'approved', 'rejected'] as const;
export const RESULT_INGESTION_SOURCE_LANES = ['manual_offline', 'csv_excel'] as const;
export const RANKING_RULESET_STATUSES = ['draft', 'active', 'retired'] as const;
export const RANKING_SNAPSHOT_SCOPES = ['national', 'organizer'] as const;
export const RANKING_SOURCE_EXCLUSION_REASONS = ['not_official', 'superseded'] as const;
export const RESULT_DISCIPLINES = [
  'trail_running',
  'triathlon',
  'cycling',
  'mtb',
  'gravel_bike',
  'duathlon',
  'backyard_ultra',
] as const;

export type ResultVersionStatus = (typeof RESULT_VERSION_STATUSES)[number];
export type ResultVersionSource = (typeof RESULT_VERSION_SOURCES)[number];
export type ResultEntryClaimStatus = (typeof RESULT_ENTRY_CLAIM_STATUSES)[number];
export type ResultCorrectionRequestStatus = (typeof RESULT_CORRECTION_REQUEST_STATUSES)[number];
export type ResultIngestionSourceLane = (typeof RESULT_INGESTION_SOURCE_LANES)[number];
export type RankingRulesetStatus = (typeof RANKING_RULESET_STATUSES)[number];
export type RankingSnapshotScope = (typeof RANKING_SNAPSHOT_SCOPES)[number];
export type RankingSourceExclusionReason = (typeof RANKING_SOURCE_EXCLUSION_REASONS)[number];
export type ResultDiscipline = (typeof RESULT_DISCIPLINES)[number];

export type ResultVersionRow = typeof resultVersions.$inferSelect;
export type ResultEntryRow = typeof resultEntries.$inferSelect;
export type ResultEntryClaimRow = typeof resultEntryClaims.$inferSelect;
export type ResultCorrectionRequestRow = typeof resultCorrectionRequests.$inferSelect;
export type ResultIngestionSessionRow = typeof resultIngestionSessions.$inferSelect;
export type RankingRulesetRow = typeof rankingRulesets.$inferSelect;
export type RankingSnapshotDbRow = typeof rankingSnapshots.$inferSelect;
export type RankingSnapshotRowDbRow = typeof rankingSnapshotRows.$inferSelect;

export type ResultVersionRecord = Pick<
  ResultVersionRow,
  | 'id'
  | 'editionId'
  | 'status'
  | 'source'
  | 'versionNumber'
  | 'parentVersionId'
  | 'createdByUserId'
  | 'finalizedByUserId'
  | 'finalizedAt'
  | 'sourceFileChecksum'
  | 'sourceReference'
  | 'provenanceJson'
  | 'createdAt'
  | 'updatedAt'
>;

export type ResultEntryRecord = Pick<
  ResultEntryRow,
  | 'id'
  | 'resultVersionId'
  | 'distanceId'
  | 'userId'
  | 'discipline'
  | 'runnerFullName'
  | 'bibNumber'
  | 'gender'
  | 'age'
  | 'status'
  | 'finishTimeMillis'
  | 'overallPlace'
  | 'genderPlace'
  | 'ageGroupPlace'
  | 'identitySnapshot'
  | 'rawSourceData'
  | 'createdAt'
  | 'updatedAt'
>;

export type ResultEntryClaimRecord = Pick<
  ResultEntryClaimRow,
  | 'id'
  | 'resultEntryId'
  | 'requestedByUserId'
  | 'linkedUserId'
  | 'reviewedByUserId'
  | 'reviewedAt'
  | 'status'
  | 'confidenceBasisPoints'
  | 'reviewReason'
  | 'reviewContext'
  | 'createdAt'
  | 'updatedAt'
>;

export type ResultCorrectionRequestRecord = Pick<
  ResultCorrectionRequestRow,
  | 'id'
  | 'resultEntryId'
  | 'resultVersionId'
  | 'requestedByUserId'
  | 'status'
  | 'reason'
  | 'requestContext'
  | 'requestedAt'
  | 'reviewedByUserId'
  | 'reviewedAt'
  | 'reviewDecisionNote'
  | 'createdAt'
  | 'updatedAt'
>;

export type ResultIngestionSessionRecord = Pick<
  ResultIngestionSessionRow,
  | 'id'
  | 'editionId'
  | 'resultVersionId'
  | 'sourceLane'
  | 'startedByUserId'
  | 'sourceReference'
  | 'sourceFileChecksum'
  | 'provenanceJson'
  | 'startedAt'
  | 'createdAt'
  | 'updatedAt'
>;

export type RankingRulesetRecord = Pick<
  RankingRulesetRow,
  | 'id'
  | 'versionTag'
  | 'status'
  | 'rulesDefinitionJson'
  | 'explainabilityReference'
  | 'activationStartsAt'
  | 'activationEndsAt'
  | 'publishedByUserId'
  | 'publishedAt'
  | 'createdAt'
  | 'updatedAt'
>;

export type RankingSnapshotRecord = Pick<
  RankingSnapshotDbRow,
  | 'id'
  | 'rulesetId'
  | 'scope'
  | 'organizationId'
  | 'sourceVersionIdsJson'
  | 'exclusionLogJson'
  | 'triggerResultVersionId'
  | 'isCurrent'
  | 'promotedAt'
  | 'rowCount'
  | 'generatedAt'
  | 'createdAt'
  | 'updatedAt'
>;

export type RankingSnapshotRowRecord = Pick<
  RankingSnapshotRowDbRow,
  | 'id'
  | 'snapshotId'
  | 'rank'
  | 'resultEntryId'
  | 'resultVersionId'
  | 'runnerFullName'
  | 'bibNumber'
  | 'discipline'
  | 'gender'
  | 'age'
  | 'finishTimeMillis'
  | 'metadataJson'
  | 'createdAt'
  | 'updatedAt'
>;

export type ResultEntryLookupInput = {
  resultVersionId: string;
  bibNumber?: string;
  runnerFullName?: string;
  limit?: number;
};

export type ResultClaimMatchSignal =
  | 'exact_name'
  | 'name_token_overlap'
  | 'gender_match'
  | 'strong_age_match'
  | 'age_match'
  | 'age_close'
  | 'bib_present'
  | 'timing_present'
  | 'placement_present'
  | 'distance_present';

export type ResultClaimConfidenceLabel = 'high' | 'medium';

export type ResultClaimCandidate = {
  entryId: string;
  resultVersionId: string;
  confidenceScore: number;
  confidenceLabel: ResultClaimConfidenceLabel;
  matchSignals: ResultClaimMatchSignal[];
  eventContext: {
    editionId: string;
    seriesName: string;
    seriesSlug: string;
    editionLabel: string;
    editionSlug: string;
    startsAt: Date | null;
    city: string | null;
    state: string | null;
  };
  resultContext: {
    discipline: ResultDiscipline;
    status: ResultEntryStatus;
    bibNumber: string | null;
    distanceLabel: string | null;
    finishTimeMillis: number | null;
    overallPlace: number | null;
    genderPlace: number | null;
    ageGroupPlace: number | null;
    gender: string | null;
    age: number | null;
  };
};

export type ResultClaimCandidateEmptyState = {
  title: string;
  description: string;
  nextSteps: readonly string[];
};

export type ResultClaimCandidateResponse = {
  candidates: ResultClaimCandidate[];
  emptyState: ResultClaimCandidateEmptyState | null;
};

export type ResultClaimSubmissionOutcome = 'linked' | 'pending_review';

export type ResultClaimSubmissionResponse = {
  claimId: string;
  entryId: string;
  resultVersionId: string;
  outcome: ResultClaimSubmissionOutcome;
  confidenceScore: number;
  message: string;
  nextSteps: readonly string[] | null;
};

export type ResultClaimReviewDecision = 'approve' | 'reject';

export type ResultClaimReviewResponse = {
  claimId: string;
  entryId: string;
  resultVersionId: string;
  status: ResultEntryClaimStatus;
  reviewedByUserId: string | null;
  reviewedAt: Date | null;
  reviewReason: string | null;
  reviewContext: Record<string, unknown>;
};

export type ResultCorrectionReviewDecision = 'approve' | 'reject';

export type ResultCorrectionRequestSubmissionResponse = {
  request: ResultCorrectionRequestRecord;
};

export type ResultCorrectionRequestReviewResponse = {
  request: ResultCorrectionRequestRecord;
};

export type ResultCorrectionPublicationResponse = {
  request: ResultCorrectionRequestRecord;
  resultVersion: ResultVersionRecord;
  sourceResultVersionId: string;
};

export type ResultIngestionSessionInitResponse = {
  resultVersion: ResultVersionRecord;
  session: ResultIngestionSessionRecord;
};

export type OrganizerCorrectionRequestQueueItem = {
  requestId: string;
  entryId: string;
  resultVersionId: string;
  resultVersionStatus: ResultVersionStatus;
  status: ResultCorrectionRequestStatus;
  reason: string;
  requestContext: Record<string, unknown>;
  requestedByUserId: string;
  requestedAt: Date;
  reviewedByUserId: string | null;
  reviewedAt: Date | null;
  reviewDecisionNote: string | null;
  runnerFullName: string;
  bibNumber: string | null;
  resultStatus: ResultEntryStatus;
  finishTimeMillis: number | null;
};

export type CorrectionChangeSummaryItem = {
  field: string;
  value: string;
};

export type PublicCorrectionSummaryItem = {
  requestId: string;
  sourceResultVersionId: string;
  correctedResultVersionId: string;
  editionId: string;
  editionLabel: string;
  editionSlug: string;
  seriesSlug: string;
  reason: string;
  changeSummary: CorrectionChangeSummaryItem[];
  approvedAt: Date | null;
  approvedByUserId: string | null;
  approvedByDisplayName: string | null;
};

export type PublicOfficialResultsEntryItem = {
  id: string;
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

export type PublicOfficialResultsEdition = {
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

export type PublicOfficialResultsVersion = {
  id: string;
  status: Extract<ResultVersionStatus, 'official' | 'corrected'>;
  versionNumber: number;
  finalizedAt: Date | null;
  updatedAt: Date;
};

export type PublicOfficialResultsPageData =
  | {
      state: 'not_found';
    }
  | {
      state: 'not_finalized';
      edition: PublicOfficialResultsEdition;
    }
  | {
      state: 'official';
      edition: PublicOfficialResultsEdition;
      activeVersion: PublicOfficialResultsVersion;
      entries: PublicOfficialResultsEntryItem[];
    };

export type PublicOfficialResultsDirectoryItem = {
  editionId: string;
  seriesSlug: string;
  seriesName: string;
  editionSlug: string;
  editionLabel: string;
  startsAt: Date | null;
  city: string | null;
  state: string | null;
  activeVersionStatus: Extract<ResultVersionStatus, 'official' | 'corrected'>;
  activeVersionNumber: number;
};

export type PublicOfficialResultSearchItem = {
  editionId: string;
  seriesSlug: string;
  seriesName: string;
  editionSlug: string;
  editionLabel: string;
  runnerFullName: string;
  bibNumber: string | null;
  resultStatus: ResultEntryStatus;
  finishTimeMillis: number | null;
  overallPlace: number | null;
  genderPlace: number | null;
  ageGroupPlace: number | null;
  distanceLabel: string | null;
  activeVersionStatus: Extract<ResultVersionStatus, 'official' | 'corrected'>;
  activeVersionNumber: number;
};

export type CorrectionAuditTrailItem = {
  requestId: string;
  sourceResultVersionId: string;
  correctedResultVersionId: string;
  status: ResultCorrectionRequestStatus;
  reason: string;
  requestedByUserId: string;
  reviewedByUserId: string | null;
  requestedAt: Date;
  reviewedAt: Date | null;
  publishedAt: Date | null;
};

export type InternalResultVersionInvestigationItem = {
  id: string;
  versionNumber: number;
  status: ResultVersionStatus;
  source: ResultVersionSource;
  parentVersionId: string | null;
  createdAt: Date;
  finalizedAt: Date | null;
  createdByUserId: string | null;
  createdByDisplayName: string | null;
  finalizedByUserId: string | null;
  finalizedByDisplayName: string | null;
  sourceReference: string | null;
  sourceFileChecksum: string | null;
  provenanceJson: Record<string, unknown>;
  ingestion: {
    sessionId: string | null;
    sourceLane: ResultIngestionSourceLane | null;
    startedAt: Date | null;
    startedByUserId: string | null;
    startedByDisplayName: string | null;
    sourceReference: string | null;
    sourceFileChecksum: string | null;
    provenanceJson: Record<string, unknown>;
  };
};

export type InternalCorrectionTransitionInvestigationItem = {
  requestId: string;
  sourceResultVersionId: string;
  correctedResultVersionId: string;
  reason: string;
  requestedAt: Date;
  reviewedAt: Date | null;
  publishedAt: Date | null;
  requestedByUserId: string;
  requestedByDisplayName: string | null;
  reviewedByUserId: string | null;
  reviewedByDisplayName: string | null;
};

export type InternalResultVersionDiffSummary = {
  fromVersionId: string;
  toVersionId: string;
  fromVersionNumber: number | null;
  toVersionNumber: number | null;
  fromStatus: ResultVersionStatus | null;
  toStatus: ResultVersionStatus | null;
  fromSource: ResultVersionSource | null;
  toSource: ResultVersionSource | null;
  approverUserId: string | null;
  approverDisplayName: string | null;
  reviewedAt: Date | null;
  publishedAt: Date | null;
  reason: string;
};

export type InternalResultsInvestigationViewData = {
  editionId: string;
  versions: InternalResultVersionInvestigationItem[];
  corrections: InternalCorrectionTransitionInvestigationItem[];
  selectedDiff: InternalResultVersionDiffSummary | null;
};

export type ResultTrustAuditAction =
  | 'results.ingestion.initialize'
  | 'results.version.finalize'
  | 'results.correction.review.approve'
  | 'results.correction.publish';

export type ResultTrustAuditLogItem = {
  id: string;
  organizationId: string | null;
  actorUserId: string;
  actorDisplayName: string | null;
  action: ResultTrustAuditAction;
  entityType: string;
  entityId: string;
  editionId: string | null;
  createdAt: Date;
  beforeJson: Record<string, unknown> | null;
  afterJson: Record<string, unknown> | null;
};

export type ResultTrustAuditLogFilters = {
  editionId: string;
  action?: ResultTrustAuditAction;
  createdFrom?: Date;
  createdTo?: Date;
  limit?: number;
};

export type CorrectionLifecycleMetricsFilters = {
  editionId?: string;
  organizationId?: string;
  requestedFrom?: Date;
  requestedTo?: Date;
};

export type CorrectionLifecycleStatusCounts = {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
};

export type CorrectionLifecyclePendingAgingBuckets = {
  lessThan24Hours: number;
  oneToThreeDays: number;
  threeToSevenDays: number;
  moreThanSevenDays: number;
};

export type CorrectionLifecycleAgingHighlightItem = {
  requestId: string;
  editionId: string;
  editionLabel: string;
  organizationId: string;
  requestedByUserId: string;
  requestedAt: Date;
  pendingAgeHours: number;
};

export type CorrectionLifecycleExportRow = {
  requestId: string;
  status: ResultCorrectionRequestStatus;
  reason: string;
  editionId: string;
  editionLabel: string;
  organizationId: string;
  requestedByUserId: string;
  reviewedByUserId: string | null;
  requestedAt: Date;
  reviewedAt: Date | null;
  resolutionMillis: number | null;
  pendingAgeHours: number | null;
};

export type CorrectionLifecycleMetrics = {
  generatedAt: Date;
  filters: {
    editionId: string | null;
    organizationId: string | null;
    requestedFrom: Date | null;
    requestedTo: Date | null;
  };
  statusCounts: CorrectionLifecycleStatusCounts;
  medianResolutionMillis: number | null;
  medianResolutionHours: number | null;
  pendingAging: {
    totalPending: number;
    oldestPendingAgeHours: number | null;
    buckets: CorrectionLifecyclePendingAgingBuckets;
  };
  agingHighlights: CorrectionLifecycleAgingHighlightItem[];
  exportRows: CorrectionLifecycleExportRow[];
};

export type PendingResultClaimReviewItem = {
  claimId: string;
  entryId: string;
  resultVersionId: string;
  requestedByUserId: string;
  confidenceScore: number;
  runnerFullName: string;
  bibNumber: string | null;
  createdAt: Date;
};

export type ResultClaimResolutionTraceItem = {
  claimId: string;
  entryId: string;
  resultVersionId: string;
  status: Extract<ResultEntryClaimStatus, 'linked' | 'rejected'>;
  requestedByUserId: string;
  linkedUserId: string | null;
  reviewedByUserId: string | null;
  reviewedAt: Date | null;
  reviewReason: string | null;
  reviewContext: Record<string, unknown>;
  updatedAt: Date;
};

export type ResultVersionFinalizationGateSummary = {
  rowCount: number;
  blockerCount: number;
  warningCount: number;
  canProceed: boolean;
};

export type ResultVersionFinalizationResponse = {
  resultVersion: ResultVersionRecord;
  gate: ResultVersionFinalizationGateSummary;
};

export type RankingSourceEligibilityState = 'eligible' | 'not_finalized';

export type RankingSourceEligibility = {
  editionId: string;
  state: RankingSourceEligibilityState;
  resultVersionId: string | null;
  resultVersionStatus: Extract<ResultVersionStatus, 'official' | 'corrected'> | null;
};
