import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';

type DestinationSpec = {
  path: string;
  heading: string;
};

type LocaleSpec = {
  code: 'es' | 'en';
  acceptLanguage: string;
  expandMenuLabel: string;
  newsNavLabel: string;
  about: {
    path: string;
    heading: string;
    sectionHeadings: string[];
    heroLinks: {
      events: string;
      results: string;
    };
    ctaLinks: {
      events: string;
      results: string;
    };
  };
  news: {
    path: string;
    heading: string;
    updatesHeading: string;
    updateTitles: string[];
    updatePoints: string[];
    heroLinks: {
      events: string;
      results: string;
    };
    updateLinks: {
      events: string;
      results: string;
      help: string;
      contact: string;
      rankings: string;
      question: string;
    };
    relatedLinks: {
      events: string;
      results: string;
      help: string;
      contact: string;
    };
  };
  destinations: {
    events: DestinationSpec;
    results: DestinationSpec;
    rankings: DestinationSpec;
    help: DestinationSpec;
    contact: DestinationSpec;
  };
  fullNavigation: boolean;
};

type NavigationMessages = {
  news: string;
  expandMenu: string;
};

type AboutMessages = {
  hero: {
    title: string;
    primaryCta: string;
    secondaryCta: string;
  };
  story: {
    title: string;
    cardTitle: string;
  };
  focus: {
    title: string;
  };
  cta: {
    primaryActionLabel: string;
    secondaryActionLabel: string;
  };
};

type NewsMessages = {
  hero: {
    title: string;
    primaryCta: string;
    secondaryCta: string;
  };
  updates: {
    title: string;
    items: {
      registrations: {
        title: string;
        points: {
          point1: string;
          point2: string;
          point3: string;
        };
        links: {
          primary: { label: string };
          secondary: { label: string };
        };
      };
      help: {
        title: string;
        points: {
          point1: string;
          point2: string;
          point3: string;
        };
        links: {
          primary: { label: string };
          secondary: { label: string };
        };
      };
      trust: {
        title: string;
        points: {
          point1: string;
          point2: string;
          point3: string;
        };
        links: {
          primary: { label: string };
          secondary: { label: string };
        };
      };
    };
  };
  relatedLinks: {
    items: {
      events: { title: string };
      results: { title: string };
      help: { title: string };
      contact: { title: string };
    };
  };
};

type PageTitleMessages = {
  title: string;
};

type PageHeroMessages = {
  hero: {
    title: string;
  };
};

function loadJsonFile<T>(relativePath: string): T {
  return JSON.parse(readFileSync(join(process.cwd(), relativePath), 'utf8')) as T;
}

function createLocaleSpec(code: 'es' | 'en'): LocaleSpec {
  const about = loadJsonFile<AboutMessages>(`messages/pages/about/${code}.json`);
  const news = loadJsonFile<NewsMessages>(`messages/pages/news/${code}.json`);
  const events = loadJsonFile<PageTitleMessages>(`messages/pages/events/${code}.json`);
  const results = loadJsonFile<PageTitleMessages>(`messages/pages/results/${code}.json`);
  const rankings = loadJsonFile<PageTitleMessages>(`messages/pages/rankings/${code}.json`);
  const help = loadJsonFile<PageHeroMessages>(`messages/pages/help/${code}.json`);
  const contact = loadJsonFile<PageHeroMessages>(`messages/pages/contact/${code}.json`);
  const navigation = loadJsonFile<NavigationMessages>(`messages/navigation/${code}.json`);

  return {
    code,
    acceptLanguage: code === 'es' ? 'es-MX,es;q=0.9' : 'en-US,en;q=0.9',
    expandMenuLabel: navigation.expandMenu,
    newsNavLabel: navigation.news,
    about: {
      path: code === 'es' ? '/acerca' : '/en/about',
      heading: about.hero.title,
      sectionHeadings: [about.story.title, about.story.cardTitle, about.focus.title],
      heroLinks: {
        events: about.hero.primaryCta,
        results: about.hero.secondaryCta,
      },
      ctaLinks: {
        events: about.cta.primaryActionLabel,
        results: about.cta.secondaryActionLabel,
      },
    },
    news: {
      path: code === 'es' ? '/noticias' : '/en/news',
      heading: news.hero.title,
      updatesHeading: news.updates.title,
      updateTitles: [
        news.updates.items.registrations.title,
        news.updates.items.help.title,
        news.updates.items.trust.title,
      ],
      updatePoints: [
        news.updates.items.registrations.points.point1,
        news.updates.items.registrations.points.point2,
        news.updates.items.registrations.points.point3,
        news.updates.items.help.points.point1,
        news.updates.items.help.points.point2,
        news.updates.items.help.points.point3,
        news.updates.items.trust.points.point1,
        news.updates.items.trust.points.point2,
        news.updates.items.trust.points.point3,
      ],
      heroLinks: {
        events: news.hero.primaryCta,
        results: news.hero.secondaryCta,
      },
      updateLinks: {
        events: news.updates.items.registrations.links.primary.label,
        results: news.updates.items.registrations.links.secondary.label,
        help: news.updates.items.help.links.primary.label,
        contact: news.updates.items.help.links.secondary.label,
        rankings: news.updates.items.trust.links.primary.label,
        question: news.updates.items.trust.links.secondary.label,
      },
      relatedLinks: {
        events: news.relatedLinks.items.events.title,
        results: news.relatedLinks.items.results.title,
        help: news.relatedLinks.items.help.title,
        contact: news.relatedLinks.items.contact.title,
      },
    },
    destinations: {
      events: { path: code === 'es' ? '/eventos' : '/en/events', heading: events.title },
      results: { path: code === 'es' ? '/resultados' : '/en/results', heading: results.title },
      rankings: {
        path: code === 'es' ? '/clasificaciones' : '/en/rankings',
        heading: rankings.title,
      },
      help: { path: code === 'es' ? '/ayuda' : '/en/help', heading: help.hero.title },
      contact: { path: code === 'es' ? '/contacto' : '/en/contact', heading: contact.hero.title },
    },
    fullNavigation: code === 'es',
  };
}

