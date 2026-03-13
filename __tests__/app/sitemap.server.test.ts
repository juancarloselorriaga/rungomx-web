const mockGetPublishedEventRoutesForSitemap = jest.fn();
const mockGetPublicOfficialResultsPageData = jest.fn();

jest.mock('@/config/url', () => ({
  siteUrl: 'https://example.com',
}));

jest.mock('@/i18n/routing', () => {
  const routing = {
    locales: ['es', 'en'] as const,
    defaultLocale: 'es',
    localePrefix: 'as-needed' as const,
    pathnames: {
      '/rankings': {
        es: '/clasificaciones',
        en: '/rankings',
      },
      '/events/[seriesSlug]/[editionSlug]': {
        es: '/eventos/[seriesSlug]/[editionSlug]',
        en: '/events/[seriesSlug]/[editionSlug]',
      },
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
    AppLocale: undefined as unknown as AppLocale,
  };
});

jest.mock('@/lib/events/queries', () => ({
  getPublishedEventRoutesForSitemap: (...args: unknown[]) =>
    mockGetPublishedEventRoutesForSitemap(...args),
  getPublicOfficialResultsPageData: (...args: unknown[]) =>
    mockGetPublicOfficialResultsPageData(...args),
}));

import sitemap from '@/app/sitemap';

describe('sitemap', () => {
  beforeEach(() => {
    mockGetPublishedEventRoutesForSitemap.mockReset();
    mockGetPublicOfficialResultsPageData.mockReset();
  });

  it('includes rankings and only indexable public official result-detail routes', async () => {
    mockGetPublishedEventRoutesForSitemap.mockResolvedValue([
      {
        seriesSlug: 'ultra-valle',
        editionSlug: 'ultra-valle-2026',
        updatedAt: new Date('2026-05-18T10:00:00.000Z'),
      },
      {
        seriesSlug: 'draft-run',
        editionSlug: 'draft-run-2026',
        updatedAt: new Date('2026-06-01T10:00:00.000Z'),
      },
      {
        seriesSlug: 'secret-run',
        editionSlug: 'secret-run-2026',
        updatedAt: new Date('2026-07-01T10:00:00.000Z'),
      },
    ]);

    mockGetPublicOfficialResultsPageData.mockImplementation(
      async (seriesSlug: string, editionSlug: string) => {
        if (seriesSlug === 'ultra-valle' && editionSlug === 'ultra-valle-2026') {
          return {
            state: 'official' as const,
            edition: {
              editionId: 'edition-1',
              editionLabel: '2026',
              editionSlug,
              visibility: 'published' as const,
              organizerName: 'Ultra Valle Organization',
              startsAt: new Date('2026-05-17T06:00:00.000Z'),
              timezone: 'America/Mexico_City',
              city: 'Monterrey',
              state: 'Nuevo Leon',
              seriesSlug,
              seriesName: 'Ultra Valle',
            },
            activeVersion: {
              id: 'version-4',
              status: 'official' as const,
              versionNumber: 4,
              finalizedAt: new Date('2026-05-18T10:00:00.000Z'),
              updatedAt: new Date('2026-05-18T10:00:00.000Z'),
            },
            entries: [],
          };
        }

        if (seriesSlug === 'secret-run' && editionSlug === 'secret-run-2026') {
          return {
            state: 'official' as const,
            edition: {
              editionId: 'edition-2',
              editionLabel: '2026',
              editionSlug,
              visibility: 'unlisted' as const,
              organizerName: 'Secret Run Organization',
              startsAt: new Date('2026-07-01T06:00:00.000Z'),
              timezone: 'America/Mexico_City',
              city: 'Saltillo',
              state: 'Coahuila',
              seriesSlug,
              seriesName: 'Secret Run',
            },
            activeVersion: {
              id: 'version-5',
              status: 'corrected' as const,
              versionNumber: 5,
              finalizedAt: new Date('2026-07-02T10:00:00.000Z'),
              updatedAt: new Date('2026-07-02T10:00:00.000Z'),
            },
            entries: [],
          };
        }

        return {
          state: 'not_finalized' as const,
          edition: {
            editionId: 'edition-3',
            editionLabel: '2026',
            editionSlug,
            visibility: 'published' as const,
            organizerName: 'Draft Run Organization',
            startsAt: new Date('2026-06-01T06:00:00.000Z'),
            timezone: 'America/Mexico_City',
            city: 'Guadalajara',
            state: 'Jalisco',
            seriesSlug,
            seriesName: 'Draft Run',
          },
        };
      },
    );

    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);
    const officialResultsEntry = entries.find(
      (entry) => entry.url === 'https://example.com/resultados/ultra-valle/ultra-valle-2026',
    );

    expect(urls).toContain('https://example.com/clasificaciones');
    expect(urls).toContain('https://example.com/en/rankings');
    expect(officialResultsEntry).toEqual(
      expect.objectContaining({
        url: 'https://example.com/resultados/ultra-valle/ultra-valle-2026',
        alternates: {
          languages: {
            es: 'https://example.com/resultados/ultra-valle/ultra-valle-2026',
            en: 'https://example.com/en/results/ultra-valle/ultra-valle-2026',
          },
        },
      }),
    );
    expect(urls).not.toContain('https://example.com/resultados/draft-run/draft-run-2026');
    expect(urls).not.toContain('https://example.com/resultados/secret-run/secret-run-2026');
    expect(mockGetPublicOfficialResultsPageData).toHaveBeenCalledWith(
      'ultra-valle',
      'ultra-valle-2026',
      { entryLimit: 1 },
    );
    expect(mockGetPublicOfficialResultsPageData).toHaveBeenCalledWith(
      'draft-run',
      'draft-run-2026',
      { entryLimit: 1 },
    );
    expect(mockGetPublicOfficialResultsPageData).toHaveBeenCalledWith(
      'secret-run',
      'secret-run-2026',
      { entryLimit: 1 },
    );
  });
});
