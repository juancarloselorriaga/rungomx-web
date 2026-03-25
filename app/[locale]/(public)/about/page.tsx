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
  discover:
    'border-[var(--brand-blue)]/15 bg-[var(--brand-blue)]/8 text-[var(--brand-blue-dark)]',
  follow:
    'border-[var(--brand-green)]/15 bg-[var(--brand-green)]/8 text-[var(--brand-green-dark)]',
  support: 'border-[var(--brand-indigo)]/15 bg-[var(--brand-indigo)]/8 text-[var(--brand-indigo)]',
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
        titleSize="xl"
        align="left"
        padding="lg"
        className="border-t border-border/60"
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
            size="sm"
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

      <Section variant="muted" padding="lg" size="lg">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:items-start">
          <TextBlock
            eyebrow={page.focus.eyebrow}
            eyebrowVariant="blue"
            title={page.focus.title}
            description={page.focus.description}
            size="sm"
          />

          <div className="grid gap-5 md:grid-cols-3">
            {focusOrder.map((key, index) => {
              const item = page.focus.items[key];
              const Icon = focusIcons[key];

              return (
                <article
                  key={key}
                  className="flex h-full flex-col rounded-[1.5rem] border border-border/75 bg-[color-mix(in_oklch,var(--background)_60%,var(--background-surface)_40%)] p-6 md:p-7"
                >
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      0{index + 1}
                    </span>
                    <div className={`inline-flex rounded-md border p-3 ${focusIconClasses[key]}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                  </div>
                  <div className="mt-6 min-w-0">
                    <h3 className="font-display text-[clamp(1.5rem,2.8vw,2rem)] font-medium leading-tight tracking-[-0.03em] text-foreground">
                      {item.title}
                    </h3>
                    <p className="mt-3 text-sm leading-7 text-muted-foreground">{item.description}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </Section>

      <Section padding="sm" size="md">
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
