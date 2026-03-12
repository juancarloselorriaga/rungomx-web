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
    relatedLinks: {
      events: string;
      results: string;
      rankings: string;
      contact: string;
    };
    ctaLinks: {
      events: string;
      contact: string;
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
      help: string;
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

const locales: readonly LocaleSpec[] = [
  {
    code: 'es',
    acceptLanguage: 'es-MX,es;q=0.9',
    expandMenuLabel: 'Expandir menú',
    newsNavLabel: 'Noticias',
    about: {
      path: '/acerca',
      heading: 'Quiénes somos',
      sectionHeadings: [
        'Una plataforma pública de running debe ayudar a verificar lo que importa',
        'RunGoMX ayuda a moverse entre descubrimiento, contexto de participación y prueba pública',
        'Las afirmaciones más fuertes de RunGoMX son las superficies que la gente puede verificar',
        'Ve a donde la prueba ya existe',
      ],
      heroLinks: {
        events: 'Explorar eventos',
        results: 'Ver resultados oficiales',
      },
      relatedLinks: {
        events: 'Explorar eventos',
        results: 'Revisar resultados oficiales',
        rankings: 'Ver rankings',
        contact: 'Contactar al equipo',
      },
      ctaLinks: {
        events: 'Explorar eventos',
        contact: 'Contactar a RunGoMX',
      },
    },
    news: {
      path: '/noticias',
      heading: 'Un lugar ligero para seguir cambios públicos de RunGoMX',
      updatesHeading: 'Lo que las personas deben saber ahora',
      updateTitles: [
        'El contexto de inscripción es más fácil de verificar desde rutas públicas de evento',
        'La guía de ayuda es más clara sobre dónde terminan las respuestas de autoservicio',
        'Las superficies públicas de confianza se presentan como referencias prácticas',
      ],
      updatePoints: [
        'El directorio público de eventos se trata como el punto principal de descubrimiento.',
        'La ayuda sigue centrada en inscripciones, detalles del evento, resultados, rankings y cuenta básica.',
        'Las vistas de resultados oficiales siguen siendo una superficie pública central de prueba.',
      ],
      heroLinks: {
        events: 'Explorar eventos',
        help: 'Ir al centro de ayuda',
      },
      updateLinks: {
        events: 'Abrir eventos',
        results: 'Revisar resultados',
        help: 'Ir a ayuda',
        contact: 'Contactar al equipo',
        rankings: 'Ver rankings',
        question: 'Hacer una pregunta',
      },
      relatedLinks: {
        events: 'Eventos',
        results: 'Resultados oficiales',
        help: 'Centro de ayuda',
        contact: 'Contactar a RunGoMX',
      },
    },
    destinations: {
      events: { path: '/eventos', heading: 'Eventos' },
      results: { path: '/resultados', heading: 'Resultados' },
      rankings: { path: '/clasificaciones', heading: 'Clasificaciones nacionales' },
      help: { path: '/ayuda', heading: 'Encuentra ayuda práctica antes de contactar soporte' },
      contact: {
        path: '/contacto',
        heading: 'Escribe al equipo de RunGoMX cuando necesites soporte o una respuesta real',
      },
    },
    fullNavigation: true,
  },
  {
    code: 'en',
    acceptLanguage: 'en-US,en;q=0.9',
    expandMenuLabel: 'Expand menu',
    newsNavLabel: 'News',
    about: {
      path: '/en/about',
      heading: 'Who we are',
      sectionHeadings: [
        'A public running platform should help people verify what matters',
        'RunGoMX helps people move between discovery, participation context, and proof',
        'The strongest RunGoMX claims are the surfaces people can actually verify',
        'Go where the proof already lives',
      ],
      heroLinks: {
        events: 'Browse events',
        results: 'View official results',
      },
      relatedLinks: {
        events: 'Browse events',
        results: 'Review official results',
        rankings: 'See rankings',
        contact: 'Contact the team',
      },
      ctaLinks: {
        events: 'Browse events',
        contact: 'Contact RunGoMX',
      },
    },
    news: {
      path: '/en/news',
      heading: 'A lightweight place to track public RunGoMX changes',
      updatesHeading: 'What visitors should know right now',
      updateTitles: [
        'Registration context is easier to verify from public event routes',
        'Help guidance is clearer about where self-serve answers end',
        'Public trust surfaces are framed as practical references',
      ],
      updatePoints: [
        'The public event directory is treated as the primary starting point for discovery.',
        'Help content stays grounded in registrations, event details, results, rankings, and account basics.',
        'Official result views remain a core public proof surface.',
      ],
      heroLinks: {
        events: 'Browse events',
        help: 'Visit help center',
      },
      updateLinks: {
        events: 'Open events',
        results: 'Review results',
        help: 'Go to help',
        contact: 'Contact the team',
        rankings: 'See rankings',
        question: 'Ask a question',
      },
      relatedLinks: {
        events: 'Events',
        results: 'Official results',
        help: 'Help center',
        contact: 'Contact RunGoMX',
      },
    },
    destinations: {
      events: { path: '/en/events', heading: 'Events' },
      results: { path: '/en/results', heading: 'Results' },
      rankings: { path: '/en/rankings', heading: 'National Rankings' },
      help: { path: '/en/help', heading: 'Find practical help before you contact support' },
      contact: {
        path: '/en/contact',
        heading: 'Reach the RunGoMX team when you need support or a real answer',
      },
    },
    fullNavigation: false,
  },
] as const;

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
  link: Locator,
  destination: DestinationSpec,
  originHeading: string,
) {
  await expect(link).toHaveAttribute('href', destination.path);
  await link.click();
  await expect(page).toHaveURL(new RegExp(`${escapeForRegex(destination.path)}(?:\\?|$)`));
  await expect(page.getByRole('heading', { level: 1, name: destination.heading, exact: true })).toBeVisible();

  await page.goto(originPath, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(new RegExp(`${escapeForRegex(originPath)}(?:\\?|$)`));
  await expect(page.getByRole('heading', { level: 1, name: originHeading, exact: true })).toBeVisible();
}

test.describe('Public narrative regression', () => {
  for (const locale of locales) {
    test(`${locale.code} about route keeps narrative proof discoverable`, async ({ page }, testInfo) => {
      await openNarrativePage(page, testInfo, locale, locale.about.path, locale.about.heading);

      const main = page.locator('main');

      await assertHeadings(main, locale.about.sectionHeadings);

      await assertLink(main, locale.about.heroLinks.events, locale.destinations.events.path);
      await assertLink(main, locale.about.heroLinks.results, locale.destinations.results.path);
      await assertLink(main, locale.about.relatedLinks.events, locale.destinations.events.path);
      await assertLink(main, locale.about.relatedLinks.results, locale.destinations.results.path);
      await assertLink(main, locale.about.relatedLinks.rankings, locale.destinations.rankings.path);
      await assertLink(main, locale.about.relatedLinks.contact, locale.destinations.contact.path);
      await assertLink(main, locale.about.ctaLinks.events, locale.destinations.events.path);
      await assertLink(main, locale.about.ctaLinks.contact, locale.destinations.contact.path);

      if (locale.fullNavigation) {
        await followLinkAndAssertDestination(
          page,
          locale.about.path,
          getLinkByHrefAndText(main, locale.about.heroLinks.events, locale.destinations.events.path),
          locale.destinations.events,
          locale.about.heading,
        );
        await followLinkAndAssertDestination(
          page,
          locale.about.path,
          getLinkByHrefAndText(main, locale.about.heroLinks.results, locale.destinations.results.path),
          locale.destinations.results,
          locale.about.heading,
        );
        await followLinkAndAssertDestination(
          page,
          locale.about.path,
          getLinkByHrefAndText(main, locale.about.relatedLinks.contact, locale.destinations.contact.path),
          locale.destinations.contact,
          locale.about.heading,
        );
      } else {
        await followLinkAndAssertDestination(
          page,
          locale.about.path,
          getLinkByHrefAndText(main, locale.about.relatedLinks.contact, locale.destinations.contact.path),
          locale.destinations.contact,
          locale.about.heading,
        );
      }
    });

    test(`${locale.code} news route keeps updates substantive and outward-facing`, async ({ page }, testInfo) => {
      await openNarrativePage(page, testInfo, locale, locale.news.path, locale.news.heading);

      const main = page.locator('main');

      await expect(main.getByRole('heading', { name: locale.news.updatesHeading, exact: true })).toBeVisible();

      for (const title of locale.news.updateTitles) {
        await expect(main.getByRole('heading', { level: 2, name: title, exact: true })).toBeVisible();
      }

      for (const point of locale.news.updatePoints) {
        await expect(main.getByText(point, { exact: true })).toBeVisible();
      }

      await assertLink(main, locale.news.heroLinks.events, locale.destinations.events.path);
      await assertLink(main, locale.news.heroLinks.help, locale.destinations.help.path);
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
          getLinkByHrefAndText(main, locale.news.updateLinks.help, locale.destinations.help.path),
          locale.destinations.help,
          locale.news.heading,
        );
        await followLinkAndAssertDestination(
          page,
          locale.news.path,
          getLinkByHrefAndText(main, locale.news.updateLinks.rankings, locale.destinations.rankings.path),
          locale.destinations.rankings,
          locale.news.heading,
        );
        await followLinkAndAssertDestination(
          page,
          locale.news.path,
          getLinkByHrefAndText(main, locale.news.relatedLinks.contact, locale.destinations.contact.path),
          locale.destinations.contact,
          locale.news.heading,
        );
      } else {
        await followLinkAndAssertDestination(
          page,
          locale.news.path,
          getLinkByHrefAndText(main, locale.news.updateLinks.help, locale.destinations.help.path),
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

    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();

    const newsLink = drawer.getByRole('link', { name: locale.newsNavLabel, exact: true });
    await expect(newsLink).toBeVisible();
    await expect(newsLink).toHaveAttribute('href', locale.news.path);

    await newsLink.click();
    await expect(page).toHaveURL(new RegExp(`${escapeForRegex(locale.news.path)}(?:\\?|$)`));
    await expect(page.getByRole('heading', { level: 1, name: locale.news.heading, exact: true })).toBeVisible();
  });
});
