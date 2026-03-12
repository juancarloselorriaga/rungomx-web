import { expect, test, type Locator, type Page } from '@playwright/test';

type RouteKey = 'home' | 'contact' | 'help' | 'privacy' | 'terms' | 'events' | 'results' | 'rankings';

type LocaleSpec = {
  code: 'es' | 'en';
  acceptLanguage: string;
  routes: Record<RouteKey, string>;
  headings: Record<RouteKey, string>;
  contact: {
    heroHelpCta: string;
    heroEventsCta: string;
    triageTitle: string;
    triageCards: string[];
    formTitle: string;
    directLinksTitle: string;
    directLinks: {
      events: string;
      results: string;
      rankings: string;
      help: string;
    };
    trustTitle: string;
    trustActions: {
      privacy: string;
      terms: string;
    };
    fieldLabels: {
      name: string;
      email: string;
      message: string;
    };
    submitLabel: string;
    invalidInput: string;
  };
  help: {
    heroEventsCta: string;
    heroContactCta: string;
    categoriesTitle: string;
    categories: Array<{ id: string; title: string }>;
    faqTitle: string;
    faqGroups: Array<{ id: string; title: string }>;
    faqQuestion: string;
    faqAnswer: string;
    ctaTitle: string;
    ctaContact: string;
    helpfulLinksTitle: string;
    helpfulLinks: {
      events: string;
      results: string;
      rankings: string;
      home: string;
    };
  };
  privacy: {
    heroContactCta: string;
    heroTermsCta: string;
    summaryTitle: string;
    sections: string[];
    ctaTitle: string;
    ctaContact: string;
    relatedTitle: string;
    relatedTerms: string;
  };
  terms: {
    heroContactCta: string;
    heroPrivacyCta: string;
    summaryTitle: string;
    sections: string[];
    ctaTitle: string;
    ctaContact: string;
    relatedTitle: string;
    relatedPrivacy: string;
  };
};

