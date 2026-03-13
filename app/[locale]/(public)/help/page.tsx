import {
  BentoGrid,
  CtaBanner,
  FaqAccordion,
  type FaqAccordionGroup,
  FeatureCard,
  Hero,
  RelatedLinksStrip,
  Section,
  TextBlock,
} from '@/components/common';
import { Link } from '@/i18n/navigation';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { createLocalizedPageMetadata } from '@/utils/seo';
import {
  CalendarDays,
  CreditCard,
  Medal,
  Ticket,
  Trophy,
  User,
} from 'lucide-react';
import type { Metadata } from 'next';
import { getMessages } from 'next-intl/server';
import type { ComponentProps } from 'react';

export async function generateMetadata({ params }: LocalePageProps): Promise<Metadata> {
  const { locale } = await params;
  return createLocalizedPageMetadata(locale, '/help', (messages) => messages.Pages?.Help?.metadata);
}

type HelpCategoryKey =
  | 'registrations'
  | 'eventInformation'
  | 'results'
  | 'rankings'
  | 'payments'
  | 'accountBasics';

type LocalizedLinkHref = ComponentProps<typeof Link>['href'];

type HelpFaqItemContent = {
  question: string;
  answerTitle?: string;
  paragraphs?: string[];
  bullets?: string[];
  links?: Array<{
    href: LocalizedLinkHref;
    label: string;
  }>;
};

type HelpCategoryContent = {
  title: string;
  description: string;
  linkLabel: string;
};

type RelatedLinkContent = {
  href: LocalizedLinkHref;
  title: string;
  description: string;
};

type HelpPageMessages = {
  hero: {
    badge: string;
    title: string;
    description: string;
    primaryCta: string;
    secondaryCta: string;
  };
  categories: {
    eyebrow: string;
    title: string;
    description: string;
    items: Record<HelpCategoryKey, HelpCategoryContent>;
  };
  faqGroups: {
    eyebrow: string;
    title: string;
    description: string;
    groups: Record<
      HelpCategoryKey,
      {
        title: string;
        description: string;
        items: Record<string, HelpFaqItemContent>;
      }
    >;
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
      events: RelatedLinkContent;
      results: RelatedLinkContent;
      rankings: RelatedLinkContent;
      home: RelatedLinkContent;
    };
  };
};

const categoryOrder: HelpCategoryKey[] = [
  'registrations',
  'eventInformation',
  'results',
  'rankings',
  'payments',
  'accountBasics',
];

const categoryIcons = {
  registrations: Ticket,
  eventInformation: CalendarDays,
  results: Medal,
  rankings: Trophy,
  payments: CreditCard,
  accountBasics: User,
} satisfies Record<HelpCategoryKey, typeof Ticket>;

const categoryVariants = {
  registrations: 'blue',
  eventInformation: 'green',
  results: 'indigo',
  rankings: 'blue',
  payments: 'green',
  accountBasics: 'muted',
} as const;

export default async function HelpPage({ params }: LocalePageProps) {
  const { locale } = await configPageLocale(params, { pathname: '/help' });
  const messages = (await getMessages({ locale })) as {
    pages: { help: HelpPageMessages };
  };
  const page = messages.pages.help;

  const faqGroups: FaqAccordionGroup[] = categoryOrder.map((key) => {
    const group = page.faqGroups.groups[key];

    return {
      id: key,
      title: group.title,
      description: group.description,
      items: Object.entries(group.items).map(([itemKey, item]) => ({
        id: `${key}-${itemKey}`,
        question: item.question,
        answerTitle: item.answerTitle,
        paragraphs: item.paragraphs,
        bullets: item.bullets,
        links: item.links,
      })),
    };
  });

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
          { label: page.hero.secondaryCta, href: '/contact', variant: 'outline' },
        ]}
      />

      <Section variant="muted" padding="md" size="lg">
        <TextBlock
          eyebrow={page.categories.eyebrow}
          eyebrowVariant="green"
          title={page.categories.title}
          description={page.categories.description}
          align="center"
          size="lg"
          className="mb-10"
        />

        <BentoGrid columns={3}>
          {categoryOrder.map((key) => {
            const category = page.categories.items[key];
            const Icon = categoryIcons[key];

            return (
              <a key={key} href={`#${key}`} className="block h-full">
                <FeatureCard
                  icon={Icon}
                  variant={categoryVariants[key]}
                  title={category.title}
                  description={category.description}
                  className="h-full"
                >
                  <p className="mt-4 text-sm font-medium text-[var(--brand-blue)]">
                    {category.linkLabel}
                  </p>
                </FeatureCard>
              </a>
            );
          })}
        </BentoGrid>
      </Section>

      <Section padding="lg" size="lg">
        <TextBlock
          eyebrow={page.faqGroups.eyebrow}
          eyebrowVariant="blue"
          title={page.faqGroups.title}
          description={page.faqGroups.description}
          align="center"
          size="lg"
          className="mb-10"
        />

        <FaqAccordion groups={faqGroups} />
      </Section>

      <Section padding="md" size="md">
        <CtaBanner
          title={page.cta.title}
          subtitle={page.cta.description}
          actions={[{ label: page.cta.primaryActionLabel, href: '/contact' }]}
          variant="gradient"
        />
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
            page.relatedLinks.items.home,
          ]}
        />
      </Section>
    </div>
  );
}
