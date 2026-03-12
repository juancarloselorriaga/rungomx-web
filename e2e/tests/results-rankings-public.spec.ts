import { randomUUID } from 'crypto';

import { expect, test, type Page } from '@playwright/test';
import * as schema from '@/db/schema';

import { getTestDb } from '../utils/db';

const seedSuffix = randomUUID().replace(/-/g, '').slice(0, 8);

const seededOfficialResult = {
  seriesSlug: `slice4-public-ultra-${seedSuffix}`,
  seriesName: 'Slice 4 Public Ultra',
  editionSlug: `slice4-public-ultra-2026-${seedSuffix}`,
  editionLabel: '2026',
  publicCode: `SLC4${seedSuffix.toUpperCase()}`,
  distanceLabel: '50K',
  runnerName: 'Ana Publica',
  bibNumber: '101',
} as const;

type LocaleSpec = {
  code: 'es' | 'en';
  acceptLanguage: string;
  results: {
    path: string;
    title: string;
    discoveryTitle: string;
    directoryTitle: string;
    searchNameLabel: string;
    searchBibLabel: string;
    searchAction: string;
    searchResultsTitle: string;
    openOfficial: string;
  };
  rankings: {
    path: string;
    title: string;
    scopeLabel: string;
    organizerLabel: string;
    applyLabel: string;
  };
  legal: {
    privacy: {
      path: string;
      title: string;
      summaryTitle: string;
      keySection: string;
    };
    terms: {
      path: string;
      title: string;
      summaryTitle: string;
      keySection: string;
    };
  };
  detail: {
    path: string;
    title: string;
    subtitle: string;
    trustScanTitle: string;
    tableTitle: string;
    versionLabel: string;
    statusLabel: string;
  };
};

