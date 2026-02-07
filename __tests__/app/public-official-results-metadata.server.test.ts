const mockGetPublicOfficialResultsPageData = jest.fn();

jest.mock('@/lib/events/results/queries', () => ({
  getPublicOfficialResultsPageData: (...args: unknown[]) =>
    mockGetPublicOfficialResultsPageData(...args),
}));

jest.mock('@/i18n/navigation', () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
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

jest.mock('next-intl/server', () => ({
  getTranslations: jest.fn(),
  setRequestLocale: jest.fn(),
}));

import { generateMetadata } from '@/app/[locale]/(public)/results/[seriesSlug]/[editionSlug]/page';

describe('public official results metadata', () => {
  beforeEach(() => {
    mockGetPublicOfficialResultsPageData.mockReset();
  });

  it('keeps canonical URL stable when official version advances to corrected', async () => {
    mockGetPublicOfficialResultsPageData
      .mockResolvedValueOnce({
        state: 'official',
        edition: {
          editionId: 'edition-1',
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
          status: 'official',
          versionNumber: 4,
          finalizedAt: new Date('2026-05-18T10:00:00.000Z'),
          updatedAt: new Date('2026-05-18T10:00:00.000Z'),
        },
        entries: [],
      })
      .mockResolvedValueOnce({
        state: 'official',
        edition: {
          editionId: 'edition-1',
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
          id: 'version-5',
          status: 'corrected',
          versionNumber: 5,
          finalizedAt: new Date('2026-05-19T09:00:00.000Z'),
          updatedAt: new Date('2026-05-19T09:00:00.000Z'),
        },
        entries: [],
      });

    const params = Promise.resolve({
      locale: 'es' as const,
      seriesSlug: 'ultra-valle',
      editionSlug: 'ultra-valle-2026',
    });

    const metadataForOfficial = await generateMetadata({ params });
    const metadataForCorrected = await generateMetadata({ params });

    expect(metadataForOfficial.alternates?.canonical).toBe(
      metadataForCorrected.alternates?.canonical,
    );
    expect(metadataForOfficial.alternates?.canonical).toContain(
      '/resultados/ultra-valle/ultra-valle-2026',
    );
    expect(metadataForOfficial.alternates?.languages?.en).toContain(
      '/en/results/ultra-valle/ultra-valle-2026',
    );
    expect(metadataForOfficial.robots).toBeUndefined();
    expect(metadataForCorrected.robots).toBeUndefined();
    expect(mockGetPublicOfficialResultsPageData).toHaveBeenNthCalledWith(
      1,
      'ultra-valle',
      'ultra-valle-2026',
      { entryLimit: 1 },
    );
  });

  it('applies noindex metadata when edition is not finalized', async () => {
    mockGetPublicOfficialResultsPageData.mockResolvedValueOnce({
      state: 'not_finalized',
      edition: {
        editionId: 'edition-1',
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
    });

    const metadata = await generateMetadata({
      params: Promise.resolve({
        locale: 'en' as const,
        seriesSlug: 'ultra-valle',
        editionSlug: 'ultra-valle-2026',
      }),
    });

    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(metadata.alternates?.canonical).toContain('/en/results/ultra-valle/ultra-valle-2026');
  });
});
