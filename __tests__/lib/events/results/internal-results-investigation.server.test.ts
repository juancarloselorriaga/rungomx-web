const mockResultVersionsFindMany = jest.fn();
const mockResultCorrectionRequestsFindMany = jest.fn();

jest.mock('@/db', () => ({
  db: {
    query: {
      resultVersions: {
        findMany: (...args: unknown[]) => mockResultVersionsFindMany(...args),
      },
      resultCorrectionRequests: {
        findMany: (...args: unknown[]) => mockResultCorrectionRequestsFindMany(...args),
      },
    },
  },
}));

import { getInternalResultsInvestigationViewData } from '@/lib/events/results/queries';

function buildVersionRow(params: {
  id: string;
  editionId: string;
  versionNumber: number;
  status: 'draft' | 'official' | 'corrected';
  source: 'manual_offline' | 'csv_excel' | 'correction';
  createdAt: string;
  finalizedAt?: string | null;
  finalizedByUserName?: string | null;
}) {
  return {
    id: params.id,
    editionId: params.editionId,
    status: params.status,
    source: params.source,
    versionNumber: params.versionNumber,
    parentVersionId: null,
    createdByUserId: 'user-created',
    finalizedByUserId: params.finalizedAt ? 'user-finalized' : null,
    finalizedAt: params.finalizedAt ? new Date(params.finalizedAt) : null,
    sourceFileChecksum: `checksum-${params.id}`,
    sourceReference: `source-${params.id}`,
    provenanceJson: { uploadedBy: 'ops' },
    createdAt: new Date(params.createdAt),
    createdByUser: { id: 'user-created', name: 'Creator', email: 'creator@example.com' },
    finalizedByUser: params.finalizedAt
      ? {
          id: 'user-finalized',
          name: params.finalizedByUserName ?? null,
          email: 'finalizer@example.com',
        }
      : null,
    ingestionSession: {
      id: `session-${params.id}`,
      sourceLane: 'csv_excel',
      startedByUserId: 'user-starter',
      sourceReference: `ingestion-${params.id}`,
      sourceFileChecksum: `ingestion-checksum-${params.id}`,
      provenanceJson: { lane: 'csv' },
      startedAt: new Date(params.createdAt),
      startedByUser: { id: 'user-starter', name: 'Starter', email: 'starter@example.com' },
    },
  };
}