const locales: readonly LocaleSpec[] = [
  {
    code: 'es',
    acceptLanguage: 'es-MX,es;q=0.9',
    routes: {
      home: '/',
      contact: '/contacto',
      help: '/ayuda',
      privacy: '/privacidad',
      terms: '/terminos',
      events: '/eventos',
      results: '/resultados',
      rankings: '/clasificaciones',
    },
    headings: {
      home: 'Páginas de evento, inscripciones, resultados y rankings en un solo lugar',
      contact: 'Escribe al equipo de RunGoMX cuando necesites soporte o una respuesta real',
      help: 'Encuentra ayuda práctica antes de contactar soporte',
      privacy: 'Cómo maneja RunGoMX tu información',
      terms: 'Términos para usar RunGoMX',
      events: 'Eventos',
      results: 'Resultados',
      rankings: 'Clasificaciones nacionales',
    },
    contact: {
      heroHelpCta: 'Ir al centro de ayuda',
      heroEventsCta: 'Ver eventos',
      triageTitle: 'Elige la vía que más se parezca a tu pregunta',
      triageCards: ['Soporte', 'Alianzas o consultas generales', 'Problema de cuenta o evento'],
      formTitle: 'Envía un mensaje al equipo',
      directLinksTitle: 'A veces la respuesta más rápida ya está en el sitio público',
      directLinks: {
        events: 'Explorar eventos',
        results: 'Revisar resultados',
        rankings: 'Ver rankings',
        help: 'Ir al centro de ayuda',
      },
      trustTitle: '¿También necesitas la parte de políticas?',
      trustActions: {
        privacy: 'Revisar privacidad',
        terms: 'Revisar términos',
      },
      fieldLabels: {
        name: 'Nombre',
        email: 'Correo electrónico',
        message: 'Mensaje',
      },
      submitLabel: 'Enviar mensaje',
      invalidInput: 'Revisa los campos del formulario de contacto e inténtalo de nuevo.',
    },
    help: {
      heroEventsCta: 'Ver eventos',
      heroContactCta: 'Contactar soporte',
      categoriesTitle: 'Empieza por el tema que mejor coincide con tu pregunta',
      categories: [
        { id: 'registrations', title: 'Inscripciones' },
        { id: 'eventInformation', title: 'Información del evento' },
        { id: 'results', title: 'Resultados' },
        { id: 'rankings', title: 'Rankings' },
        { id: 'payments', title: 'Pagos y confirmaciones' },
        { id: 'accountBasics', title: 'Cuenta básica' },
      ],
      faqTitle: 'Respuestas aterrizadas para los flujos que más preguntan',
      faqGroups: [
        { id: 'registrations', title: 'Inscripciones' },
        { id: 'eventInformation', title: 'Información del evento' },
        { id: 'results', title: 'Resultados' },
        { id: 'rankings', title: 'Rankings' },
        { id: 'payments', title: 'Pagos y confirmaciones' },
        { id: 'accountBasics', title: 'Cuenta básica' },
      ],
      faqQuestion: '¿Cómo sé si la inscripción está abierta para un evento?',
      faqAnswer:
        'Empieza en la página del evento. RunGoMX muestra ahí el estado de la inscripción, incluyendo si está abierta, cerrada, aún no inicia o está pausada para ese evento específico.',
      ctaTitle: '¿Aún necesitas ayuda?',
      ctaContact: 'Ir a contacto',
      helpfulLinksTitle: 'Ve directo a las superficies públicas principales',
      helpfulLinks: {
        events: 'Eventos',
        results: 'Resultados',
        rankings: 'Rankings',
        home: 'Inicio',
      },
    },
    privacy: {
      heroContactCta: 'Contactar soporte',
      heroTermsCta: 'Revisar términos',
      summaryTitle: 'La versión corta',
      sections: [
        'Información que recopilamos',
        'Cómo se usa la información',
        'Cuándo se comparte la información',
        'Opciones del usuario y contacto para preguntas de privacidad',
      ],
      ctaTitle: '¿Preguntas sobre privacidad o tu cuenta?',
      ctaContact: 'Ir a contacto',
      relatedTitle: 'También revisa nuestros términos y condiciones',
      relatedTerms: 'Términos y condiciones',
    },
    terms: {
      heroContactCta: 'Contactar soporte',
      heroPrivacyCta: 'Revisar privacidad',
      summaryTitle: 'Qué buscan cubrir estos términos',
      sections: [
        'Uso de la plataforma',
        'Cuentas y responsabilidad del usuario',
        'Inscripciones, pagos y expectativas de transacción',
        'Contacto y preguntas legales',
      ],
      ctaTitle: '¿Necesitas ayuda con estos términos o con un tema del evento?',
      ctaContact: 'Ir a contacto',
      relatedTitle: 'También revisa nuestro aviso de privacidad',
      relatedPrivacy: 'Aviso de privacidad',
    },
  },
  {
    code: 'en',
    acceptLanguage: 'en-US,en;q=0.9',
    routes: {
      home: '/en',
      contact: '/en/contact',
      help: '/en/help',
      privacy: '/en/privacy',
      terms: '/en/terms',
      events: '/en/events',
      results: '/en/results',
      rankings: '/en/rankings',
    },
    headings: {
      home: 'Event pages, registrations, results, and rankings in one place',
      contact: 'Reach the RunGoMX team when you need support or a real answer',
      help: 'Find practical help before you contact support',
      privacy: 'How RunGoMX handles your information',
      terms: 'Terms for using RunGoMX',
      events: 'Events',
      results: 'Results',
      rankings: 'National Rankings',
    },
    contact: {
      heroHelpCta: 'Visit help center',
      heroEventsCta: 'Browse events',
      triageTitle: 'Choose the lane that best matches your question',
      triageCards: ['Support', 'Partnerships or general inquiries', 'Account or event issue'],
      formTitle: 'Send a message to the team',
      directLinksTitle: 'Sometimes the fastest answer is already on the public site',
      directLinks: {
        events: 'Browse events',
        results: 'Check results',
        rankings: 'View rankings',
        help: 'Go to help center',
      },
      trustTitle: 'Need the policy side too?',
      trustActions: {
        privacy: 'Review privacy',
        terms: 'Review terms',
      },
      fieldLabels: {
        name: 'Name',
        email: 'Email',
        message: 'Message',
      },
      submitLabel: 'Send message',
      invalidInput: 'Please review the contact form fields and try again.',
    },
    help: {
      heroEventsCta: 'Browse events',
      heroContactCta: 'Contact support',
      categoriesTitle: 'Start with the topic that matches your question',
      categories: [
        { id: 'registrations', title: 'Registrations' },
        { id: 'eventInformation', title: 'Event information' },
        { id: 'results', title: 'Results' },
        { id: 'rankings', title: 'Rankings' },
        { id: 'payments', title: 'Payments and confirmations' },
        { id: 'accountBasics', title: 'Account basics' },
      ],
      faqTitle: 'Grounded answers for the flows people ask about most',
      faqGroups: [
        { id: 'registrations', title: 'Registrations' },
        { id: 'eventInformation', title: 'Event information' },
        { id: 'results', title: 'Results' },
        { id: 'rankings', title: 'Rankings' },
        { id: 'payments', title: 'Payments and confirmations' },
        { id: 'accountBasics', title: 'Account basics' },
      ],
      faqQuestion: 'How do I know whether registration is open for an event?',
      faqAnswer:
        'Start from the event page. RunGoMX shows the registration state there, including whether registration is open, closed, not open yet, or paused for that specific event.',
      ctaTitle: 'Still need help?',
      ctaContact: 'Go to contact',
      helpfulLinksTitle: 'Go straight to the main public surfaces',
      helpfulLinks: {
        events: 'Events',
        results: 'Results',
        rankings: 'Rankings',
        home: 'Homepage',
      },
    },
    privacy: {
      heroContactCta: 'Contact support',
      heroTermsCta: 'Review terms',
      summaryTitle: 'The short version',
      sections: [
        'Information we collect',
        'How information is used',
        'When information is shared',
        'User choices and contact for privacy questions',
      ],
      ctaTitle: 'Questions about privacy or your account?',
      ctaContact: 'Go to contact',
      relatedTitle: 'Also review our terms of service',
      relatedTerms: 'Terms of Service',
    },
    terms: {
      heroContactCta: 'Contact support',
      heroPrivacyCta: 'Review privacy',
      summaryTitle: 'What these terms are meant to cover',
      sections: [
        'Using the platform',
        'Accounts and user responsibility',
        'Registrations, payments, and transaction expectations',
        'Contact and legal questions',
      ],
      ctaTitle: 'Need help with terms or an event-related issue?',
      ctaContact: 'Go to contact',
      relatedTitle: 'Also review our privacy policy',
      relatedPrivacy: 'Privacy Policy',
    },
  },
] as const;

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function openRoute(page: Page, locale: LocaleSpec, route: RouteKey) {
  await page.context().setExtraHTTPHeaders({ 'Accept-Language': locale.acceptLanguage });
  await page.goto(locale.routes[route], { waitUntil: 'domcontentloaded' });

  expect(new URL(page.url()).pathname).toBe(locale.routes[route]);
  await expect(page.getByRole('heading', { level: 1, name: locale.headings[route], exact: true })).toBeVisible();
}