const locales: readonly LocaleSpec[] = [createLocaleSpec('es'), createLocaleSpec('en')] as const;

function escapeForRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function setLocaleContext(page: Page, testInfo: TestInfo, locale: LocaleSpec) {
  const baseUrl = String(testInfo.project.use.baseURL ?? 'http://127.0.0.1');
  await page.context().addCookies([{ name: 'NEXT_LOCALE', value: locale.code, url: baseUrl }]);
  await page.context().setExtraHTTPHeaders({ 'Accept-Language': locale.acceptLanguage });
}

async function openNarrativePage(
  page: Page,
  testInfo: TestInfo,
  locale: LocaleSpec,
  path: string,
  heading: string,
) {
  await setLocaleContext(page, testInfo, locale);
  await page.goto(path, { waitUntil: 'domcontentloaded' });

  await expect(page).toHaveURL(new RegExp(`${escapeForRegex(path)}(?:\\?|$)`));
  await expect(page.getByRole('heading', { level: 1, name: heading, exact: true })).toBeVisible();
  await expect(page.locator('main')).toBeVisible();
}

async function assertHeadings(main: Locator, headings: readonly string[]) {
  for (const heading of headings) {
    await expect(main.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  }
}

function getLinkByHrefAndText(main: Locator, name: string, path: string) {
  return main.locator(`a[href="${path}"]`).filter({ hasText: name }).first();
}

async function assertLink(main: Locator, name: string, path: string) {
  const link = getLinkByHrefAndText(main, name, path);
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', path);
}

async function followLinkAndAssertDestination(
  page: Page,
  originPath: string,
  getLink: () => Locator,
  destination: DestinationSpec,
  originHeading: string,
) {
  const destinationPattern = new RegExp(`${escapeForRegex(destination.path)}(?:\\?|$)`);
  const link = getLink();
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', destination.path);
  await link.scrollIntoViewIfNeeded();

  const newTabPromise = page.context().waitForEvent('page');
  await link.click({ modifiers: [process.platform === 'darwin' ? 'Meta' : 'Control'] });
  const destinationPage = await newTabPromise;

  await destinationPage.waitForLoadState('domcontentloaded');
  await expect(destinationPage).toHaveURL(destinationPattern);
  await expect(
    destinationPage.getByRole('heading', { level: 1, name: destination.heading, exact: true }),
  ).toBeVisible();
  await destinationPage.close();

  await expect(page).toHaveURL(new RegExp(`${escapeForRegex(originPath)}(?:\\?|$)`));
  await expect(
    page.getByRole('heading', { level: 1, name: originHeading, exact: true }),
  ).toBeVisible();
}

test.describe('Public narrative regression', () => {
  for (const locale of locales) {
    test(`${locale.code} about route keeps narrative proof discoverable`, async ({
      page,
    }, testInfo) => {
      await openNarrativePage(page, testInfo, locale, locale.about.path, locale.about.heading);

      const main = page.locator('main');

      await assertHeadings(main, locale.about.sectionHeadings);

      await assertLink(main, locale.about.heroLinks.events, locale.destinations.events.path);
      await assertLink(main, locale.about.heroLinks.results, locale.destinations.results.path);
      await assertLink(main, locale.about.ctaLinks.events, locale.destinations.events.path);
      await assertLink(main, locale.about.ctaLinks.results, locale.destinations.results.path);

      if (locale.fullNavigation) {
        await followLinkAndAssertDestination(
          page,
          locale.about.path,
          () =>
            getLinkByHrefAndText(
              page.locator('main'),
              locale.about.heroLinks.events,
              locale.destinations.events.path,
            ),
          locale.destinations.events,
          locale.about.heading,
        );
        await followLinkAndAssertDestination(
          page,
          locale.about.path,
          () =>
            getLinkByHrefAndText(
              page.locator('main'),
              locale.about.heroLinks.results,
              locale.destinations.results.path,
            ),
          locale.destinations.results,
          locale.about.heading,
        );
      } else {
        await followLinkAndAssertDestination(
          page,
          locale.about.path,
          () =>
            getLinkByHrefAndText(
              page.locator('main'),
              locale.about.heroLinks.results,
              locale.destinations.results.path,
            ),
          locale.destinations.results,
          locale.about.heading,
        );
      }
    });

    test(`${locale.code} news route keeps updates substantive and outward-facing`, async ({
      page,
    }, testInfo) => {
      await openNarrativePage(page, testInfo, locale, locale.news.path, locale.news.heading);

      const main = page.locator('main');

      await expect(
        main.getByRole('heading', { name: locale.news.updatesHeading, exact: true }),
      ).toBeVisible();

      for (const title of locale.news.updateTitles) {
        await expect(
          main.getByRole('heading', { level: 2, name: title, exact: true }),
        ).toBeVisible();
      }

      for (const point of locale.news.updatePoints) {
        await expect(main.getByText(point, { exact: true })).toBeVisible();
      }

      await assertLink(main, locale.news.heroLinks.events, locale.destinations.events.path);
      await assertLink(main, locale.news.heroLinks.results, locale.destinations.results.path);
      await assertLink(main, locale.news.updateLinks.events, locale.destinations.events.path);
      await assertLink(main, locale.news.updateLinks.results, locale.destinations.results.path);
      await assertLink(main, locale.news.updateLinks.help, locale.destinations.help.path);
      await assertLink(main, locale.news.updateLinks.contact, locale.destinations.contact.path);
      await assertLink(main, locale.news.updateLinks.rankings, locale.destinations.rankings.path);
      await assertLink(main, locale.news.updateLinks.question, locale.destinations.contact.path);
      await assertLink(main, locale.news.relatedLinks.events, locale.destinations.events.path);
      await assertLink(main, locale.news.relatedLinks.results, locale.destinations.results.path);
      await assertLink(main, locale.news.relatedLinks.help, locale.destinations.help.path);
      await assertLink(main, locale.news.relatedLinks.contact, locale.destinations.contact.path);

      for (const path of [
        locale.destinations.events.path,
        locale.destinations.results.path,
        locale.destinations.help.path,
        locale.destinations.contact.path,
        locale.destinations.rankings.path,
      ]) {
        expect(path).not.toBe(locale.news.path);
      }

      if (locale.fullNavigation) {
        await followLinkAndAssertDestination(
          page,
          locale.news.path,
          () =>
            getLinkByHrefAndText(
              page.locator('main'),
              locale.news.updateLinks.help,
              locale.destinations.help.path,
            ),
          locale.destinations.help,
          locale.news.heading,
        );
        await followLinkAndAssertDestination(
          page,
          locale.news.path,
          () =>
            getLinkByHrefAndText(
              page.locator('main'),
              locale.news.updateLinks.rankings,
              locale.destinations.rankings.path,
            ),
          locale.destinations.rankings,
          locale.news.heading,
        );
        await followLinkAndAssertDestination(
          page,
          locale.news.path,
          () =>
            getLinkByHrefAndText(
              page.locator('main'),
              locale.news.updateLinks.contact,
              locale.destinations.contact.path,
            ),
          locale.destinations.contact,
          locale.news.heading,
        );
      } else {
        await followLinkAndAssertDestination(
          page,
          locale.news.path,
          () =>
            getLinkByHrefAndText(
              page.locator('main'),
              locale.news.updateLinks.help,
              locale.destinations.help.path,
            ),
          locale.destinations.help,
          locale.news.heading,
        );
      }
    });
  }

  test('mobile drawer from about reaches localized news route', async ({ page }, testInfo) => {
    const locale = locales[0];
    await page.setViewportSize({ width: 390, height: 844 });
    await openNarrativePage(page, testInfo, locale, locale.about.path, locale.about.heading);

    const menuButton = page.getByRole('button', { name: locale.expandMenuLabel, exact: true });
    await expect(menuButton).toBeVisible();
    await menuButton.click();

    const newsLink = page.getByRole('link', { name: locale.newsNavLabel, exact: true });
    await expect(newsLink).toBeVisible({ timeout: 30000 });
    await expect(newsLink).toHaveAttribute('href', locale.news.path);

    await newsLink.click();
    await expect(page).toHaveURL(new RegExp(`${escapeForRegex(locale.news.path)}(?:\\?|$)`));
    await expect(
      page.getByRole('heading', { level: 1, name: locale.news.heading, exact: true }),
    ).toBeVisible();
  });
});
