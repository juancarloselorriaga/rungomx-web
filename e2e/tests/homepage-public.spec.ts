import { expect, test, type Page, type TestInfo } from '@playwright/test';

type LocaleSpec = {
  code: 'es' | 'en';
  homePath: '/' | '/en';
  acceptLanguage: string;
  signInLabel: string;
  expandMenuLabel: string;
  heroHeading: string;
  sectionLabels: string[];
  navLabels: [string, string, string, string, string];
  footerLabels: [string, string, string, string, string, string];
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

const locales: readonly LocaleSpec[] = [
  {
    code: 'es',
    homePath: '/',
    acceptLanguage: 'es-MX,es;q=0.9',
    signInLabel: 'Iniciar sesión',
    expandMenuLabel: 'Expandir menú',
    heroHeading: 'Páginas de evento, inscripciones, resultados y rankings en un solo lugar',
    sectionLabels: [
      'Diseñado para generar confianza el día del evento',
      'Tres puntos de entrada públicos que mantienen el avance',
      'Páginas que convierten el interés en inscripciones',
      'Un camino más fluido desde el descubrimiento hasta la confirmación',
      'Haz que la plataforma siga siendo útil después del día de carrera',
      'Conecta el valor del producto con la credibilidad de la plataforma',
      'Lanza una experiencia pública más sólida para tu próximo evento',
    ],
    navLabels: ['Eventos', 'Resultados', 'Clasificaciones', 'Acerca', 'Noticias'],
    footerLabels: ['Acerca de', 'Noticias', 'Contacto', 'Ayuda', 'Privacidad', 'Términos'],
    ctas: {
      events: 'Explorar eventos',
      results: 'Ver resultados',
      rankings: 'Ver rankings',
      about: 'Conocer RunGoMx',
    },
    routePaths: {
      events: '/eventos',
      results: '/resultados',
      rankings: '/clasificaciones',
      about: '/acerca',
    },
    routeHeadings: {
      events: 'Eventos',
      results: 'Resultados',
      rankings: 'Clasificaciones nacionales',
      about: 'Quiénes somos',
    },
  },
  {
    code: 'en',
    homePath: '/en',
    acceptLanguage: 'en-US,en;q=0.9',
    signInLabel: 'Sign In',
    expandMenuLabel: 'Expand menu',
    heroHeading: 'Event pages, registrations, results, and rankings in one place',
    sectionLabels: [
      'Built for race-day trust',
      'Three public entry points that keep visitors moving',
      'Pages that turn interest into registrations',
      'A smoother path from discovery to confirmation',
      'Keep the platform useful after race day',
      'Bridge product value with platform credibility',
      'Launch a stronger public experience for your next event',
    ],
    navLabels: ['Events', 'Results', 'Rankings', 'About', 'News'],
    footerLabels: ['About', 'News', 'Contact', 'Help', 'Privacy', 'Terms'],
    ctas: {
      events: 'Explore events',
      results: 'View results',
      rankings: 'See rankings',
      about: 'Learn about RunGoMx',
    },
    routePaths: {
      events: '/en/events',
      results: '/en/results',
      rankings: '/en/rankings',
      about: '/en/about',
    },
    routeHeadings: {
      events: 'Events',
      results: 'Results',
      rankings: 'National Rankings',
      about: 'Who we are',
    },
  },
] as const;

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
  await page.context().setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  expect(new URL(page.url()).pathname).toBe('/en');
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Event pages, registrations, results, and rankings in one place',
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign In', exact: true }).first()).toBeVisible();
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
