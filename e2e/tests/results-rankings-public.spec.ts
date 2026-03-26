import { randomUUID } from 'crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

type ResultsMessages = {
  title: string;
  discovery: {
    title: string;
    searchNameLabel: string;
    searchBibLabel: string;
    searchAction: string;
  };
  directory: {
    title: string;
    openOfficial: string;
  };
  searchResults: {
    title: string;
  };
  official: {
    title: string;
    subtitle: string;
    status: {
      official: string;
    };
    version: string;
    trustScan: {
      title: string;
    };
    table: {
      title: string;
    };
  };
};

type RankingsMessages = {
  title: string;
  filters: {
    scope: string;
    organization: string;
    apply: string;
  };
};

type PrivacyMessages = {
  hero: {
    title: string;
  };
  summary: {
    title: string;
  };
  sections: {
    items: {
      informationWeCollect: {
        title: string;
      };
    };
  };
};

type TermsMessages = {
  hero: {
    title: string;
  };
  summary: {
    title: string;
  };
  sections: {
    items: {
      usingThePlatform: {
        title: string;
      };
    };
  };
};

function loadJsonFile<T>(relativePath: string): T {
  return JSON.parse(readFileSync(join(process.cwd(), relativePath), 'utf8')) as T;
}

function formatMessage(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`));
}

function createLocaleSpec(code: 'es' | 'en'): LocaleSpec {
  const results = loadJsonFile<ResultsMessages>(`messages/pages/results/${code}.json`);
  const rankings = loadJsonFile<RankingsMessages>(`messages/pages/rankings/${code}.json`);
  const privacy = loadJsonFile<PrivacyMessages>(`messages/pages/privacy/${code}.json`);
  const terms = loadJsonFile<TermsMessages>(`messages/pages/terms/${code}.json`);

  return {
    code,
    acceptLanguage: code === 'es' ? 'es-MX,es;q=0.9' : 'en-US,en;q=0.9',
    results: {
      path: code === 'es' ? '/resultados' : '/en/results',
      title: results.title,
      discoveryTitle: results.discovery.title,
      directoryTitle: results.directory.title,
      searchNameLabel: results.discovery.searchNameLabel,
      searchBibLabel: results.discovery.searchBibLabel,
      searchAction: results.discovery.searchAction,
      searchResultsTitle: results.searchResults.title,
      openOfficial: results.directory.openOfficial,
    },
    rankings: {
      path: code === 'es' ? '/clasificaciones' : '/en/rankings',
      title: rankings.title,
      scopeLabel: rankings.filters.scope,
      organizerLabel: rankings.filters.organization,
      applyLabel: rankings.filters.apply,
    },
    legal: {
      privacy: {
        path: code === 'es' ? '/privacidad' : '/en/privacy',
        title: privacy.hero.title,
        summaryTitle: privacy.summary.title,
        keySection: privacy.sections.items.informationWeCollect.title,
      },
      terms: {
        path: code === 'es' ? '/terminos' : '/en/terms',
        title: terms.hero.title,
        summaryTitle: terms.summary.title,
        keySection: terms.sections.items.usingThePlatform.title,
      },
    },
    detail: {
      path:
        code === 'es'
          ? `/resultados/${seededOfficialResult.seriesSlug}/${seededOfficialResult.editionSlug}`
          : `/en/results/${seededOfficialResult.seriesSlug}/${seededOfficialResult.editionSlug}`,
      title: formatMessage(results.official.title ?? '', {
        seriesName: seededOfficialResult.seriesName,
        editionLabel: seededOfficialResult.editionLabel,
      }),
      subtitle: results.official.subtitle,
      trustScanTitle: results.official.trustScan.title,
      tableTitle: results.official.table.title,
      versionLabel: formatMessage(results.official.version, { versionNumber: 1 }),
      statusLabel: results.official.status.official,
    },
  };
}

const locales: readonly LocaleSpec[] = [createLocaleSpec('es'), createLocaleSpec('en')] as const;

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
      await expect(
        searchResultsSection.getByRole('heading', {
          level: 2,
          name: seededOfficialResult.runnerName,
          exact: true,
        }),
      ).toBeVisible();
      await expect(searchResultsSection).toContainText(new RegExp(`\\b${escapeRegex(seededOfficialResult.bibNumber)}\\b`));
      await expect(
        searchResultsSection.getByRole('link', { name: locale.results.openOfficial, exact: true }).first(),
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
      await expect(page.getByText(locale.detail.versionLabel, { exact: true }).first()).toBeVisible();
      await expect(page.getByText(locale.detail.statusLabel, { exact: true }).first()).toBeVisible();
      await expect(page.getByRole('cell', { name: seededOfficialResult.bibNumber, exact: true })).toBeVisible();
      await expect(page.getByRole('cell', { name: seededOfficialResult.distanceLabel, exact: true })).toBeVisible();
    });
  }
});
