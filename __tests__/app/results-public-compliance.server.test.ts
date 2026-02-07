import fs from 'node:fs';
import path from 'node:path';

const mockGetPublicOfficialResultsPageData = jest.fn();

jest.mock('@/lib/events/results/queries', () => ({
  getPublicOfficialResultsPageData: (...args: unknown[]) =>
    mockGetPublicOfficialResultsPageData(...args),
}));

jest.mock('@/config/url', () => ({
  siteUrl: 'https://example.com',
}));

jest.mock('@/utils/config-page-locale', () => ({
  configPageLocale: jest.fn(),
}));

jest.mock('@/i18n/navigation', () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/i18n/routing', () => {
  const routing = {
    locales: ['es', 'en'] as const,
    defaultLocale: 'es',
    localePrefix: 'as-needed' as const,
    pathnames: {
      '/results': { es: '/resultados', en: '/results' },
      '/results/how-it-works': {
        es: '/resultados/como-funciona',
        en: '/results/how-it-works',
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
    DEFAULT_TIMEZONE: 'America/Mexico_City',
    AppLocale: undefined as unknown as AppLocale,
  };
});

jest.mock('next-intl/server', () => ({
  getTranslations: jest.fn(),
  setRequestLocale: jest.fn(),
}));

import { generateMetadata as generateResultsMetadata } from '@/app/[locale]/(public)/results/page';
import { generateMetadata as generateHowItWorksMetadata } from '@/app/[locale]/(public)/results/how-it-works/page';
import { generateMetadata as generateOfficialMetadata } from '@/app/[locale]/(public)/results/[seriesSlug]/[editionSlug]/page';

const REQUIRED_RESULTS_TRUST_KEYS = [
  'howItWorks.panel.title',
  'howItWorks.panel.description',
  'howItWorks.panel.point1',
  'howItWorks.panel.point2',
  'howItWorks.panel.point3',
  'howItWorks.panel.cta',
  'howItWorks.explainer.title',
  'howItWorks.explainer.description',
  'howItWorks.explainer.officialMeaning.title',
  'howItWorks.explainer.correctionProcess.title',
  'howItWorks.explainer.rankingsRules.title',
  'official.trustScan.title',
  'official.trustScan.description',
  'official.trustScan.fields.organizer',
  'official.trustScan.fields.scope',
  'official.trustScan.fields.version',
  'official.trustScan.fields.updatedAt',
  'official.trustScan.fields.correction',
  'official.trustScan.status.unknown',
  'official.trustScan.correction.corrected',
  'official.trustScan.correction.none',
] as const;

function readResultsMessages(locale: 'en' | 'es'): unknown {
  const filePath = path.join(process.cwd(), `messages/pages/results/${locale}.json`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function hasObjectKeyPath(data: unknown, keyPath: string): boolean {
  if (!data || typeof data !== 'object') return false;

  return keyPath.split('.').every((segment) => {
    if (!data || typeof data !== 'object' || !(segment in data)) return false;
    data = (data as Record<string, unknown>)[segment];
    return true;
  });
}

describe('results public i18n + SEO compliance suite', () => {
  beforeEach(() => {
    mockGetPublicOfficialResultsPageData.mockReset();
  });

  it('fails when required trust-scan and explainer keys are missing in en/es locales', () => {
    const locales: Array<'en' | 'es'> = ['en', 'es'];

    for (const locale of locales) {
      const messages = readResultsMessages(locale);

      for (const keyPath of REQUIRED_RESULTS_TRUST_KEYS) {
        expect(
          hasObjectKeyPath(messages, keyPath),
        ).toBe(true);
      }
    }
  });

  it('enforces canonical/hreflang/indexability rules on official public metadata routes', async () => {
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

    const resultsMetadata = await generateResultsMetadata({
      params: Promise.resolve({ locale: 'es' as const }),
    });
    expect(resultsMetadata.alternates?.canonical).toBe('https://example.com/resultados');
    expect(resultsMetadata.alternates?.languages?.en).toBe('https://example.com/en/results');
    expect(resultsMetadata.robots).toBeUndefined();

    const explainerMetadata = await generateHowItWorksMetadata({
      params: Promise.resolve({ locale: 'en' as const }),
    });
    expect(explainerMetadata.alternates?.canonical).toBe(
      'https://example.com/en/results/how-it-works',
    );
    expect(explainerMetadata.alternates?.languages?.es).toBe(
      'https://example.com/resultados/como-funciona',
    );
    expect(explainerMetadata.robots).toBeUndefined();

    const officialMetadata = await generateOfficialMetadata({
      params: Promise.resolve({
        locale: 'en' as const,
        seriesSlug: 'ultra-valle',
        editionSlug: 'ultra-valle-2026',
      }),
    });
    expect(officialMetadata.alternates?.canonical).toBe(
      'https://example.com/en/results/ultra-valle/ultra-valle-2026',
    );
    expect(officialMetadata.alternates?.languages?.es).toBe(
      'https://example.com/resultados/ultra-valle/ultra-valle-2026',
    );
    expect(officialMetadata.robots).toBeUndefined();

    const notFinalizedMetadata = await generateOfficialMetadata({
      params: Promise.resolve({
        locale: 'en' as const,
        seriesSlug: 'ultra-valle',
        editionSlug: 'ultra-valle-2026',
      }),
    });
    expect(notFinalizedMetadata.robots).toEqual({ index: false, follow: false });
  });
});