async function expectLink(locator: Locator, href: string) {
  await locator.scrollIntoViewIfNeeded();
  await expect(locator).toBeVisible();
  await expect(locator).toHaveAttribute('href', href);
}

async function followLink(locator: Locator, page: Page, href: string, targetHeading: string) {
  await expectLink(locator, href);
  await locator.click();
  await expect(page).toHaveURL(new RegExp(`${escapeRegex(href)}(?:$|[?#])`));
  await expect(page.getByRole('heading', { level: 1, name: targetHeading, exact: true })).toBeVisible();
}

async function followLinkByDomClick(locator: Locator, page: Page, href: string, targetHeading: string) {
  await expectLink(locator, href);
  await Promise.all([
    page.waitForURL(new RegExp(`${escapeRegex(href)}(?:$|[?#])`)),
    locator.evaluate((element) => (element as HTMLAnchorElement).click()),
  ]);
  await expect(page.getByRole('heading', { level: 1, name: targetHeading, exact: true })).toBeVisible();
}

function hrefLink(page: Page, href: string, label: string) {
  return page.locator(`a[href="${href}"]`).filter({ hasText: label }).first();
}

function visibleHrefLink(page: Page, href: string, label: string) {
  return page.locator(`a[href="${href}"]`).filter({ hasText: label, visible: true }).first();
}

