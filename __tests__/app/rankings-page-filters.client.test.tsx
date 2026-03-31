import { render, screen } from '@testing-library/react';

const mockGetPublicRankingLeaderboard = jest.fn();

jest.mock('@/lib/events/results/rankings', () => ({
  getPublicRankingLeaderboard: (...args: unknown[]) => mockGetPublicRankingLeaderboard(...args),
}));

jest.mock('@/utils/config-page-locale', () => ({
  configPageLocale: jest.fn(),
}));

jest.mock('@/config/url', () => ({
  siteUrl: 'https://example.com',
}));

jest.mock('@/i18n/navigation', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

jest.mock('@/i18n/routing', () => {
  const routing = {
    locales: ['es', 'en'] as const,
    defaultLocale: 'es',
    localePrefix: 'as-needed' as const,
    pathnames: {
      '/rankings': { es: '/clasificaciones', en: '/rankings' },
    },
  };

  type AppLocale = (typeof routing)['locales'][number];

  return {
    __esModule: true,
    routing,
    DEFAULT_TIMEZONE: 'America/Mexico_City',
    AppLocale: undefined as unknown as AppLocale,
  };
});

jest.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string, values?: Record<string, string | number>) =>
    values ? `${key} ${JSON.stringify(values)}` : key,
  setRequestLocale: jest.fn(),
}));

import RankingsPage from '@/app/[locale]/(public)/rankings/page';

describe('rankings page filter URL behavior', () => {
  beforeEach(() => {
    mockGetPublicRankingLeaderboard.mockReset();
    mockGetPublicRankingLeaderboard.mockResolvedValue({
      state: 'ready',
      snapshot: {
        id: 'snapshot-1',
        rulesetVersionTag: 'v1.3.0',
        rulesetReference: 'https://example.com/rulesets/v1-3-0',
        generatedAt: new Date('2026-08-12T10:00:00.000Z'),
        promotedAt: new Date('2026-08-12T10:00:00.000Z'),
        rowCount: 1,
        isCurrent: true,
        scope: 'national',
        organizationId: null,
        organizationName: null,
      },
      filters: {
        scope: 'national',
        organizationId: null,
        snapshotId: 'snapshot-1',
        discipline: 'trail_running',
        gender: 'female',
        ageGroup: '25-34',
        availableOrganizers: [],
        availableSnapshots: [
          {
            snapshotId: 'snapshot-1',
            rulesetVersionTag: 'v1.3.0',
            promotedAt: new Date('2026-08-12T10:00:00.000Z'),
            generatedAt: new Date('2026-08-12T10:00:00.000Z'),
            isCurrent: true,
          },
        ],
        availableDisciplines: ['trail_running'],
        availableGenders: ['female'],
        availableAgeGroups: ['25-34'],
      },
      rows: [
        {
          rank: 1,
          runnerFullName: 'Ana Runner',
          bibNumber: '101',
          discipline: 'trail_running',
          gender: 'female',
          age: 31,
          ageGroup: '25-34',
          finishTimeMillis: 3_600_000,
        },
      ],
    });
  });

  it('reads URL search params and renders national ranking rows', async () => {
    const ui = await RankingsPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({
        discipline: 'trail_running',
        gender: 'female',
        ageGroup: '25-34',
        scope: 'national',
        organizationId: '',
        snapshotId: 'snapshot-1',
      }),
    });
    render(ui);

    expect(mockGetPublicRankingLeaderboard).toHaveBeenCalledWith({
      discipline: 'trail_running',
      gender: 'female',
      ageGroup: '25-34',
      scope: 'national',
      organizationId: '',
      snapshotId: 'snapshot-1',
    });
    expect(screen.getByText('Ana Runner')).toBeInTheDocument();
    expect(screen.getByText('table.title')).toBeInTheDocument();
    expect(screen.getByText(/snapshot\.summary/)).toBeInTheDocument();
    expect(screen.getByText('reproducibility.referenceLink')).toBeInTheDocument();
    expect(screen.getByText('runnerGrouping.title')).toBeInTheDocument();
    expect(screen.getByText('runnerGrouping.description')).toBeInTheDocument();
    expect(screen.getByText('runnerGrouping.support')).toBeInTheDocument();
  });

  it('switches to organizer scope from URL params without mixing national context', async () => {
    mockGetPublicRankingLeaderboard.mockResolvedValueOnce({
      state: 'ready',
      snapshot: {
        id: 'snapshot-org-1',
        rulesetVersionTag: 'v1.4.0',
        rulesetReference: null,
        generatedAt: new Date('2026-08-12T10:00:00.000Z'),
        promotedAt: new Date('2026-08-12T10:00:00.000Z'),
        rowCount: 1,
        isCurrent: false,
        scope: 'organizer',
        organizationId: 'org-1',
        organizationName: 'Ultra Valle Org',
      },
      filters: {
        scope: 'organizer',
        organizationId: 'org-1',
        snapshotId: 'snapshot-org-1',
        discipline: null,
        gender: null,
        ageGroup: null,
        availableOrganizers: [{ organizationId: 'org-1', organizationName: 'Ultra Valle Org' }],
        availableSnapshots: [
          {
            snapshotId: 'snapshot-org-1',
            rulesetVersionTag: 'v1.4.0',
            promotedAt: new Date('2026-08-12T10:00:00.000Z'),
            generatedAt: new Date('2026-08-12T10:00:00.000Z'),
            isCurrent: false,
          },
        ],
        availableDisciplines: ['trail_running'],
        availableGenders: ['female'],
        availableAgeGroups: ['25-34'],
      },
      rows: [
        {
          rank: 1,
          runnerFullName: 'Ana Runner',
          bibNumber: '101',
          discipline: 'trail_running',
          gender: 'female',
          age: 31,
          ageGroup: '25-34',
          finishTimeMillis: 3_600_000,
        },
      ],
    });

    const ui = await RankingsPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({
        scope: 'organizer',
        organizationId: 'org-1',
        snapshotId: 'snapshot-org-1',
      }),
    });
    render(ui);

    expect(mockGetPublicRankingLeaderboard).toHaveBeenCalledWith({
      discipline: undefined,
      gender: undefined,
      ageGroup: undefined,
      scope: 'organizer',
      organizationId: 'org-1',
      snapshotId: 'snapshot-org-1',
    });
    expect(
      screen.getByText('scope.contextOrg {"organization":"Ultra Valle Org"}'),
    ).toBeInTheDocument();
    expect(screen.getByText('snapshot.historical')).toBeInTheDocument();
    expect(screen.getByText('reproducibility.referenceMissing')).toBeInTheDocument();
  });
});
