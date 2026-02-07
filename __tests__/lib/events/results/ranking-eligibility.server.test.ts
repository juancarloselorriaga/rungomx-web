import {
  resolveRankingSourceEligibility,
  selectLatestRankingEligibleVersion,
} from '@/lib/events/results/queries';

describe('ranking source eligibility', () => {
  it('selects the latest official/corrected version and excludes drafts', () => {
    const selected = selectLatestRankingEligibleVersion([
      {
        id: 'v5',
        editionId: 'edition-1',
        status: 'draft',
        versionNumber: 5,
        createdAt: new Date('2026-02-07T12:00:00.000Z'),
      },
      {
        id: 'v4',
        editionId: 'edition-1',
        status: 'corrected',
        versionNumber: 4,
        createdAt: new Date('2026-02-07T11:00:00.000Z'),
      },
      {
        id: 'v3',
        editionId: 'edition-1',
        status: 'official',
        versionNumber: 3,
        createdAt: new Date('2026-02-07T10:00:00.000Z'),
      },
    ]);

    expect(selected?.id).toBe('v4');
    expect(selected?.status).toBe('corrected');
  });

  it('returns not_finalized when no eligible official source exists', () => {
    const eligibility = resolveRankingSourceEligibility({
      editionId: 'edition-2',
      candidates: [
        {
          id: 'v2',
          editionId: 'edition-2',
          status: 'draft',
          versionNumber: 2,
          createdAt: new Date('2026-02-07T11:00:00.000Z'),
        },
      ],
    });

    expect(eligibility).toEqual({
      editionId: 'edition-2',
      state: 'not_finalized',
      resultVersionId: null,
      resultVersionStatus: null,
    });
  });
});
