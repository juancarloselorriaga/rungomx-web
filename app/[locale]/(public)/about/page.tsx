import {
  ContentCard,
  CtaBanner,
  FeatureCard,
  Hero,
  IconList,
  RelatedLinksStrip,
  Section,
  TextBlock,
} from '@/components/common';
import { Link } from '@/i18n/navigation';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { createLocalizedPageMetadata } from '@/utils/seo';
import { CalendarDays, CircleHelp, Medal, Trophy } from 'lucide-react';
import type { Metadata } from 'next';
import { getMessages } from 'next-intl/server';
import type { ComponentProps } from 'react';

export async function generateMetadata({ params }: LocalePageProps): Promise<Metadata> {
  const { locale } = await params;
  return createLocalizedPageMetadata(
    locale,
    '/about',
    (messages) => messages.Pages?.About?.metadata,
    { imagePath: '/og-about.jpg' },
  );
}

type LocalizedLinkHref = ComponentProps<typeof Link>['href'];

type AboutSectionCard = {
  title: string;
  description: string;
};

type RelatedLinkContent = {
  href: LocalizedLinkHref;
  title: string;
  description: string;
};

type AboutPageMessages = {
  hero: {
    badge: string;
    title: string;
    description: string;
    primaryCta: string;
    secondaryCta: string;
  };
  story: {
    eyebrow: string;
    title: string;
    description: string;
    paragraph1: string;
    paragraph2: string;
    cardTitle: string;
    highlights: {
      eventDiscovery: string;
      registrationContext: string;
      officialResults: string;
      rankings: string;
      helpAndTrust: string;
    };
  };
  focus: {
    eyebrow: string;
    title: string;
    description: string;
    items: {
      discover: AboutSectionCard;
      follow: AboutSectionCard;
      support: AboutSectionCard;
    };
  };
  proof: {
    eyebrow: string;
    title: string;
    description: string;
    items: {
      events: AboutSectionCard;
      registration: AboutSectionCard;
      results: AboutSectionCard;
      rankings: AboutSectionCard;
    };
  };
  relatedLinks: {
    eyebrow: string;
    title: string;
    description: string;
    items: {
      events: RelatedLinkContent;
      results: RelatedLinkContent;
      rankings: RelatedLinkContent;
      contact: RelatedLinkContent;
    };
  };
  cta: {
    title: string;
    description: string;
    primaryActionLabel: string;
    secondaryActionLabel: string;
  };
};

const focusOrder = ['discover', 'follow', 'support'] as const;
const focusIcons = {
  discover: CalendarDays,
  follow: Medal,
  support: CircleHelp,
} as const;
const focusVariants = {
  discover: 'blue',
  follow: 'green',
  support: 'indigo',
} as const;

const proofOrder = ['events', 'registration', 'results', 'rankings'] as const;
const proofIcons = {
  events: CalendarDays,
  registration: Trophy,
  results: Medal,
  rankings: Trophy,
} as const;
const proofVariants = {
  events: 'blue',
  registration: 'indigo',
  results: 'green',
  rankings: 'blue',
} as const;

export default async function AboutPage({ params }: LocalePageProps) {
  const { locale } = await configPageLocale(params, { pathname: '/about' });
  const messages = (await getMessages({ locale })) as {
    pages: { about: AboutPageMessages };
  };
  const page = messages.pages.about;

  return (
    <div className="w-full">
      <Hero
        badge={page.hero.badge}
        badgeVariant="blue"
        title={page.hero.title}
        description={page.hero.description}
        variant="gradient-blue"
        actions={[
          { label: page.hero.primaryCta, href: '/events' },
          { label: page.hero.secondaryCta, href: '/results', variant: 'outline' },
        ]}
      />

      <Section padding="lg" size="lg">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-start">
          <TextBlock
            eyebrow={page.story.eyebrow}
            eyebrowVariant="green"
            title={page.story.title}
            description={page.story.description}
            size="md"
          >
            <div className="space-y-4 text-base leading-7 text-muted-foreground">
              <p>{page.story.paragraph1}</p>
              <p>{page.story.paragraph2}</p>
            </div>
          </TextBlock>

          <ContentCard title={page.story.cardTitle} variant="default" className="h-full">
            <IconList
              items={[
                page.story.highlights.eventDiscovery,
                page.story.highlights.registrationContext,
                page.story.highlights.officialResults,
                page.story.highlights.rankings,
                page.story.highlights.helpAndTrust,
              ]}
              iconVariant="blue"
              spacing="relaxed"
            />
          </ContentCard>
        </div>
      </Section>

      <Section variant="muted" padding="md" size="lg">
        <TextBlock
          eyebrow={page.focus.eyebrow}
          eyebrowVariant="blue"
          title={page.focus.title}
          description={page.focus.description}
          align="center"
          size="lg"
          className="mb-10"
        />

        <div className="grid gap-6 md:grid-cols-3">
          {focusOrder.map((key) => {
            const item = page.focus.items[key];
            const Icon = focusIcons[key];

            return (
              <FeatureCard
                key={key}
                icon={Icon}
                variant={focusVariants[key]}
                title={item.title}
                description={item.description}
                className="h-full"
              />
            );
          })}
        </div>
      </Section>

      <Section padding="lg" size="lg">
        <TextBlock
          eyebrow={page.proof.eyebrow}
          eyebrowVariant="green"
          title={page.proof.title}
          description={page.proof.description}
          align="center"
          size="lg"
          className="mb-10"
        />

        <div className="grid gap-6 md:grid-cols-2">
          {proofOrder.map((key) => {
            const item = page.proof.items[key];
            const Icon = proofIcons[key];

            return (
              <FeatureCard
                key={key}
                icon={Icon}
                variant={proofVariants[key]}
                title={item.title}
                description={item.description}
                className="h-full"
              />
            );
          })}
        </div>
      </Section>

      <Section padding="md" size="lg">
        <RelatedLinksStrip
          eyebrow={page.relatedLinks.eyebrow}
          title={page.relatedLinks.title}
          description={page.relatedLinks.description}
          links={[
            page.relatedLinks.items.events,
            page.relatedLinks.items.results,
            page.relatedLinks.items.rankings,
            page.relatedLinks.items.contact,
          ]}
        />
      </Section>

      <Section padding="md" size="md">
        <CtaBanner
          title={page.cta.title}
          subtitle={page.cta.description}
          actions={[
            { label: page.cta.primaryActionLabel, href: '/events' },
            { label: page.cta.secondaryActionLabel, href: '/contact', variant: 'outline' },
          ]}
          variant="gradient"
        />
      </Section>
    </div>
  );
}
