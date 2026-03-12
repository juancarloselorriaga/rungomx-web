import {
  ContentCard,
  CtaBanner,
  Hero,
  IconList,
  LegalDocumentSection,
  RelatedLinksStrip,
  Section,
  TextBlock,
} from '@/components/common';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { createLocalizedPageMetadata } from '@/utils/seo';
import type { Metadata } from 'next';
import { getMessages } from 'next-intl/server';

export async function generateMetadata({ params }: LocalePageProps): Promise<Metadata> {
  const { locale } = await params;
  return createLocalizedPageMetadata(locale, '/terms', (messages) => messages.Pages?.Terms?.metadata);
}

type TermsSectionKey =
  | 'usingThePlatform'
  | 'accountsAndResponsibility'
  | 'eventInformationAndOrganizerContent'
  | 'registrationsPaymentsAndTransactions'
  | 'resultsRankingsAndPublicInfo'
  | 'acceptableUse'
  | 'platformChangesInterruptionsAndLimitations'
  | 'contactAndLegalQuestions';

type LegalSectionContent = {
  title: string;
  intro?: string;
  paragraphs: string[];
  bullets?: string[];
};

type RelatedLinkContent = {
  title: string;
  description: string;
};

type TermsPageMessages = {
  hero: {
    badge: string;
    title: string;
    description: string;
    primaryCta: string;
    secondaryCta: string;
  };
  summary: {
    eyebrow: string;
    title: string;
    description: string;
    highlights: string[];
  };
  sections: {
    eyebrow: string;
    title: string;
    description: string;
    items: Record<TermsSectionKey, LegalSectionContent>;
  };
  cta: {
    title: string;
    description: string;
    primaryActionLabel: string;
  };
  relatedLinks: {
    eyebrow: string;
    title: string;
    description: string;
    items: {
      privacy: RelatedLinkContent;
    };
  };
};

const termsSectionOrder: TermsSectionKey[] = [
  'usingThePlatform',
  'accountsAndResponsibility',
  'eventInformationAndOrganizerContent',
  'registrationsPaymentsAndTransactions',
  'resultsRankingsAndPublicInfo',
  'acceptableUse',
  'platformChangesInterruptionsAndLimitations',
  'contactAndLegalQuestions',
];

export default async function TermsPage({ params }: LocalePageProps) {
  const { locale } = await configPageLocale(params, { pathname: '/terms' });
  const messages = (await getMessages({ locale })) as {
    pages: { terms: TermsPageMessages };
  };
  const page = messages.pages.terms;

  return (
    <div className="w-full">
      <Hero
        badge={page.hero.badge}
        badgeVariant="green"
        title={page.hero.title}
        description={page.hero.description}
        variant="gradient-green"
        actions={[
          { label: page.hero.primaryCta, href: '/contact' },
          { label: page.hero.secondaryCta, href: '/privacy', variant: 'outline' },
        ]}
      />

      <Section variant="muted" padding="md" size="lg">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-start">
          <TextBlock
            eyebrow={page.summary.eyebrow}
            eyebrowVariant="blue"
            title={page.summary.title}
            description={page.summary.description}
            size="md"
          />

          <ContentCard variant="default" className="h-full">
            <IconList items={page.summary.highlights} iconVariant="green" spacing="relaxed" />
          </ContentCard>
        </div>
      </Section>

      <Section padding="lg" size="md">
        <TextBlock
          eyebrow={page.sections.eyebrow}
          eyebrowVariant="green"
          title={page.sections.title}
          description={page.sections.description}
          align="center"
          size="lg"
          className="mb-10"
        />

        <div className="space-y-6">
          {termsSectionOrder.map((key) => {
            const section = page.sections.items[key];

            return (
              <LegalDocumentSection key={key} id={key} title={section.title} intro={section.intro}>
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
                {section.bullets && section.bullets.length > 0 ? (
                  <ul className="list-disc space-y-2 pl-5">
                    {section.bullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                ) : null}
              </LegalDocumentSection>
            );
          })}
        </div>
      </Section>

      <Section padding="md" size="md">
        <CtaBanner
          title={page.cta.title}
          subtitle={page.cta.description}
          actions={[{ label: page.cta.primaryActionLabel, href: '/contact' }]}
          variant="gradient-green"
        />
      </Section>

      <Section padding="md" size="lg">
        <RelatedLinksStrip
          eyebrow={page.relatedLinks.eyebrow}
          title={page.relatedLinks.title}
          description={page.relatedLinks.description}
          links={[{ href: '/privacy', ...page.relatedLinks.items.privacy }]}
        />
      </Section>
    </div>
  );
}
