import {
  Hero,
  Section,
  TextBlock,
} from '@/components/common';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { createLocalizedPageMetadata } from '@/utils/seo';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import {
  ArrowRight,
  CalendarDays,
  Flag,
  Medal,
  Trophy,
} from 'lucide-react';

export async function generateMetadata({ params }: LocalePageProps): Promise<Metadata> {
  const { locale } = await params;
  return createLocalizedPageMetadata(locale, '/', (messages) => messages.Pages?.Home?.metadata, {
    imagePath: '/favicon.ico',
  });
}

const publicRoutes = {
  events: '/events',
  results: '/results',
  rankings: '/rankings',
  about: '/about',
} as const;

const proofPathIconClasses = {
  blue: 'text-[var(--brand-blue-dark)]',
  green: 'text-[var(--brand-green-dark)]',
  indigo: 'text-[var(--brand-indigo)]',
} as const;

export default async function Home({ params }: LocalePageProps) {
  await configPageLocale(params, { pathname: '/' });

  const t = await getTranslations('pages.home');

  const proofPaths = [
    {
      icon: CalendarDays,
      title: t('proofPaths.items.events.title'),
      description: t('proofPaths.items.events.description'),
      cta: t('proofPaths.items.events.cta'),
      href: publicRoutes.events,
      variant: 'blue' as const,
    },
    {
      icon: Medal,
      title: t('proofPaths.items.results.title'),
      description: t('proofPaths.items.results.description'),
      cta: t('proofPaths.items.results.cta'),
      href: publicRoutes.results,
      variant: 'green' as const,
    },
    {
      icon: Trophy,
      title: t('proofPaths.items.rankings.title'),
      description: t('proofPaths.items.rankings.description'),
      cta: t('proofPaths.items.rankings.cta'),
      href: publicRoutes.rankings,
      variant: 'indigo' as const,
    },
  ];

  const eventPageHighlights = [
    t('eventPages.highlights.clarity'),
    t('eventPages.highlights.trust'),
    t('eventPages.highlights.conversion'),
  ];

  const supportingLinks = [
    {
      icon: Medal,
      title: t('proofPaths.items.results.title'),
      description: t('resultsRankings.highlights.results'),
      cta: t('ctas.viewResults'),
      href: publicRoutes.results,
      iconClassName: 'text-[var(--brand-green-dark)]',
      iconBackgroundClassName: 'bg-[var(--brand-green)]/8',
    },
    {
      icon: Trophy,
      title: t('proofPaths.items.rankings.title'),
      description: t('resultsRankings.highlights.rankings'),
      cta: t('ctas.viewRankings'),
      href: publicRoutes.rankings,
      iconClassName: 'text-[var(--brand-indigo)]',
      iconBackgroundClassName: 'bg-[var(--brand-indigo)]/8',
    },
    {
      icon: Flag,
      title: t('aboutBridge.title'),
      description: t('aboutBridge.description'),
      cta: t('aboutBridge.cta'),
      href: publicRoutes.about,
      iconClassName: 'text-[var(--brand-blue-dark)]',
      iconBackgroundClassName: 'bg-[var(--brand-blue)]/8',
    },
  ];

  return (
    <div className="w-full">
      <Hero
        badge={t('hero.eyebrow')}
        badgeVariant="blue"
        title={t('hero.title')}
        description={t('hero.description')}
        variant="gradient-blue"
        titleSize="xl"
        align="left"
        padding="lg"
        actions={[
          { label: t('hero.primaryCta'), href: publicRoutes.events },
          { label: t('hero.secondaryCta'), href: publicRoutes.results, variant: 'outline' },
        ]}
      />

      <Section padding="md" size="lg">
        <TextBlock
          eyebrow={t('proofPaths.eyebrow')}
          eyebrowVariant="blue"
          title={t('proofPaths.title')}
          description={t('proofPaths.description')}
          size="md"
          className="max-w-[46rem]"
        />

        <div className="mt-12 border-t border-border/70">
          {proofPaths.map((path, index) => {
            const Icon = path.icon;
            const iconClasses = proofPathIconClasses[path.variant];

            return (
              <Link
                key={path.href}
                href={path.href}
                className="group grid gap-5 border-b border-border/70 py-8 transition-colors duration-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-start md:gap-8 md:py-10"
              >
                <div className="flex items-center justify-between gap-4 md:block">
                  <span className="text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    0{index + 1}
                  </span>
                  <Icon className={`h-5 w-5 md:mt-5 ${iconClasses}`} />
                </div>
                <div>
                  <h2 className="font-display text-[clamp(1.85rem,3.4vw,2.8rem)] font-medium leading-[0.94] tracking-[-0.035em] text-foreground">
                    {path.title}
                  </h2>
                  <p className="mt-3 max-w-[46ch] text-sm leading-7 text-muted-foreground md:text-base">
                    {path.description}
                  </p>
                </div>
                <span className="inline-flex items-center gap-2 self-start text-sm font-semibold text-foreground md:mt-2">
                  {path.cta}
                  <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                </span>
              </Link>
            );
          })}
        </div>
      </Section>

      <Section variant="muted" padding="lg" size="lg">
        <TextBlock
          eyebrow={t('eventPages.eyebrow')}
          eyebrowVariant="blue"
          title={t('eventPages.title')}
          description={t('eventPages.description')}
          size="md"
          className="max-w-[46rem]"
        >
          <Button asChild className="w-fit">
            <Link href={publicRoutes.events}>{t('ctas.browseEvents')}</Link>
          </Button>
        </TextBlock>

        <div className="mt-12">
          <h3 className="font-display text-[clamp(1.7rem,3vw,2.35rem)] font-medium leading-[0.96] tracking-[-0.03em] text-foreground">
            {t('eventPages.cardTitle')}
          </h3>

          <div className="mt-8 grid gap-8 border-t border-border/70 pt-8 md:grid-cols-3 md:gap-10 md:pt-10">
            {eventPageHighlights.map((highlight, index) => (
              <article key={highlight} className="border-t border-border/70 pt-6 md:border-t-0 md:pt-0">
                <span className="text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  0{index + 1}
                </span>
                <p className="mt-4 max-w-[28ch] text-base leading-8 text-foreground/86">{highlight}</p>
              </article>
            ))}
          </div>
        </div>
      </Section>

      <Section padding="md" size="lg">
        <TextBlock
          eyebrow={t('resultsRankings.eyebrow')}
          eyebrowVariant="green"
          title={t('resultsRankings.title')}
          description={t('resultsRankings.description')}
          size="md"
          className="max-w-[46rem]"
        />

        <div className="mt-12 border-t border-border/70">
          {supportingLinks.map((item) => {
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className="group grid gap-5 border-b border-border/70 py-7 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 md:grid-cols-[auto_minmax(0,1fr)] md:items-start md:gap-6 md:py-8"
              >
                <div className="flex items-start gap-4">
                  <div className={`inline-flex rounded-[1rem] p-3 ${item.iconBackgroundClassName}`}>
                    <Icon className={`h-5 w-5 ${item.iconClassName}`} />
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-display text-[clamp(1.55rem,2.9vw,2rem)] font-medium leading-tight tracking-[-0.03em] text-foreground">
                      {item.title}
                    </h3>
                    <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-1" />
                  </div>
                  <p className="mt-3 max-w-[42ch] text-sm leading-7 text-muted-foreground">{item.description}</p>
                  <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                    {item.cta}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </Section>

      <Section padding="sm" size="lg">
        <div className="border-t border-border/70 pt-8 md:pt-10">
          <TextBlock
            eyebrow={t('finalCta.eyebrow')}
            eyebrowVariant="blue"
            title={t('finalCta.title')}
            description={t('finalCta.description')}
            size="md"
            className="max-w-[46rem]"
          >
            <Button asChild className="w-fit">
              <Link href={publicRoutes.events}>{t('finalCta.primaryCta')}</Link>
            </Button>
          </TextBlock>
        </div>
      </Section>
    </div>
  );
}