function sectionByHeading(page: Page, heading: string) {
  return page.locator('section').filter({
    has: page.getByRole('heading', { name: heading, exact: true }),
  }).first();
}

function relatedCardLink(page: Page, href: string, title: string) {
  return page
    .locator(`a[href="${href}"]`)
    .filter({
      has: page.getByRole('heading', { level: 3, name: title, exact: true }),
      visible: true,
    })
    .first();
}

function contactForm(page: Page) {
  return page.locator('#contact-form');
}

function contactMessageField(page: Page, label: string) {
  return contactForm(page).getByRole('textbox', { name: new RegExp(`^${escapeRegex(label)}\\b`) });
}

function contactValidationAlert(page: Page, message: string) {
  return contactForm(page).getByRole('alert').filter({ hasText: message }).first();
}

async function assertContactPage(page: Page, locale: LocaleSpec) {
  await openRoute(page, locale, 'contact');
  const triageSection = sectionByHeading(page, locale.contact.triageTitle);

  await expect(triageSection.getByRole('heading', { name: locale.contact.triageTitle, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: locale.contact.formTitle, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: locale.contact.directLinksTitle, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: locale.contact.trustTitle, exact: true })).toBeVisible();

  for (const cardTitle of locale.contact.triageCards) {
    await expect(triageSection.getByRole('heading', { level: 3, name: cardTitle, exact: true })).toBeVisible();
  }

  await expect(page.getByLabel(locale.contact.fieldLabels.name, { exact: true })).toBeVisible();
  await expect(page.getByLabel(locale.contact.fieldLabels.email, { exact: true })).toBeVisible();
  await expect(contactMessageField(page, locale.contact.fieldLabels.message)).toBeVisible();
  await expect(page.getByRole('button', { name: locale.contact.submitLabel, exact: true })).toBeVisible();
}

async function assertContactHrefs(page: Page, locale: LocaleSpec) {
  await expectLink(hrefLink(page, locale.routes.help, locale.contact.heroHelpCta), locale.routes.help);
  await expectLink(hrefLink(page, locale.routes.events, locale.contact.heroEventsCta), locale.routes.events);
  await expectLink(hrefLink(page, locale.routes.events, locale.contact.directLinks.events), locale.routes.events);
  await expectLink(hrefLink(page, locale.routes.results, locale.contact.directLinks.results), locale.routes.results);
  await expectLink(hrefLink(page, locale.routes.rankings, locale.contact.directLinks.rankings), locale.routes.rankings);
  await expectLink(hrefLink(page, locale.routes.help, locale.contact.directLinks.help), locale.routes.help);
  await expectLink(hrefLink(page, locale.routes.privacy, locale.contact.trustActions.privacy), locale.routes.privacy);
  await expectLink(hrefLink(page, locale.routes.terms, locale.contact.trustActions.terms), locale.routes.terms);
}

async function assertContactValidation(page: Page, locale: LocaleSpec) {
  await page.getByRole('button', { name: locale.contact.submitLabel, exact: true }).click();
  await expect(contactValidationAlert(page, locale.contact.invalidInput)).toContainText(locale.contact.invalidInput);
  await expect(contactMessageField(page, locale.contact.fieldLabels.message)).toHaveAttribute(
    'aria-invalid',
    'true',
  );
}

async function followContactLinks(page: Page, locale: LocaleSpec) {
  await openRoute(page, locale, 'contact');
  await followLink(
    hrefLink(page, locale.routes.help, locale.contact.heroHelpCta),
    page,
    locale.routes.help,
    locale.headings.help,
  );
  await openRoute(page, locale, 'contact');
  await followLink(
    hrefLink(page, locale.routes.events, locale.contact.heroEventsCta),
    page,
    locale.routes.events,
    locale.headings.events,
  );
  await openRoute(page, locale, 'contact');
  await followLink(
    hrefLink(page, locale.routes.events, locale.contact.directLinks.events),
    page,
    locale.routes.events,
    locale.headings.events,
  );
  await openRoute(page, locale, 'contact');
  await followLink(
    hrefLink(page, locale.routes.results, locale.contact.directLinks.results),
    page,
    locale.routes.results,
    locale.headings.results,
  );
  await openRoute(page, locale, 'contact');
  await followLink(
    hrefLink(page, locale.routes.rankings, locale.contact.directLinks.rankings),
    page,
    locale.routes.rankings,
    locale.headings.rankings,
  );
  await openRoute(page, locale, 'contact');
  await followLink(
    hrefLink(page, locale.routes.help, locale.contact.directLinks.help),
    page,
    locale.routes.help,
    locale.headings.help,
  );
  await openRoute(page, locale, 'contact');
  await followLink(
    hrefLink(page, locale.routes.privacy, locale.contact.trustActions.privacy),
    page,
    locale.routes.privacy,
    locale.headings.privacy,
  );
  await openRoute(page, locale, 'contact');
  await followLink(
    hrefLink(page, locale.routes.terms, locale.contact.trustActions.terms),
    page,
    locale.routes.terms,
    locale.headings.terms,
  );
}

