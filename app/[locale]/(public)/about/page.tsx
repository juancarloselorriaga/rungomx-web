import { Hero, IconList, Section, TextBlock } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
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
  discover: 'bg-[var(--brand-blue)]/8 text-[var(--brand-blue-dark)]',
  follow: 'bg-[var(--brand-green)]/8 text-[var(--brand-green-dark)]',
  support: 'bg-[var(--brand-indigo)]/8 text-[var(--brand-indigo)]',
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
        actions={[
          { label: page.hero.primaryCta, href: '/events' },
          { label: page.hero.secondaryCta, href: '/results', variant: 'outline' },
        ]}
      />

      <Section padding="md" size="lg">
        <TextBlock
          eyebrow={page.story.eyebrow}
          eyebrowVariant="green"
          title={page.story.title}
          description={page.story.description}
          size="md"
          className="max-w-[46rem]"
        >
          <div className="space-y-4 text-base leading-7 text-muted-foreground">
            <p>{page.story.paragraph1}</p>
            <p>{page.story.paragraph2}</p>
          </div>
        </TextBlock>

        <div className="mt-12 border-t border-border/70 pt-8 md:pt-10">
          <h3 className="font-display text-[clamp(1.7rem,3vw,2.35rem)] font-medium leading-[0.96] tracking-[-0.03em] text-foreground">
            {page.story.cardTitle}
          </h3>
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
            className="mt-6 max-w-[42rem]"
          />
        </div>
      </Section>

      <Section variant="muted" padding="lg" size="lg">
        <TextBlock
          eyebrow={page.focus.eyebrow}
          eyebrowVariant="blue"
          title={page.focus.title}
          description={page.focus.description}
          size="md"
          className="max-w-[46rem]"
        />

        <div className="mt-12 grid gap-6 border-t border-border/70 pt-8 md:grid-cols-3 md:gap-8 md:pt-10">
          {focusOrder.map((key, index) => {
            const item = page.focus.items[key];
            const Icon = focusIcons[key];

            return (
              <article key={key} className="flex h-full flex-col border-t border-border/70 pt-6 md:border-t-0 md:pt-0">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    0{index + 1}
                  </span>
                  <div className={`inline-flex rounded-md p-3 ${focusIconClasses[key]}`}>
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
      </Section>

      <Section padding="sm" size="lg">
        <div className="border-t border-border/70 pt-8 md:pt-10">
          <TextBlock
            title={page.cta.title}
            description={page.cta.description}
            size="md"
            className="max-w-[46rem]"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button asChild className="w-fit">
                <Link href="/events">{page.cta.primaryActionLabel}</Link>
              </Button>
              <Button asChild variant="outline" className="w-fit">
                <Link href="/results">{page.cta.secondaryActionLabel}</Link>
              </Button>
            </div>
          </TextBlock>
        </div>
      </Section>
    </div>
  );
}
