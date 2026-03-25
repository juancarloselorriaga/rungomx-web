import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

type LocaleSpec = {
  code: 'es' | 'en';
  homePath: '/' | '/en';
  acceptLanguage: string;
  signInLabel: string;
  expandMenuLabel: string;
  heroHeading: string;
  sectionLabels: string[];
  navLabels: string[];
  footerLabels: string[];
  ctas: {
    events: string;
    results: string;
    rankings: string;
    about: string;
  };
  routePaths: {
    events: string;
    results: string;
    rankings: string;
    about: string;
  };
  routeHeadings: {
    events: string;
    results: string;
    rankings: string;
    about: string;
  };
};

type ViewportSpec = {
  name: 'desktop' | 'mobile';
  width: number;
  height: number;
};

type HomeMessages = {
  ctas: {
    browseEvents: string;
    viewResults: string;
    viewRankings: string;
  };
  hero: {
    eyebrow: string;
    title: string;
  };
  proofPaths: {
    title: string;
  };
  eventPages: {
    title: string;
  };
  resultsRankings: {
    title: string;
  };
  aboutBridge: { cta: string };
  finalCta: {
    title: string;
  };
};

type NavigationMessages = {
  events: string;
  results: string;
  rankings: string;
  about: string;
  news: string;
  expandMenu: string;
};

type FooterMessages = {
  links: {
    aboutUs: string;
    news: string;
    contact: string;
    helpCenter: string;
    privacy: string;
    terms: string;
  };
};

type ResultsMessages = {
  title: string;
};

type RankingsMessages = {
  title: string;
};

type EventsMessages = {
  title: string;
};

type AboutMessages = {
  hero: {
    title: string;
  };
};

function loadJsonFile<T>(relativePath: string): T {
  return JSON.parse(readFileSync(join(process.cwd(), relativePath), 'utf8')) as T;
}

function createLocaleSpec(code: 'es' | 'en'): LocaleSpec {
  const home = loadJsonFile<HomeMessages>(`messages/pages/home/${code}.json`);
  const navigation = loadJsonFile<NavigationMessages>(`messages/navigation/${code}.json`);
  const footer = loadJsonFile<FooterMessages>(`messages/components/footer/${code}.json`);
  const about = loadJsonFile<AboutMessages>(`messages/pages/about/${code}.json`);
  const events = loadJsonFile<EventsMessages>(`messages/pages/events/${code}.json`);
  const results = loadJsonFile<ResultsMessages>(`messages/pages/results/${code}.json`);
  const rankings = loadJsonFile<RankingsMessages>(`messages/pages/rankings/${code}.json`);

  return {
    code,
    homePath: code === 'es' ? '/' : '/en',
    acceptLanguage: code === 'es' ? 'es-MX,es;q=0.9' : 'en-US,en;q=0.9',
    signInLabel: code === 'es' ? 'Iniciar sesión' : 'Sign In',
    expandMenuLabel: navigation.expandMenu,
    heroHeading: home.hero.title,
    sectionLabels: [
      home.hero.eyebrow,
      home.proofPaths.title,
      home.eventPages.title,
      home.resultsRankings.title,
      home.finalCta.title,
    ],
    navLabels: [
      navigation.events,
      navigation.results,
      navigation.rankings,
      navigation.about,
      navigation.news,
    ],
    footerLabels: [
      footer.links.aboutUs,
      footer.links.news,
      footer.links.contact,
      footer.links.helpCenter,
      footer.links.privacy,
      footer.links.terms,
    ],
    ctas: {
      events: home.ctas.browseEvents,
      results: home.ctas.viewResults,
      rankings: home.ctas.viewRankings,
      about: home.aboutBridge.cta,
    },
    routePaths: {
      events: code === 'es' ? '/eventos' : '/en/events',
      results: code === 'es' ? '/resultados' : '/en/results',
      rankings: code === 'es' ? '/clasificaciones' : '/en/rankings',
      about: code === 'es' ? '/acerca' : '/en/about',
    },
    routeHeadings: {
      events: events.title,
      results: results.title,
      rankings: rankings.title,
      about: about.hero.title,
    },
  };
}

const locales: readonly LocaleSpec[] = [createLocaleSpec('es'), createLocaleSpec('en')] as const;

const viewports: readonly ViewportSpec[] = [
  { name: 'desktop', width: 1440, height: 1080 },
  { name: 'mobile', width: 390, height: 844 },
] as const;

