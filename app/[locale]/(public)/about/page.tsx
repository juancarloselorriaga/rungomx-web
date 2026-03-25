import {
  ContentCard,
  CtaBanner,
  Hero,
  IconList,
  Section,
  TextBlock,
} from '@/components/common';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { createLocalizedPageMetadata } from '@/utils/seo';
import { CalendarDays, CircleHelp, Medal } from 'lucide-react';
import type { Metadata } from 'next';
import { getMessages } from 'next-intl/server';

export async function generateMetadata({ params }: LocalePageProps): Promise<Metadata> {
  const { locale } = await params;
  return createLocalizedPageMetadata(
    locale,
    '/about',
    (messages) => messages.Pages?.About?.metadata,
    { imagePath: '/og-about.jpg' },
  );
}

type AboutSectionCard = {
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
const focusIconClasses = {
  discover: 'bg-[var(--brand-blue)]/12 text-[var(--brand-blue)]',
  follow: 'bg-[var(--brand-green)]/12 text-[var(--brand-green)]',
  support: 'bg-[var(--brand-indigo)]/12 text-[var(--brand-indigo)]',
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
        padding="lg"
        actions={[
          { label: page.hero.primaryCta, href: '/events' },
          { label: page.hero.secondaryCta, href: '/results', variant: 'outline' },
        ]}
      />

      <Section padding="md" size="lg">
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
        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
          <TextBlock
            eyebrow={page.focus.eyebrow}
            eyebrowVariant="blue"
            title={page.focus.title}
            description={page.focus.description}
            size="md"
          />

          <div className="overflow-hidden rounded-3xl border border-border bg-card">
            {focusOrder.map((key, index) => {
              const item = page.focus.items[key];
              const Icon = focusIcons[key];

              return (
                <div
                  key={key}
                  className={index === 0 ? 'p-6 md:p-8' : 'border-t border-border p-6 md:p-8'}
                >
                  <div className="flex items-start gap-4">
                    <div className={`inline-flex rounded-xl p-3 ${focusIconClasses[key]}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-lg font-semibold text-foreground">{item.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Section>

      <Section padding="md" size="md">
        <CtaBanner
          title={page.cta.title}
          subtitle={page.cta.description}
          actions={[
            { label: page.cta.primaryActionLabel, href: '/events' },
            { label: page.cta.secondaryActionLabel, href: '/results', variant: 'outline' },
          ]}
          variant="muted"
        />
      </Section>
    </div>
  );
}