const locales: readonly LocaleSpec[] = [
  {
    code: 'es',
    acceptLanguage: 'es-MX,es;q=0.9',
    results: {
      path: '/resultados',
      title: 'Resultados',
      discoveryTitle: 'Encontrar resultados oficiales',
      directoryTitle: 'Directorio de resultados oficiales',
      searchNameLabel: 'Nombre del corredor',
      searchBibLabel: 'Dorsal',
      searchAction: 'Buscar',
      searchResultsTitle: 'Coincidencias de búsqueda',
      openOfficial: 'Abrir página oficial',
    },
    rankings: {
      path: '/clasificaciones',
      title: 'Clasificaciones nacionales',
      scopeLabel: 'Alcance',
      organizerLabel: 'Organizador',
      applyLabel: 'Aplicar',
    },
    legal: {
      privacy: {
        path: '/privacidad',
        title: 'Cómo maneja RunGoMX tu información',
        summaryTitle: 'La versión corta',
        keySection: 'Información que recopilamos',
      },
      terms: {
        path: '/terminos',
        title: 'Términos para usar RunGoMX',
        summaryTitle: 'Qué buscan cubrir estos términos',
        keySection: 'Uso de la plataforma',
      },
    },
    detail: {
      path: `/resultados/${seededOfficialResult.seriesSlug}/${seededOfficialResult.editionSlug}`,
      title: `Resultados oficiales de ${seededOfficialResult.seriesName} ${seededOfficialResult.editionLabel}`,
      subtitle:
        'Esta URL estable siempre apunta a la publicación oficial o corregida más reciente de esta edición.',
      trustScanTitle: 'Escaneo de confianza',
      tableTitle: 'Filas del registro oficial',
      versionLabel: 'Versión 1',
      statusLabel: 'Oficial',
    },
  },
  {
    code: 'en',
    acceptLanguage: 'en-US,en;q=0.9',
    results: {
      path: '/en/results',
      title: 'Results',
      discoveryTitle: 'Find official results',
      directoryTitle: 'Official results directory',
      searchNameLabel: 'Runner name',
      searchBibLabel: 'Bib',
      searchAction: 'Search',
      searchResultsTitle: 'Search matches',
      openOfficial: 'Open official page',
    },
    rankings: {
      path: '/en/rankings',
      title: 'National Rankings',
      scopeLabel: 'Scope',
      organizerLabel: 'Organizer',
      applyLabel: 'Apply',
    },
    legal: {
      privacy: {
        path: '/en/privacy',
        title: 'How RunGoMX handles your information',
        summaryTitle: 'The short version',
        keySection: 'Information we collect',
      },
      terms: {
        path: '/en/terms',
        title: 'Terms for using RunGoMX',
        summaryTitle: 'What these terms are meant to cover',
        keySection: 'Using the platform',
      },
    },
    detail: {
      path: `/en/results/${seededOfficialResult.seriesSlug}/${seededOfficialResult.editionSlug}`,
      title: `${seededOfficialResult.seriesName} ${seededOfficialResult.editionLabel} Official Results`,
      subtitle:
        'This stable URL always points to the latest official or corrected publication for this edition.',
      trustScanTitle: 'Trust scan',
      tableTitle: 'Official ledger rows',
      versionLabel: 'Version 1',
      statusLabel: 'Official',
    },
  },
] as const;

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function seedPublicOfficialResult() {
  const db = getTestDb();
  const now = new Date('2026-05-18T10:00:00.000Z');
  const organizerId = randomUUID();
  const seriesId = randomUUID();
  const editionId = randomUUID();
  const distanceId = randomUUID();
  const versionId = randomUUID();

  await db.insert(schema.organizations).values({
    id: organizerId,
    name: 'Slice 4 Test Organization',
    // Keep seeded slugs/codes unique so Playwright retries do not fail on duplicate inserts.
    slug: `slice4-test-organization-${seedSuffix}`,
  });

  await db.insert(schema.eventSeries).values({
    id: seriesId,
    organizationId: organizerId,
    slug: seededOfficialResult.seriesSlug,
    name: seededOfficialResult.seriesName,
    sportType: 'trail-running',
    status: 'active',
    primaryLocale: 'es',
  });

  await db.insert(schema.eventEditions).values({
    id: editionId,
    seriesId,
    editionLabel: seededOfficialResult.editionLabel,
    publicCode: seededOfficialResult.publicCode,
    slug: seededOfficialResult.editionSlug,
    visibility: 'published',
    startsAt: new Date('2026-05-17T06:00:00.000Z'),
    timezone: 'America/Mexico_City',
    city: 'Monterrey',
    state: 'Nuevo Leon',
    country: 'MX',
    primaryLocale: 'es',
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(schema.eventDistances).values({
    id: distanceId,
    editionId,
    label: seededOfficialResult.distanceLabel,
    distanceValue: '50.00',
    distanceUnit: 'km',
    kind: 'distance',
    terrain: 'trail',
    sortOrder: 1,
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(schema.resultVersions).values({
    id: versionId,
    editionId,
    status: 'official',
    source: 'manual_offline',
    versionNumber: 1,
    finalizedAt: now,
    sourceReference: `slice4-public-smoke-${seedSuffix}`,
    provenanceJson: {
      seededBy: `slice4-public-smoke-${seedSuffix}`,
    },
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(schema.resultEntries).values({
    id: randomUUID(),
    resultVersionId: versionId,
    distanceId,
    discipline: 'trail_running',
    runnerFullName: seededOfficialResult.runnerName,
    bibNumber: seededOfficialResult.bibNumber,
    gender: 'female',
    age: 31,
    status: 'finish',
    finishTimeMillis: 3_700_000,
    overallPlace: 1,
    genderPlace: 1,
    ageGroupPlace: 1,
    identitySnapshot: {
      seed: `slice4-public-smoke-${seedSuffix}`,
    },
    rawSourceData: {
      lane: 'manual_offline',
    },
    createdAt: now,
    updatedAt: now,
  });
}

async function openLocalizedRoute(page: Page, locale: LocaleSpec, path: string, heading: string) {
  await page.context().setExtraHTTPHeaders({ 'Accept-Language': locale.acceptLanguage });
  await page.goto(path, { waitUntil: 'domcontentloaded' });

  await expect(page).toHaveURL(new RegExp(`${escapeRegex(path)}(?:$|[?#])`));
  expect(new URL(page.url()).pathname).toBe(path);
  await expect(page.getByRole('heading', { level: 1, name: heading, exact: true })).toBeVisible();
  await expect(page.locator('main')).toBeVisible();
}

test.describe('Public Results + Rankings', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await seedPublicOfficialResult();
  });

  for (const locale of locales) {
    test(`${locale.code} results route renders live discovery and search coverage`, async ({ page }) => {
      await openLocalizedRoute(page, locale, locale.results.path, locale.results.title);

      await expect(
        page.getByRole('heading', { level: 2, name: locale.results.discoveryTitle, exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('heading', { level: 2, name: locale.results.directoryTitle, exact: true }),
      ).toBeVisible();
      await expect(page.getByLabel(locale.results.searchNameLabel, { exact: true })).toBeVisible();
      await expect(page.getByLabel(locale.results.searchBibLabel, { exact: true })).toBeVisible();

      await page.getByLabel(locale.results.searchNameLabel, { exact: true }).fill(seededOfficialResult.runnerName);
      await page.getByLabel(locale.results.searchBibLabel, { exact: true }).fill(seededOfficialResult.bibNumber);
      await page.getByRole('button', { name: locale.results.searchAction, exact: true }).click();

      await expect(page).toHaveURL(new RegExp(`${escapeRegex(locale.results.path)}\\?`));
      await expect
        .poll(() => new URL(page.url()).searchParams.get('q'))
        .toBe(seededOfficialResult.runnerName);
      await expect
        .poll(() => new URL(page.url()).searchParams.get('bib'))
        .toBe(seededOfficialResult.bibNumber);

      await expect(
        page.getByRole('heading', {
          level: 2,
          name: locale.results.searchResultsTitle,
          exact: true,
        }),
      ).toBeVisible();
      const searchResultsSection = page
        .locator('section')
        .filter({
          has: page.getByRole('heading', {
            level: 2,
            name: locale.results.searchResultsTitle,
            exact: true,
          }),
        })
        .first();
      const seededResultRow = searchResultsSection.locator('li').filter({
        hasText: seededOfficialResult.runnerName,
      });

      await expect(seededResultRow).toContainText(seededOfficialResult.runnerName);
      await expect(seededResultRow).toContainText(new RegExp(`\\b${escapeRegex(seededOfficialResult.bibNumber)}\\b`));
      await expect(
        seededResultRow.getByRole('link', { name: locale.results.openOfficial, exact: true }),
      ).toHaveAttribute('href', locale.detail.path);
    });

    test(`${locale.code} rankings route keeps localized filter behavior distinct from results`, async ({
      page,
    }) => {
      await openLocalizedRoute(page, locale, locale.rankings.path, locale.rankings.title);

      const scopeSelect = page.getByRole('combobox', { name: new RegExp(`^${escapeRegex(locale.rankings.scopeLabel)}$`) });
      const organizerSelect = page.getByRole('combobox', {
        name: new RegExp(`^${escapeRegex(locale.rankings.organizerLabel)}$`),
      });

      await expect(scopeSelect).toBeVisible();
      await expect(organizerSelect).toBeVisible();
      await expect(
        page.getByRole('heading', {
          level: 2,
          name: locale.results.discoveryTitle,
          exact: true,
        }),
      ).toHaveCount(0);

      await scopeSelect.selectOption('organizer');
      await page.getByRole('button', { name: locale.rankings.applyLabel, exact: true }).click();

      await expect(page).toHaveURL(new RegExp(`${escapeRegex(locale.rankings.path)}\\?`));
      await expect
        .poll(() => new URL(page.url()).searchParams.get('scope'))
        .toBe('organizer');
      await expect(scopeSelect).toHaveValue('organizer');
      await expect(page.getByRole('heading', { level: 1, name: locale.rankings.title, exact: true })).toBeVisible();
    });

    test(`${locale.code} legal routes stay publicly reachable on privacy and terms`, async ({ page }) => {
      await openLocalizedRoute(page, locale, locale.legal.privacy.path, locale.legal.privacy.title);
      await expect(
        page.getByRole('heading', { name: locale.legal.privacy.summaryTitle, exact: true }),
      ).toBeVisible();
      await expect(page.getByRole('heading', { name: locale.legal.privacy.keySection, exact: true })).toBeVisible();

      await openLocalizedRoute(page, locale, locale.legal.terms.path, locale.legal.terms.title);
      await expect(
        page.getByRole('heading', { name: locale.legal.terms.summaryTitle, exact: true }),
      ).toBeVisible();
      await expect(page.getByRole('heading', { name: locale.legal.terms.keySection, exact: true })).toBeVisible();
    });

    test(`${locale.code} official result-detail route renders as a live public page`, async ({ page }) => {
      await openLocalizedRoute(page, locale, locale.detail.path, locale.detail.title);

      await expect(page.getByText(locale.detail.subtitle, { exact: true })).toBeVisible();
      await expect(
        page.getByRole('heading', { level: 2, name: locale.detail.trustScanTitle, exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('heading', { level: 2, name: locale.detail.tableTitle, exact: true }),
      ).toBeVisible();
      await expect(page.getByText(locale.detail.versionLabel, { exact: true })).toBeVisible();
      await expect(page.getByText(locale.detail.statusLabel, { exact: true }).first()).toBeVisible();
      await expect(page.getByRole('cell', { name: seededOfficialResult.bibNumber, exact: true })).toBeVisible();
      await expect(page.getByRole('cell', { name: seededOfficialResult.distanceLabel, exact: true })).toBeVisible();
    });
  }
});
