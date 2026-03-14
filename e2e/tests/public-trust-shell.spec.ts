import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

type HomeMessages = {
  hero: {
    title: string;
  };
};

type ContactMessages = {
  hero: {
    title: string;
    primaryCta: string;
    secondaryCta: string;
  };
  triage: {
    title: string;
    items: {
      support: { title: string };
      partnerships: { title: string };
      accountOrEventIssue: { title: string };
    };
  };
  form: {
    title: string;
    fields: {
      name: { label: string };
      email: { label: string };
      message: { label: string };
    };
    submit: string;
    errors: {
      invalidInput: string;
    };
  };
  directLinks: {
    title: string;
    items: {
      events: { title: string };
      results: { title: string };
      rankings: { title: string };
      help: { title: string };
    };
  };
  trustBlock: {
    title: string;
    primaryActionLabel: string;
    secondaryActionLabel: string;
  };
};

type HelpMessages = {
  hero: {
    title: string;
    primaryCta: string;
    secondaryCta: string;
  };
  categories: {
    title: string;
    items: {
      registrations: { title: string };
      eventInformation: { title: string };
      results: { title: string };
      rankings: { title: string };
      payments: { title: string };
      accountBasics: { title: string };
    };
  };
  faqGroups: {
    title: string;
    groups: {
      registrations: {
        title: string;
        items: {
          checkStatus: {
            question: string;
            paragraphs: string[];
          };
        };
      };
      eventInformation: { title: string };
      results: { title: string };
      rankings: { title: string };
      payments: { title: string };
      accountBasics: { title: string };
    };
  };
  cta: {
    title: string;
    primaryActionLabel: string;
  };
  relatedLinks: {
    title: string;
    items: {
      events: { title: string };
      results: { title: string };
      rankings: { title: string };
      home: { title: string };
    };
  };
};

type PrivacyMessages = {
  hero: {
    title: string;
    primaryCta: string;
    secondaryCta: string;
  };
  summary: {
    title: string;
  };
  sections: {
    items: {
      informationWeCollect: { title: string };
      howInformationIsUsed: { title: string };
      whenInformationIsShared: { title: string };
      userChoicesAndContact: { title: string };
    };
  };
  cta: {
    title: string;
    primaryActionLabel: string;
  };
  relatedLinks: {
    title: string;
    items: {
      terms: { title: string };
    };
  };
};

type TermsMessages = {
  hero: {
    title: string;
    primaryCta: string;
    secondaryCta: string;
  };
  summary: {
    title: string;
  };
  sections: {
    items: {
      usingThePlatform: { title: string };
      accountsAndResponsibility: { title: string };
      registrationsPaymentsAndTransactions: { title: string };
      contactAndLegalQuestions: { title: string };
    };
  };
  cta: {
    title: string;
    primaryActionLabel: string;
  };
  relatedLinks: {
    title: string;
    items: {
      privacy: { title: string };
    };
  };
};

type PageTitleMessages = {
  title: string;
};

function loadJsonFile<T>(relativePath: string): T {
  return JSON.parse(readFileSync(join(process.cwd(), relativePath), 'utf8')) as T;
}