async function assertHelpPage(page: Page, locale: LocaleSpec) {
  await openRoute(page, locale, 'help');
  await expect(page.getByRole('heading', { name: locale.help.categoriesTitle, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: locale.help.faqTitle, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: locale.help.ctaTitle, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: locale.help.helpfulLinksTitle, exact: true })).toBeVisible();

  for (const category of locale.help.categories) {
    await expect(page.locator(`a[href="#${category.id}"]`).getByText(category.title, { exact: true })).toBeVisible();
  }

  for (const group of locale.help.faqGroups) {
    await expect(page.locator(`section#${group.id}`).getByRole('heading', { name: group.title, exact: true })).toBeVisible();
  }
}

async function assertHelpInteraction(page: Page, locale: LocaleSpec) {
  await page.locator('summary').filter({ hasText: locale.help.faqQuestion }).first().click();
  await expect(page.getByText(locale.help.faqAnswer, { exact: true })).toBeVisible();
}

async function assertHelpHrefs(page: Page, locale: LocaleSpec) {
  await expectLink(visibleHrefLink(page, locale.routes.events, locale.help.heroEventsCta), locale.routes.events);
  await expectLink(visibleHrefLink(page, locale.routes.contact, locale.help.heroContactCta), locale.routes.contact);
  await expectLink(visibleHrefLink(page, locale.routes.contact, locale.help.ctaContact), locale.routes.contact);
  await expectLink(relatedCardLink(page, locale.routes.events, locale.help.helpfulLinks.events), locale.routes.events);
  await expectLink(relatedCardLink(page, locale.routes.results, locale.help.helpfulLinks.results), locale.routes.results);
  await expectLink(relatedCardLink(page, locale.routes.rankings, locale.help.helpfulLinks.rankings), locale.routes.rankings);
  await expectLink(relatedCardLink(page, locale.routes.home, locale.help.helpfulLinks.home), locale.routes.home);
}

async function followHelpLinks(page: Page, locale: LocaleSpec) {
  await openRoute(page, locale, 'help');
  await followLink(
    visibleHrefLink(page, locale.routes.events, locale.help.heroEventsCta),
    page,
    locale.routes.events,
    locale.headings.events,
  );
  await openRoute(page, locale, 'help');
  await followLink(
    relatedCardLink(page, locale.routes.events, locale.help.helpfulLinks.events),
    page,
    locale.routes.events,
    locale.headings.events,
  );
  await openRoute(page, locale, 'help');
  await followLink(
    relatedCardLink(page, locale.routes.results, locale.help.helpfulLinks.results),
    page,
    locale.routes.results,
    locale.headings.results,
  );
  await openRoute(page, locale, 'help');
  await followLink(
    relatedCardLink(page, locale.routes.rankings, locale.help.helpfulLinks.rankings),
    page,
    locale.routes.rankings,
    locale.headings.rankings,
  );
  await openRoute(page, locale, 'help');
  await followLinkByDomClick(
    relatedCardLink(page, locale.routes.home, locale.help.helpfulLinks.home),
    page,
    locale.routes.home,
    locale.headings.home,
  );
}

async function assertPrivacyPage(page: Page, locale: LocaleSpec) {
  await openRoute(page, locale, 'privacy');
  await expect(page.getByRole('heading', { name: locale.privacy.summaryTitle, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: locale.privacy.ctaTitle, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: locale.privacy.relatedTitle, exact: true })).toBeVisible();

  for (const sectionTitle of locale.privacy.sections) {
    await expect(page.getByRole('heading', { name: sectionTitle, exact: true })).toBeVisible();
  }
}

