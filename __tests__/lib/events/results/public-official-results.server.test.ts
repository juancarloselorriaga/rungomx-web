type SelectChain = {
  from: jest.Mock;
  innerJoin: jest.Mock;
  leftJoin: jest.Mock;
  where: jest.Mock;
  orderBy: jest.Mock;
  limit: jest.Mock;
  then: Promise<unknown[]>['then'];
  catch: Promise<unknown[]>['catch'];
  finally: Promise<unknown[]>['finally'];
};

const mockSelect = jest.fn();
const mockResultVersionsFindFirst = jest.fn();

function createSelectChain(rows: unknown[]): SelectChain {
  const chain = {
    from: jest.fn(),
    innerJoin: jest.fn(),
    leftJoin: jest.fn(),
    where: jest.fn(),
    orderBy: jest.fn(),
    limit: jest.fn(),
    then: Promise.resolve(rows).then.bind(Promise.resolve(rows)),
    catch: Promise.resolve(rows).catch.bind(Promise.resolve(rows)),
    finally: Promise.resolve(rows).finally.bind(Promise.resolve(rows)),
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
        findFirst: (...args: unknown[]) => mockResultVersionsFindFirst(...args),
      },
    },
  },
}));

import { getPublicOfficialResultsPageData } from '@/lib/events/results/queries';

const BASE_EDITION = {
  editionId: 'edition-2026',
  editionLabel: '2026',
  editionSlug: 'ultra-valle-2026',
  visibility: 'published',
  organizerName: 'Ultra Valle Organization',
  startsAt: new Date('2026-05-17T06:00:00.000Z'),
  timezone: 'America/Mexico_City',
  city: 'Monterrey',
  state: 'Nuevo Leon',
  seriesSlug: 'ultra-valle',
  seriesName: 'Ultra Valle',
};

describe('public official results page query', () => {
  beforeEach(() => {
    mockSelect.mockReset();
    mockResultVersionsFindFirst.mockReset();
  });

  it('returns not_found when edition slug identity does not resolve', async () => {
    mockSelect.mockReturnValueOnce(createSelectChain([]));

    const result = await getPublicOfficialResultsPageData('missing-series', 'missing-edition');

    expect(result).toEqual({ state: 'not_found' });
    expect(mockResultVersionsFindFirst).not.toHaveBeenCalled();
  });

  it('returns not_finalized without exposing draft data', async () => {
    mockSelect.mockReturnValueOnce(createSelectChain([BASE_EDITION]));
    mockResultVersionsFindFirst.mockResolvedValueOnce(null);

    const result = await getPublicOfficialResultsPageData('ultra-valle', 'ultra-valle-2026');

    expect(result).toEqual({
      state: 'not_finalized',
      edition: BASE_EDITION,
    });
    expect(mockSelect).toHaveBeenCalledTimes(1);
  });

  it('keeps slug URL identity stable while active version advances from official to corrected', async () => {
    const officialEntries = [
      {
        entryId: 'entry-1',
        runnerFullName: 'Ana Runner',
        bibNumber: '101',
        discipline: 'trail_running',
        status: 'finish',
        finishTimeMillis: 3_720_000,
        overallPlace: 1,
        genderPlace: 1,
        ageGroupPlace: 1,
        distanceLabel: '50K',
      },
    ];

    const correctedEntries = [
      {
        entryId: 'entry-1',
        runnerFullName: 'Ana Runner',
        bibNumber: '101',
        discipline: 'trail_running',
        status: 'finish',
        finishTimeMillis: 3_700_000,
        overallPlace: 1,
        genderPlace: 1,
        ageGroupPlace: 1,
        distanceLabel: '50K',
      },
    ];

    mockSelect
      .mockReturnValueOnce(createSelectChain([BASE_EDITION]))
      .mockReturnValueOnce(createSelectChain(officialEntries))
      .mockReturnValueOnce(createSelectChain([BASE_EDITION]))
      .mockReturnValueOnce(createSelectChain(correctedEntries));

    mockResultVersionsFindFirst
      .mockResolvedValueOnce({
        id: 'version-4',
        status: 'official',
        versionNumber: 4,
        finalizedAt: new Date('2026-05-18T10:00:00.000Z'),
        updatedAt: new Date('2026-05-18T10:00:00.000Z'),
        createdAt: new Date('2026-05-18T10:00:00.000Z'),
      })
      .mockResolvedValueOnce({
        id: 'version-5',
        status: 'corrected',
        versionNumber: 5,
        finalizedAt: new Date('2026-05-19T09:00:00.000Z'),
        updatedAt: new Date('2026-05-19T09:00:00.000Z'),
        createdAt: new Date('2026-05-19T09:00:00.000Z'),
      });

    const official = await getPublicOfficialResultsPageData('ultra-valle', 'ultra-valle-2026');
    const corrected = await getPublicOfficialResultsPageData('ultra-valle', 'ultra-valle-2026');

    expect(official.state).toBe('official');
    expect(corrected.state).toBe('official');

    if (official.state !== 'official' || corrected.state !== 'official') return;

    expect(official.edition.seriesSlug).toBe('ultra-valle');
    expect(official.edition.editionSlug).toBe('ultra-valle-2026');
    expect(corrected.edition.seriesSlug).toBe('ultra-valle');
    expect(corrected.edition.editionSlug).toBe('ultra-valle-2026');
    expect(official.activeVersion.id).toBe('version-4');
    expect(corrected.activeVersion.id).toBe('version-5');
    expect(corrected.activeVersion.status).toBe('corrected');
    expect(corrected.entries[0]?.finishTimeMillis).toBe(3_700_000);
  });
});