function createLocaleSpec(code: 'es' | 'en'): LocaleSpec {
  const home = loadJsonFile<HomeMessages>(`messages/pages/home/${code}.json`);
  const contact = loadJsonFile<ContactMessages>(`messages/pages/contact/${code}.json`);
  const help = loadJsonFile<HelpMessages>(`messages/pages/help/${code}.json`);
  const privacy = loadJsonFile<PrivacyMessages>(`messages/pages/privacy/${code}.json`);
  const terms = loadJsonFile<TermsMessages>(`messages/pages/terms/${code}.json`);
  const events = loadJsonFile<PageTitleMessages>(`messages/pages/events/${code}.json`);
  const results = loadJsonFile<PageTitleMessages>(`messages/pages/results/${code}.json`);
  const rankings = loadJsonFile<PageTitleMessages>(`messages/pages/rankings/${code}.json`);

  return {
    code,
    acceptLanguage: code === 'es' ? 'es-MX,es;q=0.9' : 'en-US,en;q=0.9',
    routes: {
      home: code === 'es' ? '/' : '/en',
      contact: code === 'es' ? '/contacto' : '/en/contact',
      help: code === 'es' ? '/ayuda' : '/en/help',
      privacy: code === 'es' ? '/privacidad' : '/en/privacy',
      terms: code === 'es' ? '/terminos' : '/en/terms',
      events: code === 'es' ? '/eventos' : '/en/events',
      results: code === 'es' ? '/resultados' : '/en/results',
      rankings: code === 'es' ? '/clasificaciones' : '/en/rankings',
    },
    headings: {
      home: home.hero.title,
      contact: contact.hero.title,
      help: help.hero.title,
      privacy: privacy.hero.title,
      terms: terms.hero.title,
      events: events.title,
      results: results.title,
      rankings: rankings.title,
    },
    contact: {
      heroHelpCta: contact.hero.primaryCta,
      heroEventsCta: contact.hero.secondaryCta,
      triageTitle: contact.triage.title,
      triageCards: [
        contact.triage.items.support.title,
        contact.triage.items.partnerships.title,
        contact.triage.items.accountOrEventIssue.title,
      ],
      formTitle: contact.form.title,
      directLinksTitle: contact.directLinks.title,
      directLinks: {
        events: contact.directLinks.items.events.title,
        results: contact.directLinks.items.results.title,
        rankings: contact.directLinks.items.rankings.title,
        help: contact.directLinks.items.help.title,
      },
      trustTitle: contact.trustBlock.title,
      trustActions: {
        privacy: contact.trustBlock.primaryActionLabel,
        terms: contact.trustBlock.secondaryActionLabel,
      },
      fieldLabels: {
        name: contact.form.fields.name.label,
        email: contact.form.fields.email.label,
        message: contact.form.fields.message.label,
      },
      submitLabel: contact.form.submit,
      invalidInput: contact.form.errors.invalidInput,
    },
    help: {
      heroEventsCta: help.hero.primaryCta,
      heroContactCta: help.hero.secondaryCta,
      categoriesTitle: help.categories.title,
      categories: [
        { id: 'registrations', title: help.categories.items.registrations.title },
        { id: 'eventInformation', title: help.categories.items.eventInformation.title },
        { id: 'results', title: help.categories.items.results.title },
        { id: 'rankings', title: help.categories.items.rankings.title },
        { id: 'payments', title: help.categories.items.payments.title },
        { id: 'accountBasics', title: help.categories.items.accountBasics.title },
      ],
      faqTitle: help.faqGroups.title,
      faqGroups: [
        { id: 'registrations', title: help.faqGroups.groups.registrations.title },
        { id: 'eventInformation', title: help.faqGroups.groups.eventInformation.title },
        { id: 'results', title: help.faqGroups.groups.results.title },
        { id: 'rankings', title: help.faqGroups.groups.rankings.title },
        { id: 'payments', title: help.faqGroups.groups.payments.title },
        { id: 'accountBasics', title: help.faqGroups.groups.accountBasics.title },
      ],
      faqQuestion: help.faqGroups.groups.registrations.items.checkStatus.question,
      faqAnswer: help.faqGroups.groups.registrations.items.checkStatus.paragraphs[0],
      ctaTitle: help.cta.title,
      ctaContact: help.cta.primaryActionLabel,
      helpfulLinksTitle: help.relatedLinks.title,
      helpfulLinks: {
        events: help.relatedLinks.items.events.title,
        results: help.relatedLinks.items.results.title,
        rankings: help.relatedLinks.items.rankings.title,
        home: help.relatedLinks.items.home.title,
      },
    },
    privacy: {
      heroContactCta: privacy.hero.primaryCta,
      heroTermsCta: privacy.hero.secondaryCta,
      summaryTitle: privacy.summary.title,
      sections: [
        privacy.sections.items.informationWeCollect.title,
        privacy.sections.items.howInformationIsUsed.title,
        privacy.sections.items.whenInformationIsShared.title,
        privacy.sections.items.userChoicesAndContact.title,
      ],
      ctaTitle: privacy.cta.title,
      ctaContact: privacy.cta.primaryActionLabel,
      relatedTitle: privacy.relatedLinks.title,
      relatedTerms: privacy.relatedLinks.items.terms.title,
    },
    terms: {
      heroContactCta: terms.hero.primaryCta,
      heroPrivacyCta: terms.hero.secondaryCta,
      summaryTitle: terms.summary.title,
      sections: [
        terms.sections.items.usingThePlatform.title,
        terms.sections.items.accountsAndResponsibility.title,
        terms.sections.items.registrationsPaymentsAndTransactions.title,
        terms.sections.items.contactAndLegalQuestions.title,
      ],
      ctaTitle: terms.cta.title,
      ctaContact: terms.cta.primaryActionLabel,
      relatedTitle: terms.relatedLinks.title,
      relatedPrivacy: terms.relatedLinks.items.privacy.title,
    },
  };
}

