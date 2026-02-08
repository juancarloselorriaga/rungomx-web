import type { AuthContext } from '@/lib/auth/server';

type AuthContextStub = Omit<Partial<AuthContext>, 'user' | 'profile' | 'permissions'> & {
  user?: Partial<NonNullable<AuthContext['user']>> | null;
  profile?: Partial<NonNullable<AuthContext['profile']>> | null;
  permissions?: Partial<AuthContext['permissions']>;
};

type InsertCall = { table: unknown; values: Record<string, unknown> };
type MutationReturningResult = unknown[] | { throw: unknown };

let mockAuthContext: AuthContextStub | null = null;

const mockCanUserAccessEvent = jest.fn();
const mockRequireOrgPermission = jest.fn();
const mockCheckEventsAccess = jest.fn();
const mockEventEditionsFindFirst = jest.fn();
const mockResultVersionsFindFirst = jest.fn();
const mockUsersFindFirst = jest.fn();
const mockEventDistancesFindFirst = jest.fn();
const mockResultEntriesFindFirst = jest.fn();
const mockResultEntriesFindMany = jest.fn();
const mockResultEntryClaimsFindFirst = jest.fn();
const mockResultCorrectionRequestsFindFirst = jest.fn();
const mockFindUnclaimedResultClaimCandidates = jest.fn();
const mockFindUnclaimedResultClaimCandidateByEntryId = jest.fn();
const mockUpdateReturning = jest.fn();
const mockUpdateSetCalls: Record<string, unknown>[] = [];
const mockInsertCalls: InsertCall[] = [];
const mockInsertReturningQueue: MutationReturningResult[] = [];
const mockUpdateReturningQueue: MutationReturningResult[] = [];
const mockCreateAuditLog = jest.fn();
const mockRevalidatePublicEventByEditionId = jest.fn();
const mockRevalidateTag = jest.fn();

const EDITION_ID = '11111111-1111-4111-8111-111111111111';
const DISTANCE_ID = '22222222-2222-4222-8222-222222222222';
const RESULT_VERSION_ID = '33333333-3333-4333-8333-333333333333';
const RESULT_ENTRY_ID = '44444444-4444-4444-8444-444444444444';
const ORGANIZER_ID = '55555555-5555-4555-8555-555555555555';
const OUTSIDER_ID = '66666666-6666-4666-8666-666666666666';
const MISSING_USER_ID = '77777777-7777-4777-8777-777777777777';
const LINKED_USER_ID = '88888888-8888-4888-8888-888888888888';
const OTHER_USER_ID = '99999999-9999-4999-8999-999999999999';
const RUNNER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

jest.mock('@/lib/auth/action-wrapper', () => ({
  withAuthenticatedUser: (options: { unauthenticated: () => unknown }) => {
    return (handler: (ctx: AuthContext, input: unknown) => Promise<unknown>) => {
      return async (input: unknown) => {
        if (!mockAuthContext) {
          return options.unauthenticated();
        }
        return handler(mockAuthContext as AuthContext, input);
      };
    };
  },
}));

jest.mock('@/lib/events/shared', () => ({
  checkEventsAccess: (...args: unknown[]) => mockCheckEventsAccess(...args),
  revalidatePublicEventByEditionId: (...args: unknown[]) =>
    mockRevalidatePublicEventByEditionId(...args),
}));

jest.mock('@/lib/audit', () => ({
  createAuditLog: (...args: unknown[]) => mockCreateAuditLog(...args),
}));

jest.mock('next/cache', () => ({
  revalidateTag: (...args: unknown[]) => mockRevalidateTag(...args),
}));

jest.mock('@/lib/events/results/queries', () => ({
  findUnclaimedResultClaimCandidates: (...args: unknown[]) =>
    mockFindUnclaimedResultClaimCandidates(...args),
  findUnclaimedResultClaimCandidateByEntryId: (...args: unknown[]) =>
    mockFindUnclaimedResultClaimCandidateByEntryId(...args),
}));

jest.mock('@/lib/organizations/permissions', () => ({
  canUserAccessEvent: (...args: unknown[]) => mockCanUserAccessEvent(...args),
  requireOrgPermission: (...args: unknown[]) => mockRequireOrgPermission(...args),
}));

jest.mock('@/db', () => ({
  db: (() => {
    const query = {
      eventEditions: {
        findFirst: (...args: unknown[]) => mockEventEditionsFindFirst(...args),
      },
      resultVersions: {
        findFirst: (...args: unknown[]) => mockResultVersionsFindFirst(...args),
      },
      users: {
        findFirst: (...args: unknown[]) => mockUsersFindFirst(...args),
      },
      eventDistances: {
        findFirst: (...args: unknown[]) => mockEventDistancesFindFirst(...args),
      },
      resultEntries: {
        findFirst: (...args: unknown[]) => mockResultEntriesFindFirst(...args),
        findMany: (...args: unknown[]) => mockResultEntriesFindMany(...args),
      },
      resultEntryClaims: {
        findFirst: (...args: unknown[]) => mockResultEntryClaimsFindFirst(...args),
      },
      resultCorrectionRequests: {
        findFirst: (...args: unknown[]) => mockResultCorrectionRequestsFindFirst(...args),
      },
    };

    const insert = (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        mockInsertCalls.push({ table, values });
        return {
          returning: async () => {
            const nextResult = mockInsertReturningQueue.shift();
            if (nextResult && typeof nextResult === 'object' && 'throw' in nextResult) {
              throw nextResult.throw;
            }
            return nextResult ?? [];
          },
        };
      },
    });

    const update = () => ({
      set: (values: Record<string, unknown>) => {
        mockUpdateSetCalls.push(values);
        return {
          where: () => ({
            returning: async () => {
              const nextResult = mockUpdateReturningQueue.shift();
              if (nextResult && typeof nextResult === 'object' && 'throw' in nextResult) {
                throw nextResult.throw;
              }
              if (nextResult !== undefined) {
                return nextResult;
              }
              return mockUpdateReturning();
            },
          }),
        };
      },
    });

    return {
      query,
      insert,
      update,
      transaction: async <T>(callback: (tx: { query: typeof query; insert: typeof insert; update: typeof update; rollback: () => never }) => Promise<T>) => {
        const tx = {
          query,
          insert,
          update,
          rollback: () => {
            throw new Error('Transaction rolled back');
          },
        };
        return callback(tx);
      },
    };
  })(),
}));

import * as schema from '@/db/schema';
import {
  confirmRunnerResultClaim,
  createResultDraftVersion,
  finalizeResultVersionAttestation,
  getRunnerResultClaimCandidates,
  initializeResultIngestionSession,
  linkDraftResultEntryToUser,
  publishApprovedCorrectionVersion,
  requestRunnerResultCorrection,
  reviewResultCorrectionRequest,
  reviewRunnerResultClaim,
  upsertDraftResultEntry,
} from '@/lib/events/results/actions';

function makeAuthContext(userId = ORGANIZER_ID): AuthContextStub {
  return {
    user: { id: userId, email: `${userId}@example.com`, emailVerified: true },
    permissions: {
      canManageEvents: false,
      canViewOrganizersDashboard: true,
    },
  };
}

function makeRunnerAuthContext(overrides: Partial<AuthContextStub> = {}): AuthContextStub {
  return {
    user: {
      id: RUNNER_ID,
      email: 'runner@example.com',
      emailVerified: true,
      name: 'Sofia Runner',
      ...overrides.user,
    },
    profile: {
      dateOfBirth: new Date('1994-05-19T00:00:00.000Z'),
      gender: 'female',
      ...(overrides.profile ?? {}),
    },
    permissions: {
      canManageEvents: false,
      canViewOrganizersDashboard: false,
      ...(overrides.permissions ?? {}),
    },
    ...overrides,
  };
}