describe('internal results investigation read model', () => {
  beforeEach(() => {
    mockResultVersionsFindMany.mockReset();
    mockResultCorrectionRequestsFindMany.mockReset();
  });

  it('returns versions, provenance, corrections, and selected diff context', async () => {
    mockResultVersionsFindMany.mockResolvedValueOnce([
      buildVersionRow({
        id: 'version-2',
        editionId: 'edition-1',
        versionNumber: 2,
        status: 'corrected',
        source: 'correction',
        createdAt: '2026-08-20T12:00:00.000Z',
        finalizedAt: '2026-08-20T13:00:00.000Z',
        finalizedByUserName: 'Approver One',
      }),
      buildVersionRow({
        id: 'version-1',
        editionId: 'edition-1',
        versionNumber: 1,
        status: 'official',
        source: 'csv_excel',
        createdAt: '2026-08-10T12:00:00.000Z',
        finalizedAt: '2026-08-10T13:00:00.000Z',
      }),
    ]);

    mockResultCorrectionRequestsFindMany.mockResolvedValueOnce([
      {
        id: 'request-1',
        resultVersionId: 'version-1',
        reason: 'Timing correction',
        requestContext: {
          publication: {
            publishedResultVersionId: 'version-2',
            publishedAt: '2026-08-20T13:10:00.000Z',
          },
        },
        requestedByUserId: 'user-runner',
        reviewedByUserId: 'user-approver',
        requestedAt: new Date('2026-08-20T11:00:00.000Z'),
        reviewedAt: new Date('2026-08-20T12:30:00.000Z'),
        resultVersion: {
          editionId: 'edition-1',
          deletedAt: null,
        },
        requestedByUser: {
          id: 'user-runner',
          name: 'Runner Name',
          email: 'runner@example.com',
        },
        reviewedByUser: {
          id: 'user-approver',
          name: 'Approver Name',
          email: 'approver@example.com',
        },
      },
    ]);

    const result = await getInternalResultsInvestigationViewData({
      editionId: 'edition-1',
      fromVersionId: 'version-1',
      toVersionId: 'version-2',
    });

    expect(result.editionId).toBe('edition-1');
    expect(result.versions).toHaveLength(2);
    expect(result.versions[0]).toMatchObject({
      id: 'version-2',
      source: 'correction',
      finalizedByDisplayName: 'Approver One',
      ingestion: expect.objectContaining({
        sourceLane: 'csv_excel',
        startedByDisplayName: 'Starter',
      }),
    });
    expect(result.corrections).toEqual([
      expect.objectContaining({
        requestId: 'request-1',
        sourceResultVersionId: 'version-1',
        correctedResultVersionId: 'version-2',
        requestedByDisplayName: 'Runner Name',
        reviewedByDisplayName: 'Approver Name',
      }),
    ]);
    expect(result.selectedDiff).toMatchObject({
      fromVersionId: 'version-1',
      toVersionId: 'version-2',
      fromVersionNumber: 1,
      toVersionNumber: 2,
      approverDisplayName: 'Approver Name',
      reason: 'Timing correction',
    });
  });

  it('falls back to the latest correction transition when requested diff is invalid', async () => {
    mockResultVersionsFindMany.mockResolvedValueOnce([
      buildVersionRow({
        id: 'version-3',
        editionId: 'edition-1',
        versionNumber: 3,
        status: 'corrected',
        source: 'correction',
        createdAt: '2026-08-30T12:00:00.000Z',
      }),
      buildVersionRow({
        id: 'version-2',
        editionId: 'edition-1',
        versionNumber: 2,
        status: 'corrected',
        source: 'correction',
        createdAt: '2026-08-20T12:00:00.000Z',
      }),
      buildVersionRow({
        id: 'version-1',
        editionId: 'edition-1',
        versionNumber: 1,
        status: 'official',
        source: 'csv_excel',
        createdAt: '2026-08-10T12:00:00.000Z',
      }),
    ]);

    mockResultCorrectionRequestsFindMany.mockResolvedValueOnce([
      {
        id: 'request-older',
        resultVersionId: 'version-1',
        reason: 'Old correction',
        requestContext: {
          publication: {
            publishedResultVersionId: 'version-2',
            publishedAt: '2026-08-20T13:10:00.000Z',
          },
        },
        requestedByUserId: 'user-runner',
        reviewedByUserId: 'user-approver',
        requestedAt: new Date('2026-08-20T11:00:00.000Z'),
        reviewedAt: new Date('2026-08-20T12:30:00.000Z'),
        resultVersion: {
          editionId: 'edition-1',
          deletedAt: null,
        },
        requestedByUser: null,
        reviewedByUser: null,
      },
      {
        id: 'request-latest',
        resultVersionId: 'version-2',
        reason: 'Latest correction',
        requestContext: {
          publication: {
            publishedResultVersionId: 'version-3',
            publishedAt: '2026-08-30T13:10:00.000Z',
          },
        },
        requestedByUserId: 'user-runner',
        reviewedByUserId: 'user-approver',
        requestedAt: new Date('2026-08-30T11:00:00.000Z'),
        reviewedAt: new Date('2026-08-30T12:30:00.000Z'),
        resultVersion: {
          editionId: 'edition-1',
          deletedAt: null,
        },
        requestedByUser: null,
        reviewedByUser: null,
      },
      {
        id: 'request-other-edition',
        resultVersionId: 'version-1',
        reason: 'Other edition',
        requestContext: {
          publication: {
            publishedResultVersionId: 'version-2',
            publishedAt: '2026-08-31T13:10:00.000Z',
          },
        },
        requestedByUserId: 'user-runner',
        reviewedByUserId: 'user-approver',
        requestedAt: new Date('2026-08-31T11:00:00.000Z'),
        reviewedAt: new Date('2026-08-31T12:30:00.000Z'),
        resultVersion: {
          editionId: 'edition-other',
          deletedAt: null,
        },
        requestedByUser: null,
        reviewedByUser: null,
      },
    ]);

    const result = await getInternalResultsInvestigationViewData({
      editionId: 'edition-1',
      fromVersionId: 'does-not-exist',
      toVersionId: 'does-not-exist',
    });

    expect(result.corrections).toHaveLength(2);
    expect(result.selectedDiff).toMatchObject({
      fromVersionId: 'version-2',
      toVersionId: 'version-3',
      reason: 'Latest correction',
    });
  });
});