const locales: readonly LocaleSpec[] = [createLocaleSpec('es'), createLocaleSpec('en')] as const;

function localeOrThrow(code: LocaleSpec['code']) {
  const locale = locales.find((entry) => entry.code === code);
  if (!locale) {
    throw new Error(`${code} locale configuration is missing`);
  }
  return locale;
}

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

test.describe('Public trust/support/legal shell smoke', () => {
  test('English contact page renders, validates, and routes its primary CTA to help', async ({ page }) => {
    const locale = localeOrThrow('en');

    await assertContactPage(page, locale);
    await assertContactHrefs(page, locale);
    await assertContactValidation(page, locale);
    await followLink(
      hrefLink(page, locale.routes.help, locale.contact.heroHelpCta),
      page,
      locale.routes.help,
      locale.headings.help,
    );
  });

  test('English help page renders, expands FAQ content, and exposes the support CTA href', async ({ page }) => {
    const locale = localeOrThrow('en');

    await assertHelpPage(page, locale);
    await assertHelpHrefs(page, locale);
    await assertHelpInteraction(page, locale);
  });

  test('English privacy and terms pages keep their primary legal cross-links intact', async ({ page }) => {
    const locale = localeOrThrow('en');

    await assertPrivacyPage(page, locale);
    await assertPrivacyHrefs(page, locale);
    await followLink(
      hrefLink(page, locale.routes.terms, locale.privacy.heroTermsCta),
      page,
      locale.routes.terms,
      locale.headings.terms,
    );

    await assertTermsPage(page, locale);
    await assertTermsHrefs(page, locale);
    await followLink(
      hrefLink(page, locale.routes.privacy, locale.terms.heroPrivacyCta),
      page,
      locale.routes.privacy,
      locale.headings.privacy,
    );
  });

  test('Spanish localized routes render and expose the expected localized hrefs', async ({ page }) => {
    const locale = localeOrThrow('es');

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

test.describe('Public trust/support/legal shell regression', { tag: '@extended' }, () => {
  test('English contact cross-links resolve to the expected destinations', async ({ page }) => {
    await followContactLinks(page, localeOrThrow('en'));
  });

  test('English help cross-links resolve to the expected destinations', async ({ page }) => {
    await followHelpLinks(page, localeOrThrow('en'));
  });

  test('English privacy cross-links resolve to the expected destinations', async ({ page }) => {
    const locale = localeOrThrow('en');
    await assertPrivacyPage(page, locale);
    await assertPrivacyHrefs(page, locale);
    await followPrivacyLinks(page, locale);
  });

  test('English terms cross-links resolve to the expected destinations', async ({ page }) => {
    const locale = localeOrThrow('en');
    await assertTermsPage(page, locale);
    await assertTermsHrefs(page, locale);
    await followTermsLinks(page, locale);
  });
});
