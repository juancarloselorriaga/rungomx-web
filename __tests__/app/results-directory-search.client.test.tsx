import { render, screen } from '@testing-library/react';

const mockListRecentPublicCorrectionSummaries = jest.fn();
const mockListPublicOfficialResultsDirectory = jest.fn();
const mockSearchPublicOfficialResultEntries = jest.fn();
const ORIGINAL_POLICY_MODE = process.env.RESULTS_PUBLIC_IDENTITY_POLICY_MODE;

jest.mock('@/lib/events/results/queries', () => ({
  listRecentPublicCorrectionSummaries: (...args: unknown[]) =>
    mockListRecentPublicCorrectionSummaries(...args),
  listPublicOfficialResultsDirectory: (...args: unknown[]) =>
    mockListPublicOfficialResultsDirectory(...args),
  searchPublicOfficialResultEntries: (...args: unknown[]) =>
    mockSearchPublicOfficialResultEntries(...args),
}));

jest.mock('@/utils/config-page-locale', () => ({
  configPageLocale: jest.fn(),
}));

jest.mock('@/config/url', () => ({
  siteUrl: 'https://example.com',
}));

jest.mock('@/i18n/routing', () => {
  const routing = {
    locales: ['es', 'en'] as const,
    defaultLocale: 'es',
    localePrefix: 'as-needed' as const,
    pathnames: {
      '/results': { es: '/resultados', en: '/results' },
      '/results/[seriesSlug]/[editionSlug]': {
        es: '/resultados/[seriesSlug]/[editionSlug]',
        en: '/results/[seriesSlug]/[editionSlug]',
      },
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

jest.mock('@/i18n/navigation', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

jest.mock('next-intl/server', () => ({
  getTranslations: async () =>
    (key: string, values?: Record<string, string | number>) =>
      values ? `${key} ${JSON.stringify(values)}` : key,
}));

import ResultsPage from '@/app/[locale]/(public)/results/page';

describe('results directory page search rendering', () => {
  beforeEach(() => {
    mockListRecentPublicCorrectionSummaries.mockReset();
    mockListPublicOfficialResultsDirectory.mockReset();
    mockSearchPublicOfficialResultEntries.mockReset();
    mockListRecentPublicCorrectionSummaries.mockResolvedValue([]);
    mockListPublicOfficialResultsDirectory.mockResolvedValue([]);
    delete process.env.RESULTS_PUBLIC_IDENTITY_POLICY_MODE;
  });

  afterAll(() => {
    if (ORIGINAL_POLICY_MODE === undefined) {
      delete process.env.RESULTS_PUBLIC_IDENTITY_POLICY_MODE;
      return;
    }

    process.env.RESULTS_PUBLIC_IDENTITY_POLICY_MODE = ORIGINAL_POLICY_MODE;
  });

  it('renders official search matches when name/bib filters are provided', async () => {
    mockSearchPublicOfficialResultEntries.mockResolvedValueOnce([
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

    const ui = await ResultsPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({ q: 'Ana', bib: '101' }),
    });
    render(ui);

    expect(screen.getByText('searchResults.title')).toBeInTheDocument();
    expect(screen.getByText('Ana Runner')).toBeInTheDocument();
    expect(screen.getAllByText('searchResults.openOfficial').length).toBeGreaterThan(0);
  });

  it('renders empty state when search executes with no official matches', async () => {
    mockSearchPublicOfficialResultEntries.mockResolvedValueOnce([]);

    const ui = await ResultsPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({ q: 'Unknown' }),
    });
    render(ui);

    expect(screen.getByText('searchResults.empty')).toBeInTheDocument();
  });

  it('enforces initials display mode when policy configuration changes', async () => {
    process.env.RESULTS_PUBLIC_IDENTITY_POLICY_MODE = 'initials_with_bib';
    mockSearchPublicOfficialResultEntries.mockResolvedValueOnce([
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
        activeVersionStatus: 'official',
        activeVersionNumber: 4,
      },
    ]);

    const ui = await ResultsPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({ q: 'Ana' }),
    });
    render(ui);

    expect(screen.getByText('A. R.')).toBeInTheDocument();
    expect(screen.queryByText('Ana Runner')).not.toBeInTheDocument();
  });
});
