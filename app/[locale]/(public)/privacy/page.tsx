import {
  Hero,
  LegalDocumentSection,
  RelatedLinksStrip,
  Section,
  TextBlock,
} from '@/components/common';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
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
        <TextBlock
          eyebrow={page.summary.eyebrow}
          eyebrowVariant="green"
          title={page.summary.title}
          description={page.summary.description}
          size="md"
          className="max-w-[46rem]"
        />

        <div className="mt-12 grid gap-6 border-t border-border/70 pt-8 md:grid-cols-2 md:gap-8 md:pt-10">
          {page.summary.highlights.map((highlight, index) => (
            <article
              key={highlight}
              className="flex h-full flex-col border-t border-border/70 pt-6 md:border-t-0 md:pt-0"
            >
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                0{index + 1}
              </span>
              <p className="mt-5 max-w-[34ch] text-sm leading-7 text-muted-foreground md:text-base">
                {highlight}
              </p>
            </article>
          ))}
        </div>
      </Section>

      <Section padding="lg" size="lg">
        <TextBlock
          eyebrow={page.sections.eyebrow}
          eyebrowVariant="blue"
          title={page.sections.title}
          description={page.sections.description}
          size="md"
          className="max-w-[46rem]"
        />

        <div className="mt-12 space-y-10 md:space-y-12">
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

      <Section padding="sm" size="lg">
        <div className="border-t border-border/70 pt-8 md:pt-10">
          <TextBlock
            title={page.cta.title}
            description={page.cta.description}
            size="md"
            className="max-w-[46rem]"
          >
            <Button asChild className="w-fit">
              <Link href="/contact">{page.cta.primaryActionLabel}</Link>
            </Button>
          </TextBlock>
        </div>
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
