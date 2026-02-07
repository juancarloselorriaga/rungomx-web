type SelectChainWithLimit = {
  from: jest.Mock;
  innerJoin: jest.Mock;
  leftJoin: jest.Mock;
  where: jest.Mock;
  orderBy: jest.Mock;
  limit: jest.Mock;
};

const mockSelect = jest.fn();
const mockResultVersionsFindMany = jest.fn();

function createSelectChainWithLimit(rows: unknown[]): SelectChainWithLimit {
  const chain = {
    from: jest.fn(),
    innerJoin: jest.fn(),
    leftJoin: jest.fn(),
    where: jest.fn(),
    orderBy: jest.fn(),
    limit: jest.fn(),
  };

  chain.from.mockReturnValue(chain);
  chain.innerJoin.mockReturnValue(chain);
  chain.leftJoin.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.orderBy.mockReturnValue(chain);
  chain.limit.mockResolvedValue(rows);

  return chain;
}

jest.mock('@/db', () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    query: {
      resultVersions: {
        findMany: (...args: unknown[]) => mockResultVersionsFindMany(...args),
      },
    },
  },
}));

import {
  listPublicOfficialResultsDirectory,
  searchPublicOfficialResultEntries,
} from '@/lib/events/results/queries';

describe('public results discovery and search queries', () => {
  beforeEach(() => {
    mockSelect.mockReset();
    mockResultVersionsFindMany.mockReset();
  });

  it('builds official-only directory rows using the active version pointer per edition', async () => {
    mockResultVersionsFindMany.mockResolvedValueOnce([
      {
        id: 'version-8',
        editionId: 'edition-1',
        status: 'corrected',
        versionNumber: 8,
        createdAt: new Date('2026-02-07T10:00:00.000Z'),
      },
      {
        id: 'version-7',
        editionId: 'edition-1',
        status: 'official',
        versionNumber: 7,
        createdAt: new Date('2026-02-06T10:00:00.000Z'),
      },
      {
        id: 'version-4',
        editionId: 'edition-2',
        status: 'official',
        versionNumber: 4,
        createdAt: new Date('2026-01-20T10:00:00.000Z'),
      },
    ]);

    const directoryRows = [
      {
        editionId: 'edition-1',
        editionSlug: 'ultra-valle-2026',
        editionLabel: '2026',
        startsAt: new Date('2026-05-17T06:00:00.000Z'),
        city: 'Monterrey',
        state: 'Nuevo Leon',
        seriesSlug: 'ultra-valle',
        seriesName: 'Ultra Valle',
      },
      {
        editionId: 'edition-2',
        editionSlug: 'sierra-run-2026',
        editionLabel: '2026',
        startsAt: new Date('2026-04-01T06:00:00.000Z'),
        city: 'Saltillo',
        state: 'Coahuila',
        seriesSlug: 'sierra-run',
        seriesName: 'Sierra Run',
      },
    ];

    mockSelect.mockReturnValueOnce(createSelectChainWithLimit(directoryRows));

    const result = await listPublicOfficialResultsDirectory();

    expect(result).toEqual([
      {
        editionId: 'edition-1',
        seriesSlug: 'ultra-valle',
        seriesName: 'Ultra Valle',
        editionSlug: 'ultra-valle-2026',
        editionLabel: '2026',
        startsAt: new Date('2026-05-17T06:00:00.000Z'),
        city: 'Monterrey',
        state: 'Nuevo Leon',
        activeVersionStatus: 'corrected',
        activeVersionNumber: 8,
      },
      {
        editionId: 'edition-2',
        seriesSlug: 'sierra-run',
        seriesName: 'Sierra Run',
        editionSlug: 'sierra-run-2026',
        editionLabel: '2026',
        startsAt: new Date('2026-04-01T06:00:00.000Z'),
        city: 'Saltillo',
        state: 'Coahuila',
        activeVersionStatus: 'official',
        activeVersionNumber: 4,
      },
    ]);
  });

  it('returns empty search results when name and bib filters are both missing', async () => {
    const result = await searchPublicOfficialResultEntries({});

    expect(result).toEqual([]);
    expect(mockResultVersionsFindMany).not.toHaveBeenCalled();
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it('returns public-safe search matches for official active versions only', async () => {
    mockResultVersionsFindMany.mockResolvedValueOnce([
      {
        id: 'version-8',
        editionId: 'edition-1',
        status: 'corrected',
        versionNumber: 8,
        createdAt: new Date('2026-02-07T10:00:00.000Z'),
      },
    ]);

    const searchRows = [
      {
        editionId: 'edition-1',
        seriesSlug: 'ultra-valle',
        seriesName: 'Ultra Valle',
        editionSlug: 'ultra-valle-2026',
        editionLabel: '2026',
        resultVersionId: 'version-8',
        runnerFullName: 'Ana Runner',
        bibNumber: '101',
        resultStatus: 'finish',
        finishTimeMillis: 3_700_000,
        overallPlace: 1,
        genderPlace: 1,
        ageGroupPlace: 1,
        distanceLabel: '50K',
      },
    ];

    mockSelect.mockReturnValueOnce(createSelectChainWithLimit(searchRows));

    const result = await searchPublicOfficialResultEntries({
      query: 'Ana',
      bib: '101',
    });

    expect(result).toEqual([
      {
        editionId: 'edition-1',
        seriesSlug: 'ultra-valle',
        seriesName: 'Ultra Valle',
        editionSlug: 'ultra-valle-2026',
        editionLabel: '2026',
        runnerFullName: 'Ana Runner',
        bibNumber: '101',
        resultStatus: 'finish',
        finishTimeMillis: 3_700_000,
        overallPlace: 1,
        genderPlace: 1,
        ageGroupPlace: 1,
        distanceLabel: '50K',
        activeVersionStatus: 'corrected',
        activeVersionNumber: 8,
      },
    ]);
    expect(result[0]).not.toHaveProperty('resultVersionId');
  });
});