function makeResultVersionRow(overrides: Partial<typeof schema.resultVersions.$inferSelect> = {}) {
  const now = new Date('2026-02-06T23:40:00.000Z');
  return {
    id: RESULT_VERSION_ID,
    editionId: EDITION_ID,
    status: 'draft',
    source: 'manual_offline',
    versionNumber: 1,
    parentVersionId: null,
    createdByUserId: ORGANIZER_ID,
    finalizedByUserId: null,
    finalizedAt: null,
    sourceFileChecksum: null,
    sourceReference: null,
    provenanceJson: {},
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

function makeResultEntryRow(overrides: Partial<typeof schema.resultEntries.$inferSelect> = {}) {
  const now = new Date('2026-02-06T23:41:00.000Z');
  return {
    id: RESULT_ENTRY_ID,
    resultVersionId: RESULT_VERSION_ID,
    distanceId: DISTANCE_ID,
    userId: null,
    discipline: 'trail_running',
    runnerFullName: 'Pat Runner',
    bibNumber: '42',
    gender: null,
    age: null,
    status: 'finish',
    finishTimeMillis: 3_600_000,
    overallPlace: null,
    genderPlace: null,
    ageGroupPlace: null,
    identitySnapshot: {},
    rawSourceData: {},
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

function makeResultEntryClaimRow(
  overrides: Partial<typeof schema.resultEntryClaims.$inferSelect> = {},
) {
  const now = new Date('2026-02-07T00:15:00.000Z');
  return {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    resultEntryId: RESULT_ENTRY_ID,
    requestedByUserId: RUNNER_ID,
    linkedUserId: null,
    reviewedByUserId: null,
    reviewedAt: null,
    status: 'pending_review',
    confidenceBasisPoints: 720,
    reviewReason: 'low_confidence_match',
    reviewContext: {},
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

function makeResultIngestionSessionRow(
  overrides: Partial<typeof schema.resultIngestionSessions.$inferSelect> = {},
) {
  const now = new Date('2026-02-07T00:20:00.000Z');
  return {
    id: '12121212-1212-4121-8121-121212121212',
    editionId: EDITION_ID,
    resultVersionId: RESULT_VERSION_ID,
    sourceLane: 'csv_excel',
    startedByUserId: ORGANIZER_ID,
    sourceReference: 'results.csv',
    sourceFileChecksum: 'sha256:abc123',
    provenanceJson: {},
    startedAt: now,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

function makeResultCorrectionRequestRow(
  overrides: Partial<typeof schema.resultCorrectionRequests.$inferSelect> = {},
) {
  const now = new Date('2026-02-07T04:10:00.000Z');
  return {
    id: 'abababab-1234-4aba-8aba-abababababab',
    resultEntryId: RESULT_ENTRY_ID,
    resultVersionId: RESULT_VERSION_ID,
    requestedByUserId: RUNNER_ID,
    status: 'pending',
    reason: 'Finish time mismatch',
    requestContext: {},
    requestedAt: now,
    reviewedByUserId: null,
    reviewedAt: null,
    reviewDecisionNote: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

function makeClaimCandidateRow(overrides: Record<string, unknown> = {}) {
  return {
    entryId: RESULT_ENTRY_ID,
    resultVersionId: RESULT_VERSION_ID,
    runnerFullName: 'Sofia Runner',
    bibNumber: '42',
    discipline: 'trail_running',
    status: 'finish',
    finishTimeMillis: 3_600_000,
    overallPlace: 25,
    genderPlace: 5,
    ageGroupPlace: 2,
    gender: 'female',
    age: 31,
    entryCreatedAt: new Date('2026-01-10T10:00:00.000Z'),
    seriesName: 'Ultra Valle',
    seriesSlug: 'ultra-valle',
    editionId: EDITION_ID,
    editionLabel: '2026',
    editionSlug: 'ultra-valle-2026',
    editionStartsAt: new Date('2026-01-05T06:00:00.000Z'),
    editionCity: 'Monterrey',
    editionState: 'Nuevo Leon',
    distanceLabel: '50K',
    ...overrides,
  };
}

describe('results identity model actions', () => {
  beforeEach(() => {
    mockAuthContext = null;

    mockCanUserAccessEvent.mockReset();
    mockRequireOrgPermission.mockReset();
    mockCheckEventsAccess.mockReset();
    mockEventEditionsFindFirst.mockReset();
    mockResultVersionsFindFirst.mockReset();
    mockUsersFindFirst.mockReset();
    mockEventDistancesFindFirst.mockReset();
    mockResultEntriesFindFirst.mockReset();
    mockResultEntriesFindMany.mockReset();
    mockResultEntryClaimsFindFirst.mockReset();
    mockResultCorrectionRequestsFindFirst.mockReset();
    mockFindUnclaimedResultClaimCandidates.mockReset();
    mockFindUnclaimedResultClaimCandidateByEntryId.mockReset();
    mockUpdateReturning.mockReset();
    mockCreateAuditLog.mockReset();
    mockRevalidatePublicEventByEditionId.mockReset();
    mockRevalidateTag.mockReset();
    mockUpdateSetCalls.length = 0;

    mockInsertCalls.length = 0;
    mockInsertReturningQueue.length = 0;
    mockUpdateReturningQueue.length = 0;

    mockCheckEventsAccess.mockReturnValue(null);
    mockCanUserAccessEvent.mockResolvedValue({ organizationId: 'org-1', role: 'editor' });
    mockRequireOrgPermission.mockImplementation(() => undefined);
    mockEventEditionsFindFirst.mockResolvedValue({ id: EDITION_ID });
    mockEventDistancesFindFirst.mockResolvedValue({ id: DISTANCE_ID });
    mockUsersFindFirst.mockResolvedValue({ id: LINKED_USER_ID });
    mockResultEntriesFindFirst.mockResolvedValue(null);
    mockResultEntriesFindMany.mockResolvedValue([]);
    mockResultEntryClaimsFindFirst.mockResolvedValue(null);
    mockResultCorrectionRequestsFindFirst.mockResolvedValue(null);
    mockFindUnclaimedResultClaimCandidateByEntryId.mockResolvedValue(null);
    mockCreateAuditLog.mockResolvedValue({ ok: true, auditLogId: 'audit-1' });
  });

  it('persists unclaimed result entries with required discipline data', async () => {
    mockAuthContext = makeAuthContext();
    mockResultVersionsFindFirst
      .mockResolvedValueOnce({ versionNumber: 0 })
      .mockResolvedValueOnce(makeResultVersionRow());

    mockInsertReturningQueue.push([makeResultVersionRow()], [makeResultEntryRow()]);

    const versionResult = await createResultDraftVersion({
      editionId: EDITION_ID,
      source: 'manual_offline',
    });
    expect(versionResult.ok).toBe(true);
    if (!versionResult.ok) {
      throw new Error('Expected version creation to succeed');
    }

    const entryResult = await upsertDraftResultEntry({
      resultVersionId: versionResult.data.id,
      distanceId: DISTANCE_ID,
      discipline: 'trail_running',
      runnerFullName: 'Pat Runner',
      bibNumber: '42',
      status: 'finish',
      finishTimeMillis: 3_600_000,
    });

    expect(entryResult.ok).toBe(true);
    if (!entryResult.ok) {
      throw new Error('Expected draft result entry creation to succeed');
    }

    expect(entryResult.data.userId).toBeNull();
    expect(entryResult.data.discipline).toBe('trail_running');
    expect(entryResult.data.runnerFullName).toBe('Pat Runner');

    expect(mockInsertCalls).toHaveLength(2);
    expect(mockInsertCalls[1]?.values).toMatchObject({
      userId: null,
      discipline: 'trail_running',
      runnerFullName: 'Pat Runner',
    });
    expect(mockInsertCalls.some((call) => call.table === schema.users)).toBe(false);
  });

  it('derives canonical placement fields server-side and ignores client-provided placement values', async () => {
    mockAuthContext = makeAuthContext();
    mockResultVersionsFindFirst.mockResolvedValueOnce(makeResultVersionRow());
    mockInsertReturningQueue.push([
      makeResultEntryRow({
        id: 'entry-new',
        runnerFullName: 'Pat Runner',
        bibNumber: '42',
        gender: 'female',
        age: 31,
        status: 'finish',
        finishTimeMillis: 3_600_000,
        overallPlace: null,
        genderPlace: null,
        ageGroupPlace: null,
      }),
    ]);
    mockResultEntriesFindMany.mockResolvedValueOnce([
      makeResultEntryRow({
        id: 'entry-fast',
        runnerFullName: 'Ana Fast',
        bibNumber: '12',
        gender: 'female',
        age: 31,
        status: 'finish',
        finishTimeMillis: 3_500_000,
        overallPlace: null,
        genderPlace: null,
        ageGroupPlace: null,
      }),
      makeResultEntryRow({
        id: 'entry-new',
        runnerFullName: 'Pat Runner',
        bibNumber: '42',
        gender: 'female',
        age: 31,
        status: 'finish',
        finishTimeMillis: 3_600_000,
        overallPlace: null,
        genderPlace: null,
        ageGroupPlace: null,
      }),
    ]);

    const result = await upsertDraftResultEntry({
      resultVersionId: RESULT_VERSION_ID,
      distanceId: DISTANCE_ID,
      discipline: 'trail_running',
      runnerFullName: 'Pat Runner',
      bibNumber: '42',
      gender: 'female',
      age: 31,
      status: 'finish',
      finishTimeMillis: 3_600_000,
      overallPlace: 99,
      genderPlace: 99,
      ageGroupPlace: 99,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('Expected draft result entry creation to succeed');
    }

    expect(result.data).toMatchObject({
      overallPlace: 2,
      genderPlace: 2,
      ageGroupPlace: 2,
    });
    expect(mockInsertCalls[0]?.values).toMatchObject({
      overallPlace: null,
      genderPlace: null,
      ageGroupPlace: null,
    });
  });

  it('returns validation errors when discipline is missing', async () => {
    mockAuthContext = makeAuthContext();
    mockResultVersionsFindFirst.mockResolvedValueOnce({ versionNumber: 0 });
    mockInsertReturningQueue.push([makeResultVersionRow()]);

    const versionResult = await createResultDraftVersion({
      editionId: EDITION_ID,
      source: 'manual_offline',
    });
    expect(versionResult.ok).toBe(true);
    if (!versionResult.ok) {
      throw new Error('Expected version creation to succeed');
    }

    const result = await upsertDraftResultEntry({
      resultVersionId: versionResult.data.id,
      distanceId: DISTANCE_ID,
      runnerFullName: 'Missing Discipline',
      status: 'finish',
    } as unknown as Parameters<typeof upsertDraftResultEntry>[0]);

    expect(result).toMatchObject({
      ok: false,
      code: 'VALIDATION_ERROR',
    });
    expect(mockInsertCalls).toHaveLength(1);
  });

  it('initializes ingestion session by creating a draft version and provenance session', async () => {
    mockAuthContext = makeAuthContext();
    mockResultVersionsFindFirst.mockResolvedValueOnce({
      id: 'abababab-abab-4aba-8aba-abababababab',
      versionNumber: 2,
    });
    mockInsertReturningQueue.push(
      [
        makeResultVersionRow({
          id: RESULT_VERSION_ID,
          versionNumber: 3,
          parentVersionId: 'abababab-abab-4aba-8aba-abababababab',
          source: 'csv_excel',
        }),
      ],
      [
        makeResultIngestionSessionRow({
          resultVersionId: RESULT_VERSION_ID,
          sourceLane: 'csv_excel',
          sourceReference: 'results.csv',
          sourceFileChecksum: 'sha256:file',
        }),
      ],
    );

    const result = await initializeResultIngestionSession({
      editionId: EDITION_ID,
      sourceLane: 'csv_excel',
      sourceReference: 'results.csv',
      sourceFileChecksum: 'sha256:file',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('Expected ingestion session initialization to succeed');
    }

    expect(result.data.resultVersion).toMatchObject({
      id: RESULT_VERSION_ID,
      editionId: EDITION_ID,
      source: 'csv_excel',
      versionNumber: 3,
    });
    expect(result.data.session).toMatchObject({
      resultVersionId: RESULT_VERSION_ID,
      sourceLane: 'csv_excel',
      sourceReference: 'results.csv',
      sourceFileChecksum: 'sha256:file',
    });
    expect(mockInsertCalls).toHaveLength(2);
    expect(mockInsertCalls[0]?.table).toBe(schema.resultVersions);
    expect(mockInsertCalls[1]?.table).toBe(schema.resultIngestionSessions);
    expect(mockInsertCalls[0]?.values).toMatchObject({
      editionId: EDITION_ID,
      source: 'csv_excel',
      versionNumber: 3,
      parentVersionId: 'abababab-abab-4aba-8aba-abababababab',
      createdByUserId: ORGANIZER_ID,
    });
    expect(mockInsertCalls[1]?.values).toMatchObject({
      editionId: EDITION_ID,
      resultVersionId: RESULT_VERSION_ID,
      sourceLane: 'csv_excel',
      startedByUserId: ORGANIZER_ID,
    });
    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'results.ingestion.initialize',
        actorUserId: ORGANIZER_ID,
        entityType: 'result_ingestion_session',
        entityId: '12121212-1212-4121-8121-121212121212',
      }),
      expect.any(Object),
    );
  });

  it('creates a new draft version reference on re-ingestion without mutating prior history', async () => {
    mockAuthContext = makeAuthContext();
    mockResultVersionsFindFirst.mockResolvedValueOnce({
      id: 'dededede-dede-4ded-8ded-dededededede',
      versionNumber: 7,
    });
    mockInsertReturningQueue.push(
      [
        makeResultVersionRow({
          id: RESULT_VERSION_ID,
          versionNumber: 8,
          parentVersionId: 'dededede-dede-4ded-8ded-dededededede',
          source: 'manual_offline',
        }),
      ],
      [
        makeResultIngestionSessionRow({
          sourceLane: 'manual_offline',
          resultVersionId: RESULT_VERSION_ID,
        }),
      ],
    );

    const result = await initializeResultIngestionSession({
      editionId: EDITION_ID,
      sourceLane: 'manual_offline',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('Expected re-ingestion initialization to succeed');
    }

    expect(result.data.resultVersion.versionNumber).toBe(8);
    expect(mockInsertCalls[0]?.values).toMatchObject({
      versionNumber: 8,
      parentVersionId: 'dededede-dede-4ded-8ded-dededededede',
    });
  });

  it('blocks unauthorized and unauthenticated ingestion session initialization', async () => {
    const unauthenticated = await initializeResultIngestionSession({
      editionId: EDITION_ID,
      sourceLane: 'csv_excel',
    });
    expect(unauthenticated).toEqual({
      ok: false,
      error: 'Authentication required',
      code: 'UNAUTHENTICATED',
    });

    mockAuthContext = makeAuthContext(OUTSIDER_ID);
    mockCanUserAccessEvent.mockResolvedValueOnce(null);
    mockRequireOrgPermission.mockImplementationOnce(() => {
      throw new Error('Permission denied');
    });

    const forbidden = await initializeResultIngestionSession({
      editionId: EDITION_ID,
      sourceLane: 'csv_excel',
    });

    expect(forbidden).toEqual({
      ok: false,
      error: 'Permission denied',
      code: 'FORBIDDEN',
    });
    expect(mockInsertCalls).toHaveLength(0);
  });

  it('blocks unauthorized and unauthenticated write attempts', async () => {
    const unauthenticated = await createResultDraftVersion({
      editionId: EDITION_ID,
      source: 'manual_offline',
    });
    expect(unauthenticated).toEqual({
      ok: false,
      error: 'Authentication required',
      code: 'UNAUTHENTICATED',
    });

    mockAuthContext = makeAuthContext(OUTSIDER_ID);
    mockCanUserAccessEvent.mockResolvedValueOnce(null);
    mockRequireOrgPermission.mockImplementationOnce(() => {
      throw new Error('Permission denied');
    });

    const forbidden = await createResultDraftVersion({
      editionId: EDITION_ID,
      source: 'manual_offline',
    });
    expect(forbidden).toEqual({
      ok: false,
      error: 'Permission denied',
      code: 'FORBIDDEN',
    });

    mockResultVersionsFindFirst.mockResolvedValueOnce(makeResultVersionRow());
    mockRequireOrgPermission.mockImplementationOnce(() => {
      throw new Error('Permission denied');
    });

    const forbiddenModify = await upsertDraftResultEntry({
      entryId: RESULT_ENTRY_ID,
      resultVersionId: RESULT_VERSION_ID,
      distanceId: DISTANCE_ID,
      discipline: 'trail_running',
      runnerFullName: 'Forbidden Update',
      status: 'finish',
    });

    expect(forbiddenModify).toEqual({
      ok: false,
      error: 'Permission denied',
      code: 'FORBIDDEN',
    });

    mockResultVersionsFindFirst.mockResolvedValueOnce(makeResultVersionRow());
    mockRequireOrgPermission.mockImplementationOnce(() => {
      throw new Error('Permission denied');
    });

    const forbiddenLink = await linkDraftResultEntryToUser({
      resultVersionId: RESULT_VERSION_ID,
      entryId: RESULT_ENTRY_ID,
      userId: LINKED_USER_ID,
    });

    expect(forbiddenLink).toEqual({
      ok: false,
      error: 'Permission denied',
      code: 'FORBIDDEN',
    });
  });

  it('finalizes the latest draft version with attestation provenance and targeted cache invalidation', async () => {
    mockAuthContext = makeAuthContext();
    const finalizedAt = new Date('2026-02-07T02:00:00.000Z');
    const draftVersion = makeResultVersionRow({
      id: RESULT_VERSION_ID,
      status: 'draft',
      source: 'csv_excel',
      versionNumber: 8,
      provenanceJson: {},
    });
    const finalizedVersion = makeResultVersionRow({
      id: RESULT_VERSION_ID,
      status: 'official',
      source: 'csv_excel',
      versionNumber: 8,
      finalizedByUserId: ORGANIZER_ID,
      finalizedAt,
      provenanceJson: {
        lifecycle: {
          from: 'draft',
          to: 'official',
          finalizedByUserId: ORGANIZER_ID,
          finalizedAt: finalizedAt.toISOString(),
          transitionReason: 'attestation',
        },
        attestation: {
          confirmed: true,
          attestedByUserId: ORGANIZER_ID,
          attestedAt: finalizedAt.toISOString(),
          sourceLane: 'csv_excel',
          note: 'Ready to publish',
        },
      },
    });

    mockResultVersionsFindFirst
      .mockResolvedValueOnce(draftVersion)
      .mockResolvedValueOnce(draftVersion);
    mockResultEntriesFindMany.mockResolvedValueOnce([
      {
        status: 'finish',
        finishTimeMillis: 3_700_000,
        rawSourceData: { syncStatus: 'synced' },
      },
    ]);
    mockUpdateReturningQueue.push([finalizedVersion]);
    mockEventEditionsFindFirst.mockResolvedValueOnce({
      id: EDITION_ID,
      series: {
        organizationId: 'org-123',
      },
    });

    const result = await finalizeResultVersionAttestation({
      editionId: EDITION_ID,
      attestationConfirmed: true,
      attestationNote: 'Ready to publish',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('Expected finalization to succeed');
    }

    expect(result.data.resultVersion.status).toBe('official');
    expect(result.data.gate).toEqual({
      rowCount: 1,
      blockerCount: 0,
      warningCount: 0,
      canProceed: true,
    });
    expect(mockRevalidateTag).toHaveBeenCalledWith(`results:edition:${EDITION_ID}`, { expire: 0 });
    expect(mockRevalidateTag).toHaveBeenCalledWith(`results:official:${EDITION_ID}`, { expire: 0 });
    expect(mockRevalidateTag).toHaveBeenCalledWith('rankings:national', { expire: 0 });
    expect(mockRevalidateTag).toHaveBeenCalledWith('rankings:ruleset:current', { expire: 0 });
    expect(mockRevalidateTag).toHaveBeenCalledWith('rankings:organizer:org-123', { expire: 0 });
    expect(mockRevalidatePublicEventByEditionId).toHaveBeenCalledWith(EDITION_ID);
    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'results.version.finalize',
        actorUserId: ORGANIZER_ID,
        entityType: 'result_version',
        entityId: RESULT_VERSION_ID,
      }),
    );
  });

  it('blocks finalization when review gate blockers still exist', async () => {
    mockAuthContext = makeAuthContext();
    const draftVersion = makeResultVersionRow({
      id: RESULT_VERSION_ID,
      status: 'draft',
      source: 'manual_offline',
      versionNumber: 9,
    });

    mockResultVersionsFindFirst.mockResolvedValueOnce(draftVersion);
    mockResultEntriesFindMany.mockResolvedValueOnce([
      {
        status: 'finish',
        finishTimeMillis: null,
        rawSourceData: { syncStatus: 'conflict' },
      },
    ]);

    const result = await finalizeResultVersionAttestation({
      editionId: EDITION_ID,
      attestationConfirmed: true,
    });

    expect(result).toEqual({
      ok: false,
      error: 'Draft review gate failed. Resolve blockers before publishing official results.',
      code: 'VALIDATION_ERROR',
    });
    expect(mockUpdateSetCalls).toHaveLength(0);
    expect(mockRevalidateTag).toHaveBeenCalledTimes(0);
  });

  it('blocks in-place official/corrected mutations with correction-workflow guidance', async () => {
    mockAuthContext = makeAuthContext();

    mockResultVersionsFindFirst.mockResolvedValueOnce(
      makeResultVersionRow({ status: 'official' }),
    );

    const mutationResult = await upsertDraftResultEntry({
      resultVersionId: RESULT_VERSION_ID,
      distanceId: DISTANCE_ID,
      discipline: 'trail_running',
      runnerFullName: 'Immutable Runner',
      status: 'finish',
      finishTimeMillis: 3_400_000,
    });

    expect(mutationResult).toEqual({
      ok: false,
      error:
        'Official versions are immutable. Publish a correction version instead of editing this version in place.',
      code: 'INVALID_STATE',
    });

    mockResultVersionsFindFirst.mockResolvedValueOnce(
      makeResultVersionRow({ status: 'corrected' }),
    );

    const linkResult = await linkDraftResultEntryToUser({
      resultVersionId: RESULT_VERSION_ID,
      entryId: RESULT_ENTRY_ID,
      userId: LINKED_USER_ID,
    });

    expect(linkResult).toEqual({
      ok: false,
      error:
        'Official versions are immutable. Use the correction-version workflow to adjust linked identities.',
      code: 'INVALID_STATE',
    });
  });

  it('rejects linking to a non-existent user record', async () => {
    mockAuthContext = makeAuthContext();
    mockResultVersionsFindFirst
      .mockResolvedValueOnce({ versionNumber: 0 })
      .mockResolvedValueOnce(makeResultVersionRow());
    mockUsersFindFirst.mockResolvedValueOnce(null);
    mockInsertReturningQueue.push([makeResultVersionRow()]);

    const versionResult = await createResultDraftVersion({
      editionId: EDITION_ID,
      source: 'csv_excel',
    });
    expect(versionResult.ok).toBe(true);
    if (!versionResult.ok) {
      throw new Error('Expected version creation to succeed');
    }

    const result = await upsertDraftResultEntry({
      resultVersionId: versionResult.data.id,
      distanceId: DISTANCE_ID,
      discipline: 'trail_running',
      runnerFullName: 'Linked Runner',
      userId: MISSING_USER_ID,
      status: 'finish',
    });

    expect(result).toEqual({
      ok: false,
      error: 'Linked user not found',
      code: 'VALIDATION_ERROR',
    });
    expect(mockInsertCalls).toHaveLength(1);
  });

  it('retries draft version creation on version-number conflicts', async () => {
    mockAuthContext = makeAuthContext();
    mockResultVersionsFindFirst
      .mockResolvedValueOnce({ versionNumber: 0 })
      .mockResolvedValueOnce({ versionNumber: 1 });
    mockInsertReturningQueue.push(
      { throw: { code: '23505', constraint: 'result_versions_edition_version_idx' } },
      [makeResultVersionRow({ id: '88888888-8888-4888-8888-888888888888', versionNumber: 2 })],
    );

    const result = await createResultDraftVersion({
      editionId: EDITION_ID,
      source: 'manual_offline',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('Expected retry path to create draft version');
    }

    expect(result.data.versionNumber).toBe(2);
    expect(mockInsertCalls).toHaveLength(2);
    expect(mockInsertCalls[0]?.values.versionNumber).toBe(1);
    expect(mockInsertCalls[1]?.values.versionNumber).toBe(2);
  });

  it('returns a conflict when a duplicate draft identity is inserted', async () => {
    mockAuthContext = makeAuthContext();
    mockResultVersionsFindFirst.mockResolvedValueOnce(makeResultVersionRow());
    mockInsertReturningQueue.push({
      throw: { code: '23505', constraint: 'result_entries_version_bib_unique_idx' },
    });

    const result = await upsertDraftResultEntry({
      resultVersionId: RESULT_VERSION_ID,
      distanceId: DISTANCE_ID,
      discipline: 'trail_running',
      runnerFullName: 'Duplicate Runner',
      bibNumber: '99',
      status: 'finish',
    });

    expect(result).toEqual({
      ok: false,
      error: 'A draft entry with the same identity already exists in this version',
      code: 'CONFLICT',
    });
  });

  it('links an unclaimed draft entry to an existing user and preserves identity snapshot', async () => {
    mockAuthContext = makeAuthContext();
    const identitySnapshot = { source: 'manual_capture', runner: 'Pat Runner', bib: '42' };

    mockResultVersionsFindFirst.mockResolvedValueOnce(makeResultVersionRow());
    mockResultEntriesFindFirst.mockResolvedValueOnce(
      makeResultEntryRow({ userId: null, identitySnapshot }),
    );
    mockUsersFindFirst.mockResolvedValueOnce({ id: LINKED_USER_ID });
    mockUpdateReturningQueue.push([makeResultEntryRow({ userId: LINKED_USER_ID, identitySnapshot })]);

    const result = await linkDraftResultEntryToUser({
      resultVersionId: RESULT_VERSION_ID,
      entryId: RESULT_ENTRY_ID,
      userId: LINKED_USER_ID,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('Expected linking action to succeed');
    }

    expect(result.data.userId).toBe(LINKED_USER_ID);
    expect(result.data.identitySnapshot).toEqual(identitySnapshot);
  });

  it('returns a conflict for link reassignment to a different user', async () => {
    mockAuthContext = makeAuthContext();
    mockResultVersionsFindFirst.mockResolvedValueOnce(makeResultVersionRow());
    mockResultEntriesFindFirst.mockResolvedValueOnce(makeResultEntryRow({ userId: LINKED_USER_ID }));

    const result = await linkDraftResultEntryToUser({
      resultVersionId: RESULT_VERSION_ID,
      entryId: RESULT_ENTRY_ID,
      userId: OTHER_USER_ID,
    });

    expect(result).toEqual({
      ok: false,
      error:
        'Result entry is already linked to a different user. Resolve conflict before reassigning.',
      code: 'CONFLICT',
    });
  });

  it('returns idempotent success when linking to the same user', async () => {
    mockAuthContext = makeAuthContext();
    mockResultVersionsFindFirst.mockResolvedValueOnce(makeResultVersionRow());
    mockResultEntriesFindFirst
      .mockResolvedValueOnce(makeResultEntryRow({ userId: LINKED_USER_ID }))
      .mockResolvedValueOnce(makeResultEntryRow({ userId: LINKED_USER_ID }));

    const result = await linkDraftResultEntryToUser({
      resultVersionId: RESULT_VERSION_ID,
      entryId: RESULT_ENTRY_ID,
      userId: LINKED_USER_ID,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('Expected idempotent linking action to succeed');
    }
    expect(result.data.userId).toBe(LINKED_USER_ID);
    expect(mockUpdateReturning).not.toHaveBeenCalled();
  });

  it('returns validation error when linking to a missing user', async () => {
    mockAuthContext = makeAuthContext();
    mockResultVersionsFindFirst.mockResolvedValueOnce(makeResultVersionRow());
    mockResultEntriesFindFirst.mockResolvedValueOnce(makeResultEntryRow({ userId: null }));
    mockUsersFindFirst.mockResolvedValueOnce(null);

    const result = await linkDraftResultEntryToUser({
      resultVersionId: RESULT_VERSION_ID,
      entryId: RESULT_ENTRY_ID,
      userId: LINKED_USER_ID,
    });

    expect(result).toEqual({
      ok: false,
      error: 'Linked user not found',
      code: 'VALIDATION_ERROR',
    });
  });

  it('returns conflict when concurrent link races with a different user assignment', async () => {
    mockAuthContext = makeAuthContext();
    mockResultVersionsFindFirst.mockResolvedValueOnce(makeResultVersionRow());
    mockResultEntriesFindFirst
      .mockResolvedValueOnce(makeResultEntryRow({ userId: null }))
      .mockResolvedValueOnce(makeResultEntryRow({ userId: OTHER_USER_ID }));
    mockUsersFindFirst.mockResolvedValueOnce({ id: LINKED_USER_ID });
    mockUpdateReturningQueue.push([]);

    const result = await linkDraftResultEntryToUser({
      resultVersionId: RESULT_VERSION_ID,
      entryId: RESULT_ENTRY_ID,
      userId: LINKED_USER_ID,
    });

    expect(result).toEqual({
      ok: false,
      error:
        'Result entry is already linked to a different user. Resolve conflict before reassigning.',
      code: 'CONFLICT',
    });
  });

  it('returns ranked safe claim candidates with event and timing/category context', async () => {
    mockAuthContext = makeRunnerAuthContext();
    mockFindUnclaimedResultClaimCandidates.mockResolvedValueOnce([
      makeClaimCandidateRow({
        entryId: 'a9f0e9f4-9d9b-4a53-8db3-d48b6a7a11a0',
        runnerFullName: 'Sofia Runner',
        bibNumber: '42',
        gender: 'female',
        age: 31,
      }),
      makeClaimCandidateRow({
        entryId: '198f4cfd-90e4-4b3f-9d66-bf044701e6bb',
        runnerFullName: 'Sofia Runner',
        bibNumber: null,
        gender: null,
        age: null,
      }),
      makeClaimCandidateRow({
        entryId: '53b8e24d-42b7-44f1-bc3a-6d315f8edcbe',
        runnerFullName: 'Sofia Runner',
        bibNumber: null,
        gender: 'male',
        age: 44,
      }),
    ]);

    const result = await getRunnerResultClaimCandidates({ limit: 2, minimumConfidence: 0.65 });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('Expected claim candidate search to succeed');
    }

    expect(mockFindUnclaimedResultClaimCandidates).toHaveBeenCalledWith(
      expect.objectContaining({
        runnerName: 'Sofia Runner',
        limit: 8,
      }),
    );

    expect(result.data.emptyState).toBeNull();
    expect(result.data.candidates).toHaveLength(2);
    expect(result.data.candidates[0].confidenceScore).toBeGreaterThanOrEqual(
      result.data.candidates[1].confidenceScore,
    );
    expect(result.data.candidates[0].eventContext).toMatchObject({
      seriesName: 'Ultra Valle',
      editionLabel: '2026',
      city: 'Monterrey',
      state: 'Nuevo Leon',
    });
    expect(result.data.candidates[0].resultContext).toMatchObject({
      bibNumber: '42',
      discipline: 'trail_running',
      finishTimeMillis: 3_600_000,
      ageGroupPlace: 2,
    });
    expect(result.data.candidates[0].matchSignals).toEqual(
      expect.arrayContaining(['exact_name', 'gender_match', 'strong_age_match']),
    );
  });

  it('returns empty state with organizer-assisted next steps when no safe candidates are found', async () => {
    mockAuthContext = makeRunnerAuthContext();
    mockFindUnclaimedResultClaimCandidates.mockResolvedValueOnce([
      makeClaimCandidateRow({
        runnerFullName: 'Sofia',
        bibNumber: null,
        gender: null,
        age: null,
        finishTimeMillis: null,
        overallPlace: null,
        genderPlace: null,
        ageGroupPlace: null,
        distanceLabel: null,
      }),
    ]);

    const result = await getRunnerResultClaimCandidates({ limit: 5, minimumConfidence: 0.9 });

    expect(result).toEqual({
      ok: true,
      data: {
        candidates: [],
        emptyState: {
          title: 'No safe claim candidates found yet',
          description:
            'We could not find a confident match for your profile right now. This protects official records from misattribution.',
          nextSteps: [
            'Verify your profile name and try again.',
            'Confirm race details like bib number and category with your organizer.',
            'Ask the organizer to resolve your identity link manually if needed.',
          ],
        },
      },
    });
  });

  it('returns unauthenticated for runner candidate search when no session is available', async () => {
    mockAuthContext = null;

    const result = await getRunnerResultClaimCandidates({ limit: 5 });

    expect(result).toEqual({
      ok: false,
      error: 'Authentication required',
      code: 'UNAUTHENTICATED',
    });
  });

  it('returns validation error when runner does not have a display name', async () => {
    mockAuthContext = makeRunnerAuthContext({
      user: {
        id: RUNNER_ID,
        email: 'runner@example.com',
        emailVerified: true,
        name: '  ',
      },
    });

    const result = await getRunnerResultClaimCandidates({ limit: 5 });

    expect(result).toEqual({
      ok: false,
      error: 'Runner profile name is required to search claim candidates',
      code: 'VALIDATION_ERROR',
    });
  });

  it('confirms a safe runner claim by creating a linked claim record', async () => {
    mockAuthContext = makeRunnerAuthContext();
    mockResultEntriesFindFirst.mockResolvedValueOnce({
      id: RESULT_ENTRY_ID,
      resultVersionId: RESULT_VERSION_ID,
    });
    mockResultEntryClaimsFindFirst.mockResolvedValueOnce(null);
    mockFindUnclaimedResultClaimCandidateByEntryId.mockResolvedValueOnce(
      makeClaimCandidateRow({
        entryId: RESULT_ENTRY_ID,
        resultVersionId: RESULT_VERSION_ID,
        runnerFullName: 'Sofia Runner',
        gender: 'female',
        age: 31,
      }),
    );
    mockInsertReturningQueue.push([
      makeResultEntryClaimRow({
        status: 'linked',
        linkedUserId: RUNNER_ID,
        requestedByUserId: RUNNER_ID,
        confidenceBasisPoints: 930,
        reviewReason: null,
      }),
    ]);

    const result = await confirmRunnerResultClaim({ entryId: RESULT_ENTRY_ID });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('Expected runner claim confirmation to succeed');
    }

    expect(result.data).toMatchObject({
      claimId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      entryId: RESULT_ENTRY_ID,
      resultVersionId: RESULT_VERSION_ID,
      outcome: 'linked',
      nextSteps: null,
    });
    expect(mockFindUnclaimedResultClaimCandidateByEntryId).toHaveBeenCalledWith(
      expect.objectContaining({
        entryId: RESULT_ENTRY_ID,
        runnerName: 'Sofia Runner',
      }),
    );
    expect(mockInsertCalls).toHaveLength(1);
    expect(mockInsertCalls[0]?.table).toBe(schema.resultEntryClaims);
    expect(mockInsertCalls[0]?.values).toMatchObject({
      resultEntryId: RESULT_ENTRY_ID,
      requestedByUserId: RUNNER_ID,
      linkedUserId: RUNNER_ID,
      status: 'linked',
    });
  });

  it('marks contested runner claims as pending review without ownership assignment', async () => {
    mockAuthContext = makeRunnerAuthContext();
    mockResultEntriesFindFirst.mockResolvedValueOnce({
      id: RESULT_ENTRY_ID,
      resultVersionId: RESULT_VERSION_ID,
    });
    mockResultEntryClaimsFindFirst.mockResolvedValueOnce(null);
    mockFindUnclaimedResultClaimCandidateByEntryId.mockResolvedValueOnce(
      makeClaimCandidateRow({
        entryId: RESULT_ENTRY_ID,
        resultVersionId: RESULT_VERSION_ID,
        runnerFullName: 'Sofia',
        bibNumber: null,
        gender: null,
        age: null,
        finishTimeMillis: null,
        overallPlace: null,
        genderPlace: null,
        ageGroupPlace: null,
        distanceLabel: null,
      }),
    );
    mockInsertReturningQueue.push([
      makeResultEntryClaimRow({
        status: 'pending_review',
        linkedUserId: null,
        requestedByUserId: RUNNER_ID,
        confidenceBasisPoints: 520,
        reviewReason: 'low_confidence_match',
      }),
    ]);

    const result = await confirmRunnerResultClaim({ entryId: RESULT_ENTRY_ID });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('Expected contested claim to return pending review');
    }

    expect(result.data.outcome).toBe('pending_review');
    expect(result.data.nextSteps).toEqual(
      expect.arrayContaining([
        'Wait for organizer review of this contested claim.',
        'No official result data changed while this claim is pending.',
      ]),
    );
    expect(mockInsertCalls[0]?.values).toMatchObject({
      resultEntryId: RESULT_ENTRY_ID,
      linkedUserId: null,
      status: 'pending_review',
    });
  });

  it('returns conflict when another user already has a linked claim record', async () => {
    mockAuthContext = makeRunnerAuthContext();
    mockResultEntriesFindFirst.mockResolvedValueOnce({
      id: RESULT_ENTRY_ID,
      resultVersionId: RESULT_VERSION_ID,
    });
    mockResultEntryClaimsFindFirst.mockResolvedValueOnce(
      makeResultEntryClaimRow({
        status: 'linked',
        linkedUserId: OTHER_USER_ID,
        requestedByUserId: OTHER_USER_ID,
        confidenceBasisPoints: 940,
        reviewReason: null,
      }),
    );

    const result = await confirmRunnerResultClaim({ entryId: RESULT_ENTRY_ID });

    expect(result).toEqual({
      ok: false,
      error: 'This result is already linked to another account.',
      code: 'CONFLICT',
    });
  });

  it('returns idempotent pending-review response for an existing runner review request', async () => {
    mockAuthContext = makeRunnerAuthContext();
    mockResultEntriesFindFirst.mockResolvedValueOnce({
      id: RESULT_ENTRY_ID,
      resultVersionId: RESULT_VERSION_ID,
    });
    mockResultEntryClaimsFindFirst.mockResolvedValueOnce(
      makeResultEntryClaimRow({
        status: 'pending_review',
        requestedByUserId: RUNNER_ID,
        linkedUserId: null,
      }),
    );

    const result = await confirmRunnerResultClaim({ entryId: RESULT_ENTRY_ID });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('Expected existing pending review response');
    }

    expect(result.data.outcome).toBe('pending_review');
    expect(result.data.message).toBe('Your claim is already pending organizer review.');
    expect(mockInsertCalls).toHaveLength(0);
  });

  it('allows organizer approval for pending claims and records resolver metadata', async () => {
    const reviewedAt = new Date('2026-02-07T01:15:00.000Z');
    mockAuthContext = makeAuthContext();
    mockResultEntryClaimsFindFirst.mockResolvedValueOnce(
      makeResultEntryClaimRow({
        status: 'pending_review',
        linkedUserId: null,
        requestedByUserId: RUNNER_ID,
      }),
    );
    mockResultEntriesFindFirst.mockResolvedValueOnce({
      id: RESULT_ENTRY_ID,
      resultVersionId: RESULT_VERSION_ID,
    });
    mockResultVersionsFindFirst.mockResolvedValueOnce({ editionId: EDITION_ID });
    mockUpdateReturningQueue.push([
      makeResultEntryClaimRow({
        status: 'linked',
        requestedByUserId: RUNNER_ID,
        linkedUserId: RUNNER_ID,
        reviewedByUserId: ORGANIZER_ID,
        reviewedAt,
        reviewReason: null,
        reviewContext: { note: 'Verified bib and finish time' },
      }),
    ]);

    const result = await reviewRunnerResultClaim({
      claimId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      decision: 'approve',
      reviewContextNote: 'Verified bib and finish time',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('Expected organizer approval to succeed');
    }

    expect(result.data).toMatchObject({
      claimId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      entryId: RESULT_ENTRY_ID,
      resultVersionId: RESULT_VERSION_ID,
      status: 'linked',
      reviewedByUserId: ORGANIZER_ID,
      reviewReason: null,
      reviewContext: { note: 'Verified bib and finish time' },
    });
    expect(result.data.reviewedAt).toEqual(reviewedAt);
    expect(mockUpdateSetCalls[0]).toMatchObject({
      status: 'linked',
      linkedUserId: RUNNER_ID,
      reviewedByUserId: ORGANIZER_ID,
      reviewContext: { note: 'Verified bib and finish time' },
    });
  });

  it('allows organizer rejection with explicit context and keeps entry unlinked', async () => {
    const reviewedAt = new Date('2026-02-07T01:25:00.000Z');
    mockAuthContext = makeAuthContext();
    mockResultEntryClaimsFindFirst.mockResolvedValueOnce(
      makeResultEntryClaimRow({
        status: 'pending_review',
        linkedUserId: null,
        requestedByUserId: RUNNER_ID,
      }),
    );
    mockResultEntriesFindFirst.mockResolvedValueOnce({
      id: RESULT_ENTRY_ID,
      resultVersionId: RESULT_VERSION_ID,
    });
    mockResultVersionsFindFirst.mockResolvedValueOnce({ editionId: EDITION_ID });
    mockUpdateReturningQueue.push([
      makeResultEntryClaimRow({
        status: 'rejected',
        linkedUserId: null,
        requestedByUserId: RUNNER_ID,
        reviewedByUserId: ORGANIZER_ID,
        reviewedAt,
        reviewReason: 'identity_mismatch',
        reviewContext: { note: 'Runner details do not match registration profile' },
      }),
    ]);

    const result = await reviewRunnerResultClaim({
      claimId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      decision: 'reject',
      reviewReason: 'identity_mismatch',
      reviewContextNote: 'Runner details do not match registration profile',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('Expected organizer rejection to succeed');
    }

    expect(result.data).toMatchObject({
      claimId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      entryId: RESULT_ENTRY_ID,
      resultVersionId: RESULT_VERSION_ID,
      status: 'rejected',
      reviewedByUserId: ORGANIZER_ID,
      reviewReason: 'identity_mismatch',
      reviewContext: { note: 'Runner details do not match registration profile' },
    });
    expect(result.data.reviewedAt).toEqual(reviewedAt);
    expect(mockUpdateSetCalls[0]).toMatchObject({
      status: 'rejected',
      linkedUserId: null,
      reviewedByUserId: ORGANIZER_ID,
      reviewReason: 'identity_mismatch',
      reviewContext: { note: 'Runner details do not match registration profile' },
    });
  });

  it('blocks unauthenticated and unauthorized organizer review attempts', async () => {
    mockAuthContext = null;
    const unauthenticated = await reviewRunnerResultClaim({
      claimId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      decision: 'approve',
    });
    expect(unauthenticated).toEqual({
      ok: false,
      error: 'Authentication required',
      code: 'UNAUTHENTICATED',
    });

    mockAuthContext = makeAuthContext(OUTSIDER_ID);
    mockResultEntryClaimsFindFirst.mockResolvedValueOnce(
      makeResultEntryClaimRow({ status: 'pending_review', linkedUserId: null }),
    );
    mockResultEntriesFindFirst.mockResolvedValueOnce({
      id: RESULT_ENTRY_ID,
      resultVersionId: RESULT_VERSION_ID,
    });
    mockResultVersionsFindFirst.mockResolvedValueOnce({ editionId: EDITION_ID });
    mockCanUserAccessEvent.mockResolvedValueOnce(null);
    mockRequireOrgPermission.mockImplementationOnce(() => {
      throw new Error('Permission denied');
    });

    const forbidden = await reviewRunnerResultClaim({
      claimId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      decision: 'approve',
    });

    expect(forbidden).toEqual({
      ok: false,
      error: 'Permission denied',
      code: 'FORBIDDEN',
    });
  });

  it('re-opens previously rejected claims as a deterministic re-attempt flow', async () => {
    mockAuthContext = makeRunnerAuthContext();
    mockResultEntriesFindFirst.mockResolvedValueOnce({
      id: RESULT_ENTRY_ID,
      resultVersionId: RESULT_VERSION_ID,
    });
    mockResultEntryClaimsFindFirst.mockResolvedValueOnce(
      makeResultEntryClaimRow({
        status: 'rejected',
        requestedByUserId: OTHER_USER_ID,
        linkedUserId: null,
        reviewedByUserId: ORGANIZER_ID,
        reviewedAt: new Date('2026-02-07T00:30:00.000Z'),
        reviewReason: 'identity_mismatch',
        reviewContext: { note: 'Previous review rejected claim' },
      }),
    );
    mockFindUnclaimedResultClaimCandidateByEntryId.mockResolvedValueOnce(
      makeClaimCandidateRow({
        entryId: RESULT_ENTRY_ID,
        resultVersionId: RESULT_VERSION_ID,
        runnerFullName: 'Sofia Runner',
        gender: 'female',
        age: 31,
      }),
    );
    mockUpdateReturningQueue.push([
      makeResultEntryClaimRow({
        status: 'linked',
        requestedByUserId: RUNNER_ID,
        linkedUserId: RUNNER_ID,
        reviewedByUserId: null,
        reviewedAt: null,
        reviewReason: null,
        reviewContext: {},
      }),
    ]);

    const result = await confirmRunnerResultClaim({ entryId: RESULT_ENTRY_ID });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('Expected rejected claim re-attempt to succeed');
    }

    expect(result.data).toMatchObject({
      claimId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      entryId: RESULT_ENTRY_ID,
      resultVersionId: RESULT_VERSION_ID,
      outcome: 'linked',
    });
    expect(mockInsertCalls).toHaveLength(0);
    expect(mockUpdateSetCalls[0]).toMatchObject({
      requestedByUserId: RUNNER_ID,
      linkedUserId: RUNNER_ID,
      status: 'linked',
      reviewedByUserId: null,
      reviewedAt: null,
      reviewReason: null,
      reviewContext: {},
    });
  });

  it('creates a pending correction request for runner-owned official results', async () => {
    mockAuthContext = makeRunnerAuthContext();
    mockResultEntriesFindFirst.mockResolvedValueOnce(
      makeResultEntryRow({
        id: RESULT_ENTRY_ID,
        userId: RUNNER_ID,
        resultVersionId: RESULT_VERSION_ID,
      }),
    );
    mockResultVersionsFindFirst.mockResolvedValueOnce(
      makeResultVersionRow({
        id: RESULT_VERSION_ID,
        status: 'official',
      }),
    );
    mockInsertReturningQueue.push([
      makeResultCorrectionRequestRow({
        resultEntryId: RESULT_ENTRY_ID,
        resultVersionId: RESULT_VERSION_ID,
        requestedByUserId: RUNNER_ID,
        status: 'pending',
        reason: 'Finish time mismatch',
        requestContext: {
          field: 'finishTimeMillis',
          expected: 3_590_000,
        },
      }),
    ]);

    const result = await requestRunnerResultCorrection({
      entryId: RESULT_ENTRY_ID,
      reason: 'Finish time mismatch',
      requestContext: {
        field: 'finishTimeMillis',
        expected: 3_590_000,
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('Expected correction request creation to succeed');
    }

    expect(result.data.request).toMatchObject({
      resultEntryId: RESULT_ENTRY_ID,
      resultVersionId: RESULT_VERSION_ID,
      requestedByUserId: RUNNER_ID,
      status: 'pending',
      reason: 'Finish time mismatch',
      requestContext: {
        field: 'finishTimeMillis',
        expected: 3_590_000,
      },
    });

    expect(mockInsertCalls).toHaveLength(1);
    expect(mockInsertCalls[0]?.table).toBe(schema.resultCorrectionRequests);
    expect(mockInsertCalls[0]?.values).toMatchObject({
      resultEntryId: RESULT_ENTRY_ID,
      resultVersionId: RESULT_VERSION_ID,
      requestedByUserId: RUNNER_ID,
      status: 'pending',
      reason: 'Finish time mismatch',
    });
  });

  it('blocks correction requests for unrelated result ownership', async () => {
    mockAuthContext = makeRunnerAuthContext();
    mockResultEntriesFindFirst.mockResolvedValueOnce(
      makeResultEntryRow({
        id: RESULT_ENTRY_ID,
        userId: OTHER_USER_ID,
        resultVersionId: RESULT_VERSION_ID,
      }),
    );
    mockResultVersionsFindFirst.mockResolvedValueOnce(
      makeResultVersionRow({
        id: RESULT_VERSION_ID,
        status: 'official',
      }),
    );

    const result = await requestRunnerResultCorrection({
      entryId: RESULT_ENTRY_ID,
      reason: 'Name typo',
    });

    expect(result).toEqual({
      ok: false,
      error: 'You can only request corrections for results linked to your account.',
      code: 'FORBIDDEN',
    });
    expect(mockInsertCalls).toHaveLength(0);
  });

  it('allows eligible organizers to submit correction requests for event-scoped entries', async () => {
    mockAuthContext = makeAuthContext();
    mockResultEntriesFindFirst.mockResolvedValueOnce(
      makeResultEntryRow({
        id: RESULT_ENTRY_ID,
        userId: OTHER_USER_ID,
        resultVersionId: RESULT_VERSION_ID,
      }),
    );
    mockResultVersionsFindFirst.mockResolvedValueOnce(
      makeResultVersionRow({
        id: RESULT_VERSION_ID,
        status: 'official',
        editionId: EDITION_ID,
      }),
    );
    mockInsertReturningQueue.push([
      makeResultCorrectionRequestRow({
        resultEntryId: RESULT_ENTRY_ID,
        resultVersionId: RESULT_VERSION_ID,
        requestedByUserId: ORGANIZER_ID,
        status: 'pending',
        reason: 'Organizer-submitted correction',
      }),
    ]);

    const result = await requestRunnerResultCorrection({
      entryId: RESULT_ENTRY_ID,
      reason: 'Organizer-submitted correction',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('Expected organizer correction request creation to succeed');
    }

    expect(result.data.request).toMatchObject({
      resultEntryId: RESULT_ENTRY_ID,
      resultVersionId: RESULT_VERSION_ID,
      requestedByUserId: ORGANIZER_ID,
      status: 'pending',
      reason: 'Organizer-submitted correction',
    });
    expect(mockCreateAuditLog).not.toHaveBeenCalled();
  });

  it('logs denied correction request attempts for ineligible organizer actors', async () => {
    mockAuthContext = makeAuthContext(OUTSIDER_ID);
    mockResultEntriesFindFirst.mockResolvedValueOnce(
      makeResultEntryRow({
        id: RESULT_ENTRY_ID,
        userId: OTHER_USER_ID,
        resultVersionId: RESULT_VERSION_ID,
      }),
    );
    mockResultVersionsFindFirst.mockResolvedValueOnce(
      makeResultVersionRow({
        id: RESULT_VERSION_ID,
        status: 'official',
        editionId: EDITION_ID,
      }),
    );
    mockCanUserAccessEvent.mockResolvedValueOnce(null);
    mockRequireOrgPermission.mockImplementationOnce(() => {
      throw new Error('Permission denied');
    });

    const result = await requestRunnerResultCorrection({
      entryId: RESULT_ENTRY_ID,
      reason: 'Unauthorized organizer request',
    });

    expect(result).toEqual({
      ok: false,
      error: 'Only the linked runner or an eligible organizer can submit a correction request for this result.',
      code: 'FORBIDDEN',
    });
    expect(mockInsertCalls).toHaveLength(0);
    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'results.correction.request.denied',
        actorUserId: OUTSIDER_ID,
        entityType: 'result_entry',
        entityId: RESULT_ENTRY_ID,
      }),
    );
  });

  it('rejects correction requests when the result version is not finalized', async () => {
    mockAuthContext = makeRunnerAuthContext();
    mockResultEntriesFindFirst.mockResolvedValueOnce(
      makeResultEntryRow({
        id: RESULT_ENTRY_ID,
        userId: RUNNER_ID,
        resultVersionId: RESULT_VERSION_ID,
      }),
    );
    mockResultVersionsFindFirst.mockResolvedValueOnce(
      makeResultVersionRow({
        id: RESULT_VERSION_ID,
        status: 'draft',
      }),
    );

    const result = await requestRunnerResultCorrection({
      entryId: RESULT_ENTRY_ID,
      reason: 'Name typo',
    });

    expect(result).toEqual({
      ok: false,
      error: 'Corrections can only be requested for official or corrected result versions.',
      code: 'INVALID_STATE',
    });
    expect(mockInsertCalls).toHaveLength(0);
  });

  it('requires authentication before creating correction requests', async () => {
    mockAuthContext = null;

    const result = await requestRunnerResultCorrection({
      entryId: RESULT_ENTRY_ID,
      reason: 'Name typo',
    });

    expect(result).toEqual({
      ok: false,
      error: 'Authentication required',
      code: 'UNAUTHENTICATED',
    });
  });

  it('allows organizers to approve pending correction requests and persists reviewer metadata', async () => {
    const reviewedAt = new Date('2026-02-07T06:00:00.000Z');
    mockAuthContext = makeAuthContext();
    mockResultCorrectionRequestsFindFirst.mockResolvedValueOnce(
      makeResultCorrectionRequestRow({
        status: 'pending',
        resultVersionId: RESULT_VERSION_ID,
      }),
    );
    mockResultVersionsFindFirst.mockResolvedValueOnce({ editionId: EDITION_ID });
    mockUpdateReturningQueue.push([
      makeResultCorrectionRequestRow({
        status: 'approved',
        reviewedByUserId: ORGANIZER_ID,
        reviewedAt,
        reviewDecisionNote: 'Verified registration evidence',
      }),
    ]);

    const result = await reviewResultCorrectionRequest({
      requestId: 'abababab-1234-4aba-8aba-abababababab',
      decision: 'approve',
      reviewDecisionNote: 'Verified registration evidence',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('Expected correction review approval to succeed');
    }

    expect(result.data.request).toMatchObject({
      status: 'approved',
      reviewedByUserId: ORGANIZER_ID,
      reviewDecisionNote: 'Verified registration evidence',
    });
    expect(result.data.request.reviewedAt).toEqual(reviewedAt);
    expect(mockUpdateSetCalls[0]).toMatchObject({
      status: 'approved',
      reviewedByUserId: ORGANIZER_ID,
      reviewDecisionNote: 'Verified registration evidence',
    });
    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'results.correction.review.approve',
        actorUserId: ORGANIZER_ID,
        entityType: 'result_correction_request',
        entityId: 'abababab-1234-4aba-8aba-abababababab',
      }),
    );
  });

  it('blocks organizer correction review when request is already decided', async () => {
    mockAuthContext = makeAuthContext();
    mockResultCorrectionRequestsFindFirst.mockResolvedValueOnce(
      makeResultCorrectionRequestRow({
        status: 'approved',
        reviewedByUserId: ORGANIZER_ID,
      }),
    );
    mockResultVersionsFindFirst.mockResolvedValueOnce({ editionId: EDITION_ID });

    const result = await reviewResultCorrectionRequest({
      requestId: 'abababab-1234-4aba-8aba-abababababab',
      decision: 'reject',
    });

    expect(result).toEqual({
      ok: false,
      error: 'Correction request is no longer reviewable.',
      code: 'INVALID_STATE',
    });
  });

  it('blocks unauthorized organizer correction review attempts', async () => {
    mockAuthContext = makeAuthContext(OUTSIDER_ID);
    mockResultCorrectionRequestsFindFirst.mockResolvedValueOnce(
      makeResultCorrectionRequestRow({
        status: 'pending',
      }),
    );
    mockResultVersionsFindFirst.mockResolvedValueOnce({ editionId: EDITION_ID });
    mockCanUserAccessEvent.mockResolvedValueOnce(null);
    mockRequireOrgPermission.mockImplementationOnce(() => {
      throw new Error('Permission denied');
    });

    const result = await reviewResultCorrectionRequest({
      requestId: 'abababab-1234-4aba-8aba-abababababab',
      decision: 'reject',
    });

    expect(result).toEqual({
      ok: false,
      error: 'Only eligible organizers for this event can approve or reject correction requests.',
      code: 'FORBIDDEN',
    });
    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'results.correction.review.denied',
        actorUserId: OUTSIDER_ID,
        entityType: 'result_correction_request',
        entityId: 'abababab-1234-4aba-8aba-abababababab',
      }),
    );
  });

  it('requires authentication before organizer correction review', async () => {
    mockAuthContext = null;

    const result = await reviewResultCorrectionRequest({
      requestId: 'abababab-1234-4aba-8aba-abababababab',
      decision: 'approve',
    });

    expect(result).toEqual({
      ok: false,
      error: 'Authentication required',
      code: 'UNAUTHENTICATED',
    });
  });

  it('publishes an approved correction as a new corrected version without mutating source official data', async () => {
    mockAuthContext = makeAuthContext();
    const sourceVersion = makeResultVersionRow({
      id: RESULT_VERSION_ID,
      status: 'official',
      versionNumber: 7,
    });
    const sourceEntry = makeResultEntryRow({
      id: RESULT_ENTRY_ID,
      resultVersionId: RESULT_VERSION_ID,
      status: 'finish',
      finishTimeMillis: 3_600_000,
    });
    const draftCorrectionVersion = makeResultVersionRow({
      id: 'abababab-abab-4aba-8aba-ababababab12',
      status: 'draft',
      source: 'correction',
      versionNumber: 8,
      parentVersionId: RESULT_VERSION_ID,
    });
    const correctedVersion = makeResultVersionRow({
      id: 'abababab-abab-4aba-8aba-ababababab12',
      status: 'corrected',
      source: 'correction',
      versionNumber: 8,
      parentVersionId: RESULT_VERSION_ID,
      finalizedByUserId: ORGANIZER_ID,
      finalizedAt: new Date('2026-02-07T07:00:00.000Z'),
    });
    const updatedRequest = makeResultCorrectionRequestRow({
      id: 'abababab-1234-4aba-8aba-abababababab',
      resultEntryId: RESULT_ENTRY_ID,
      resultVersionId: RESULT_VERSION_ID,
      status: 'approved',
      requestContext: {
        correctionPatch: {
          finishTimeMillis: 3_590_000,
        },
        publication: {
          publishedResultVersionId: correctedVersion.id,
        },
      },
    });

    mockResultCorrectionRequestsFindFirst.mockResolvedValueOnce(
      makeResultCorrectionRequestRow({
        id: 'abababab-1234-4aba-8aba-abababababab',
        resultEntryId: RESULT_ENTRY_ID,
        resultVersionId: RESULT_VERSION_ID,
        status: 'approved',
        requestContext: {
          correctionPatch: {
            finishTimeMillis: 3_590_000,
          },
        },
      }),
    );
    mockResultVersionsFindFirst
      .mockResolvedValueOnce(sourceVersion)
      .mockResolvedValueOnce({ id: sourceVersion.id, versionNumber: sourceVersion.versionNumber });
    mockResultEntriesFindMany
      .mockResolvedValueOnce([sourceEntry])
      .mockResolvedValueOnce([]);
    mockInsertReturningQueue.push([draftCorrectionVersion]);
    mockUpdateReturningQueue.push([correctedVersion], [updatedRequest]);
    mockEventEditionsFindFirst.mockResolvedValueOnce({
      id: EDITION_ID,
      series: { organizationId: 'org-123' },
    });

    const result = await publishApprovedCorrectionVersion({
      requestId: 'abababab-1234-4aba-8aba-abababababab',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('Expected correction publication to succeed');
    }

    expect(result.data).toMatchObject({
      sourceResultVersionId: RESULT_VERSION_ID,
      resultVersion: {
        id: correctedVersion.id,
        status: 'corrected',
        source: 'correction',
        parentVersionId: RESULT_VERSION_ID,
      },
      request: {
        id: 'abababab-1234-4aba-8aba-abababababab',
        status: 'approved',
      },
    });
    expect(mockInsertCalls[0]?.table).toBe(schema.resultVersions);
    expect(mockInsertCalls[0]?.values).toMatchObject({
      editionId: EDITION_ID,
      source: 'correction',
      parentVersionId: RESULT_VERSION_ID,
      versionNumber: 8,
    });
    expect(mockInsertCalls.some((call) => call.table === schema.resultEntries)).toBe(true);
    const insertedCorrectedEntry = mockInsertCalls.find((call) =>
      call.table === schema.resultEntries && call.values.resultVersionId === draftCorrectionVersion.id,
    );
    expect(insertedCorrectedEntry?.values).toMatchObject({
      status: 'finish',
      finishTimeMillis: 3_590_000,
    });
    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'results.correction.publish',
        actorUserId: ORGANIZER_ID,
        entityType: 'result_correction_request',
        entityId: 'abababab-1234-4aba-8aba-abababababab',
      }),
      expect.any(Object),
    );
  });

  it('keeps approved request recoverable when correction publication patch is missing', async () => {
    mockAuthContext = makeAuthContext();
    mockResultCorrectionRequestsFindFirst.mockResolvedValueOnce(
      makeResultCorrectionRequestRow({
        status: 'approved',
        requestContext: {},
      }),
    );

    const result = await publishApprovedCorrectionVersion({
      requestId: 'abababab-1234-4aba-8aba-abababababab',
    });

    expect(result).toEqual({
      ok: false,
      error: 'Correction request is missing a valid correction patch payload.',
      code: 'VALIDATION_ERROR',
    });
    expect(mockInsertCalls).toHaveLength(0);
    expect(mockUpdateSetCalls).toHaveLength(0);
  });

  it('returns conflict on correction publication transaction errors and leaves request approved', async () => {
    mockAuthContext = makeAuthContext();
    mockResultCorrectionRequestsFindFirst.mockResolvedValueOnce(
      makeResultCorrectionRequestRow({
        id: 'abababab-1234-4aba-8aba-abababababab',
        status: 'approved',
        requestContext: {
          correctionPatch: {
            finishTimeMillis: 3_590_000,
          },
        },
      }),
    );
    mockResultVersionsFindFirst
      .mockResolvedValueOnce(
        makeResultVersionRow({
          id: RESULT_VERSION_ID,
          status: 'official',
          versionNumber: 3,
        }),
      )
      .mockResolvedValueOnce({ id: RESULT_VERSION_ID, versionNumber: 3 });
    mockResultEntriesFindMany.mockResolvedValueOnce([makeResultEntryRow()]);
    mockInsertReturningQueue.push({
      throw: { code: '23505', constraint: 'result_versions_edition_version_idx' },
    });

    const result = await publishApprovedCorrectionVersion({
      requestId: 'abababab-1234-4aba-8aba-abababababab',
    });

    expect(result).toEqual({
      ok: false,
      error: 'Correction publication failed. Request remains approved for retry.',
      code: 'CONFLICT',
    });
    expect(mockUpdateSetCalls).toHaveLength(0);
  });
});
