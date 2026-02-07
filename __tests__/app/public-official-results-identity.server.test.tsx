import { renderToStaticMarkup } from 'react-dom/server';

const mockGetPublicOfficialResultsPageData = jest.fn();
const ORIGINAL_POLICY_MODE = process.env.RESULTS_PUBLIC_IDENTITY_POLICY_MODE;

jest.mock('@/lib/events/results/queries', () => ({
  getPublicOfficialResultsPageData: (...args: unknown[]) =>
    mockGetPublicOfficialResultsPageData(...args),
}));

jest.mock('@/utils/config-page-locale', () => ({
  configPageLocale: jest.fn(),
}));

jest.mock('@/i18n/navigation', () => ({
  Link: ({ children }: { children: unknown }) => <a>{children}</a>,
}));

jest.mock('@/i18n/routing', () => {
  const routing = {
    locales: ['es', 'en'] as const,
    defaultLocale: 'es',
    localePrefix: 'as-needed' as const,
    pathnames: {
      '/results/[seriesSlug]/[editionSlug]': {
        es: '/resultados/[seriesSlug]/[editionSlug]',
        en: '/results/[seriesSlug]/[editionSlug]',
      },
      '/results/how-it-works': {
        es: '/resultados/como-funciona',
        en: '/results/how-it-works',
      },
      '/events/[seriesSlug]/[editionSlug]': {
        es: '/eventos/[seriesSlug]/[editionSlug]',
        en: '/events/[seriesSlug]/[editionSlug]',
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

jest.mock('next-intl/server', () => ({
  getTranslations: async () =>
    (key: string, values?: Record<string, string | number>) =>
      values ? `${key} ${JSON.stringify(values)}` : key,
  setRequestLocale: jest.fn(),
}));

import PublicOfficialResultsPage from '@/app/[locale]/(public)/results/[seriesSlug]/[editionSlug]/page';

const OFFICIAL_PAGE_DATA = {
  state: 'official' as const,
  edition: {
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
  },
  activeVersion: {
    id: 'version-4',
    status: 'official' as const,
    versionNumber: 4,
    finalizedAt: new Date('2026-05-18T10:00:00.000Z'),
    updatedAt: new Date('2026-05-18T10:00:00.000Z'),
  },
  entries: [
    {
      id: 'entry-1',
      runnerFullName: 'Ana Runner',
      bibNumber: '101',
      discipline: 'trail_running' as const,
      status: 'finish' as const,
      finishTimeMillis: 3_700_000,
      overallPlace: 1,
      genderPlace: 1,
      ageGroupPlace: 1,
      distanceLabel: '50K',
    },
  ],
};

describe('public official results identity display policy', () => {
  beforeEach(() => {
    mockGetPublicOfficialResultsPageData.mockReset();
    mockGetPublicOfficialResultsPageData.mockResolvedValue(OFFICIAL_PAGE_DATA);
    delete process.env.RESULTS_PUBLIC_IDENTITY_POLICY_MODE;
  });

  afterAll(() => {
    if (ORIGINAL_POLICY_MODE === undefined) {
      delete process.env.RESULTS_PUBLIC_IDENTITY_POLICY_MODE;
      return;
    }

    process.env.RESULTS_PUBLIC_IDENTITY_POLICY_MODE = ORIGINAL_POLICY_MODE;
  });

  it('shows full name under the baseline policy', async () => {
    const ui = await PublicOfficialResultsPage({
      params: Promise.resolve({
        locale: 'en',
        seriesSlug: 'ultra-valle',
        editionSlug: 'ultra-valle-2026',
      }),
    });
    const html = renderToStaticMarkup(ui);

    expect(html).toContain('Ana Runner');
    expect(html).toContain('101');
  });

  it('masks full name when policy switches to bib-only mode', async () => {
    process.env.RESULTS_PUBLIC_IDENTITY_POLICY_MODE = 'bib_only';

    const ui = await PublicOfficialResultsPage({
      params: Promise.resolve({
        locale: 'en',
        seriesSlug: 'ultra-valle',
        editionSlug: 'ultra-valle-2026',
      }),
    });
    const html = renderToStaticMarkup(ui);

    expect(html).toContain('Runner');
    expect(html).toContain('101');
    expect(html).not.toContain('Ana Runner');
  });
});