function normalizeTexts(values: string[]) {
  return values.map((value) => value.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

function pickOrderedMatches(values: string[], expected: readonly string[]) {
  return values.filter((value) => expected.includes(value));
}

async function takeHomepageArtifact(
  page: Page,
  testInfo: TestInfo,
  locale: LocaleSpec,
  viewport: ViewportSpec,
) {
  const fileName = `homepage-${locale.code}-${viewport.name}.png`;
  const screenshotPath = testInfo.outputPath(fileName);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach(fileName, {
    path: screenshotPath,
    contentType: 'image/png',
  });
}

async function openHomepage(
  page: Page,
  testInfo: TestInfo,
  locale: LocaleSpec,
  viewport: ViewportSpec,
) {
  const baseUrl = String(testInfo.project.use.baseURL ?? 'http://127.0.0.1');
  await page.context().addCookies([{ name: 'NEXT_LOCALE', value: locale.code, url: baseUrl }]);
  await page.context().setExtraHTTPHeaders({ 'Accept-Language': locale.acceptLanguage });
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto(locale.homePath, { waitUntil: 'domcontentloaded' });

  expect(new URL(page.url()).pathname).toBe(locale.homePath);
  await expect(page.getByRole('heading', { level: 1, name: locale.heroHeading, exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: locale.signInLabel, exact: true }).first()).toBeVisible();

  await takeHomepageArtifact(page, testInfo, locale, viewport);
}

async function assertEnglishPreferenceResolvesBareRoot(
  page: Page,
  testInfo: TestInfo,
  viewport: ViewportSpec,
) {
  const englishLocale = locales.find((locale) => locale.code === 'en');
  if (!englishLocale) {
    throw new Error('English locale spec is missing.');
  }

  await page.context().setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  expect(new URL(page.url()).pathname).toBe(englishLocale.homePath);
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: englishLocale.heroHeading,
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: englishLocale.signInLabel, exact: true }).first()).toBeVisible();
}

async function assertHomepageSections(page: Page, locale: LocaleSpec) {
  for (const sectionLabel of locale.sectionLabels) {
    await expect(page.getByText(sectionLabel, { exact: true })).toBeVisible();
  }
}

async function assertNavOrder(page: Page, locale: LocaleSpec, viewport: ViewportSpec) {
  const expected = [...locale.navLabels];

  if (viewport.name === 'mobile') {
    const menuButton = page.getByRole('button', { name: locale.expandMenuLabel, exact: true });
    await expect(menuButton).toBeVisible();
    await menuButton.click();

    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();

    const linkTexts = normalizeTexts(await drawer.getByRole('link').evaluateAll((links) =>
      links.map((link) => link.textContent ?? ''),
    ));

    expect(pickOrderedMatches(linkTexts, expected)).toEqual(expected);

    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    return;
  }

  const nav = page.locator('nav').first();
  await expect(nav).toBeVisible();

  const linkTexts = normalizeTexts(await nav.getByRole('link').evaluateAll((links) =>
    links.map((link) => link.textContent ?? ''),
  ));

  expect(pickOrderedMatches(linkTexts, expected)).toEqual(expected);
}

async function assertFooterLinks(page: Page, locale: LocaleSpec) {
  const footer = page.locator('footer');
  await footer.scrollIntoViewIfNeeded();

  for (const footerLabel of locale.footerLabels) {
    await expect(footer.getByRole('link', { name: footerLabel, exact: true })).toBeVisible();
  }
}

async function assertProofRoute(
  page: Page,
  locale: LocaleSpec,
  route: '/events' | '/results' | '/rankings' | '/about',
  label: string,
  targetHeading: string,
) {
  const targetPath =
    route === '/events'
      ? locale.routePaths.events
      : route === '/results'
        ? locale.routePaths.results
        : route === '/rankings'
          ? locale.routePaths.rankings
          : locale.routePaths.about;
  const cta = page.locator(`main a[href="${targetPath}"]`).filter({ hasText: label }).first();

  await expect(cta).toBeVisible();
  await expect(cta).toHaveAttribute('href', targetPath);

  await page.goto(targetPath, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(new RegExp(`${targetPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\?|$)`));
  await expect(page.getByRole('heading', { level: 1, name: targetHeading, exact: true })).toBeVisible();

  await page.goto(locale.homePath, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1, name: locale.heroHeading, exact: true })).toBeVisible();
}

test.describe('Public homepage regression', () => {
  test('bare slash resolves to English homepage when English is preferred', async ({ page }, testInfo) => {
    await assertEnglishPreferenceResolvesBareRoot(page, testInfo, viewports[0]);
  });

  for (const locale of locales) {
    for (const viewport of viewports) {
      test(`${locale.code} homepage regression (${viewport.name})`, async ({ page }, testInfo) => {
        await openHomepage(page, testInfo, locale, viewport);
        await assertHomepageSections(page, locale);
        await assertNavOrder(page, locale, viewport);
        await assertFooterLinks(page, locale);

        await assertProofRoute(page, locale, '/events', locale.ctas.events, locale.routeHeadings.events);
        await assertProofRoute(page, locale, '/results', locale.ctas.results, locale.routeHeadings.results);
        await assertProofRoute(
          page,
          locale,
          '/rankings',
          locale.ctas.rankings,
          locale.routeHeadings.rankings,
        );
        await assertProofRoute(page, locale, '/about', locale.ctas.about, locale.routeHeadings.about);
      });
    }
  }
});
