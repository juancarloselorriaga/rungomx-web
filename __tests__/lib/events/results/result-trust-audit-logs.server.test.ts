const mockSelect = jest.fn();
const mockFrom = jest.fn();
const mockLeftJoin = jest.fn();
const mockWhere = jest.fn();
const mockOrderBy = jest.fn();
const mockLimit = jest.fn();

jest.mock('@/db', () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
  },
}));

import { listResultTrustAuditLogsForEdition } from '@/lib/events/results/queries';

describe('result trust audit log query', () => {
  beforeEach(() => {
    mockSelect.mockReset();
    mockFrom.mockReset();
    mockLeftJoin.mockReset();
    mockWhere.mockReset();
    mockOrderBy.mockReset();
    mockLimit.mockReset();

    mockSelect.mockImplementation(() => ({ from: mockFrom }));
    mockFrom.mockImplementation(() => ({ leftJoin: mockLeftJoin }));
    mockLeftJoin.mockImplementation(() => ({ where: mockWhere }));
    mockWhere.mockImplementation(() => ({ orderBy: mockOrderBy }));
    mockOrderBy.mockImplementation(() => ({ limit: mockLimit }));
  });

  it('filters trust logs to the requested edition and returns traceability fields', async () => {
    mockLimit.mockResolvedValueOnce([
      {
        id: 'audit-1',
        organizationId: 'org-1',
        actorUserId: 'user-1',
        action: 'results.version.finalize',
        entityType: 'result_version',
        entityId: 'version-1',
        beforeJson: { editionId: 'edition-1', status: 'draft' },
        afterJson: { editionId: 'edition-1', status: 'official' },
        createdAt: new Date('2026-08-10T13:00:00.000Z'),
        actorName: 'Organizer',
        actorEmail: 'organizer@example.com',
      },
      {
        id: 'audit-2',
        organizationId: 'org-1',
        actorUserId: 'user-2',
        action: 'results.correction.publish',
        entityType: 'result_correction_request',
        entityId: 'request-1',
        beforeJson: { editionId: 'edition-1' },
        afterJson: null,
        createdAt: new Date('2026-08-11T13:00:00.000Z'),
        actorName: null,
        actorEmail: 'reviewer@example.com',
      },
      {
        id: 'audit-3',
        organizationId: 'org-1',
        actorUserId: 'user-3',
        action: 'results.ingestion.initialize',
        entityType: 'result_ingestion_session',
        entityId: 'session-1',
        beforeJson: { editionId: 'edition-other' },
        afterJson: { editionId: 'edition-other' },
        createdAt: new Date('2026-08-12T13:00:00.000Z'),
        actorName: 'Other',
        actorEmail: 'other@example.com',
      },
    ]);

    const result = await listResultTrustAuditLogsForEdition({
      editionId: 'edition-1',
      limit: 10,
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      id: 'audit-1',
      action: 'results.version.finalize',
      actorDisplayName: 'Organizer',
      editionId: 'edition-1',
      entityType: 'result_version',
      entityId: 'version-1',
    });
    expect(result[1]).toMatchObject({
      id: 'audit-2',
      action: 'results.correction.publish',
      actorDisplayName: 'reviewer@example.com',
      editionId: 'edition-1',
      entityType: 'result_correction_request',
      entityId: 'request-1',
    });
  });
});