async function assertPrivacyHrefs(page: Page, locale: LocaleSpec) {
  await expectLink(hrefLink(page, locale.routes.contact, locale.privacy.heroContactCta), locale.routes.contact);
  await expectLink(hrefLink(page, locale.routes.terms, locale.privacy.heroTermsCta), locale.routes.terms);
  await expectLink(hrefLink(page, locale.routes.contact, locale.privacy.ctaContact), locale.routes.contact);
  await expectLink(hrefLink(page, locale.routes.terms, locale.privacy.relatedTerms), locale.routes.terms);
}

async function followPrivacyLinks(page: Page, locale: LocaleSpec) {
  await followLink(
    hrefLink(page, locale.routes.terms, locale.privacy.heroTermsCta),
    page,
    locale.routes.terms,
    locale.headings.terms,
  );
  await openRoute(page, locale, 'privacy');
  await followLink(
    hrefLink(page, locale.routes.terms, locale.privacy.relatedTerms),
    page,
    locale.routes.terms,
    locale.headings.terms,
  );
}

async function assertTermsPage(page: Page, locale: LocaleSpec) {
  await openRoute(page, locale, 'terms');
  await expect(page.getByRole('heading', { name: locale.terms.summaryTitle, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: locale.terms.ctaTitle, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: locale.terms.relatedTitle, exact: true })).toBeVisible();

  for (const sectionTitle of locale.terms.sections) {
    await expect(page.getByRole('heading', { name: sectionTitle, exact: true })).toBeVisible();
  }
}

async function assertTermsHrefs(page: Page, locale: LocaleSpec) {
  await expectLink(hrefLink(page, locale.routes.contact, locale.terms.heroContactCta), locale.routes.contact);
  await expectLink(hrefLink(page, locale.routes.privacy, locale.terms.heroPrivacyCta), locale.routes.privacy);
  await expectLink(hrefLink(page, locale.routes.contact, locale.terms.ctaContact), locale.routes.contact);
  await expectLink(hrefLink(page, locale.routes.privacy, locale.terms.relatedPrivacy), locale.routes.privacy);
}

async function followTermsLinks(page: Page, locale: LocaleSpec) {
  await followLink(
    hrefLink(page, locale.routes.privacy, locale.terms.heroPrivacyCta),
    page,
    locale.routes.privacy,
    locale.headings.privacy,
  );
  await openRoute(page, locale, 'terms');
  await followLink(
    hrefLink(page, locale.routes.privacy, locale.terms.relatedPrivacy),
    page,
    locale.routes.privacy,
    locale.headings.privacy,
  );
}

test.describe('Public trust/support/legal shell regression', () => {
  test('English routes render and major public-shell cross-links resolve to the expected destinations', async ({ page }) => {
    const locale = locales.find((entry) => entry.code === 'en');
    if (!locale) throw new Error('English locale configuration is missing');

    await assertContactPage(page, locale);
    await assertContactHrefs(page, locale);
    await assertContactValidation(page, locale);
    await followContactLinks(page, locale);

    await assertHelpPage(page, locale);
    await assertHelpHrefs(page, locale);
    await assertHelpInteraction(page, locale);
    await followHelpLinks(page, locale);

    await assertPrivacyPage(page, locale);
    await assertPrivacyHrefs(page, locale);
    await followPrivacyLinks(page, locale);

    await assertTermsPage(page, locale);
    await assertTermsHrefs(page, locale);
    await followTermsLinks(page, locale);
  });

  test('Spanish localized routes render and expose the expected localized hrefs', async ({ page }) => {
    const locale = locales.find((entry) => entry.code === 'es');
    if (!locale) throw new Error('Spanish locale configuration is missing');

    await assertContactPage(page, locale);
    await assertContactHrefs(page, locale);
    await assertContactValidation(page, locale);

    await assertHelpPage(page, locale);
    await assertHelpHrefs(page, locale);
    await assertHelpInteraction(page, locale);

    await assertPrivacyPage(page, locale);
    await assertPrivacyHrefs(page, locale);

    await assertTermsPage(page, locale);
    await assertTermsHrefs(page, locale);
  });
});
