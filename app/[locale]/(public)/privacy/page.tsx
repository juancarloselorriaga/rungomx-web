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
  return createLocalizedPageMetadata(locale, '/privacy', (messages) => messages.Pages?.Privacy?.metadata);
}

type PrivacySectionKey =
  | 'informationWeCollect'
  | 'howInformationIsUsed'
  | 'whenInformationIsShared'
  | 'eventOrganizerRelationship'
  | 'communicationsAndSupport'
  | 'dataRetentionAndAccounts'
  | 'userChoicesAndContact';

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

type PrivacyPageMessages = {
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
    items: Record<PrivacySectionKey, LegalSectionContent>;
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
      terms: RelatedLinkContent;
    };
  };
};

const privacySectionOrder: PrivacySectionKey[] = [
  'informationWeCollect',
  'howInformationIsUsed',
  'whenInformationIsShared',
  'eventOrganizerRelationship',
  'communicationsAndSupport',
  'dataRetentionAndAccounts',
  'userChoicesAndContact',
];

export default async function PrivacyPage({ params }: LocalePageProps) {
  const { locale } = await configPageLocale(params, { pathname: '/privacy' });
  const messages = (await getMessages({ locale })) as {
    pages: { privacy: PrivacyPageMessages };
  };
  const page = messages.pages.privacy;

  return (
    <div className="w-full">
      <Hero
        badge={page.hero.badge}
        badgeVariant="blue"
        title={page.hero.title}
        description={page.hero.description}
        variant="gradient-blue"
        actions={[
          { label: page.hero.primaryCta, href: '/contact' },
          { label: page.hero.secondaryCta, href: '/terms', variant: 'outline' },
        ]}
      />

      <Section variant="muted" padding="md" size="lg">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-start">
          <TextBlock
            eyebrow={page.summary.eyebrow}
            eyebrowVariant="green"
            title={page.summary.title}
            description={page.summary.description}
            size="md"
          />

          <ContentCard variant="default" className="h-full">
            <IconList items={page.summary.highlights} iconVariant="blue" spacing="relaxed" />
          </ContentCard>
        </div>
      </Section>

      <Section padding="lg" size="md">
        <TextBlock
          eyebrow={page.sections.eyebrow}
          eyebrowVariant="blue"
          title={page.sections.title}
          description={page.sections.description}
          align="center"
          size="lg"
          className="mb-10"
        />

        <div className="space-y-6">
          {privacySectionOrder.map((key) => {
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
        />
      </Section>

      <Section padding="md" size="lg">
        <RelatedLinksStrip
          eyebrow={page.relatedLinks.eyebrow}
          title={page.relatedLinks.title}
          description={page.relatedLinks.description}
          links={[{ href: '/terms', ...page.relatedLinks.items.terms }]}
        />
      </Section>
    </div>
  );
}
