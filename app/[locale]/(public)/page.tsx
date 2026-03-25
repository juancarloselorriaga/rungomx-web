import {
  ContentCard,
  CtaBanner,
  Hero,
  IconList,
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
  FileText,
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
  blue: 'border-[var(--brand-blue)]/15 bg-[var(--brand-blue)]/8 text-[var(--brand-blue-dark)]',
  green:
    'border-[var(--brand-green)]/15 bg-[var(--brand-green)]/8 text-[var(--brand-green-dark)]',
  indigo: 'border-[var(--brand-indigo)]/15 bg-[var(--brand-indigo)]/8 text-[var(--brand-indigo)]',
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
      iconBackgroundClassName: 'border-[var(--brand-green)]/15 bg-[var(--brand-green)]/8',
    },
    {
      icon: Trophy,
      title: t('proofPaths.items.rankings.title'),
      description: t('resultsRankings.highlights.rankings'),
      cta: t('ctas.viewRankings'),
      href: publicRoutes.rankings,
      iconClassName: 'text-[var(--brand-indigo)]',
      iconBackgroundClassName: 'border-[var(--brand-indigo)]/15 bg-[var(--brand-indigo)]/8',
    },
    {
      icon: Flag,
      title: t('aboutBridge.title'),
      description: t('aboutBridge.description'),
      cta: t('aboutBridge.cta'),
      href: publicRoutes.about,
      iconClassName: 'text-[var(--brand-blue-dark)]',
      iconBackgroundClassName: 'border-[var(--brand-blue)]/15 bg-[var(--brand-blue)]/8',
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
        className="border-t border-border/60"
        actions={[
          { label: t('hero.primaryCta'), href: publicRoutes.events },
          { label: t('hero.secondaryCta'), href: publicRoutes.results, variant: 'outline' },
        ]}
      />

      <Section padding="md" size="lg">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)] lg:items-start">
          <TextBlock
            title={t('proofPaths.title')}
            description={t('proofPaths.description')}
            size="sm"
            className="lg:sticky lg:top-24"
          />

          <div className="grid gap-4">
            {proofPaths.map((path, index) => {
              const Icon = path.icon;
              const iconClasses = proofPathIconClasses[path.variant];

              return (
                <Link
                  key={path.href}
                  href={path.href}
                  className="group block rounded-[1.75rem] border border-border/75 bg-[color-mix(in_oklch,var(--background)_60%,var(--background-surface)_40%)] p-6 transition-colors duration-200 hover:border-foreground/12 hover:bg-[color-mix(in_oklch,var(--background)_54%,var(--background-surface)_46%)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 md:p-7"
                >
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      0{index + 1}
                    </span>
                    <span
                      className={`inline-flex rounded-md border p-3 transition-transform duration-200 group-hover:-translate-y-0.5 ${iconClasses}`}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                  </div>
                  <h2 className="font-display mt-6 text-[clamp(1.7rem,3.3vw,2.5rem)] font-medium leading-[0.96] tracking-[-0.03em] text-foreground">
                    {path.title}
                  </h2>
                  <p className="mt-3 max-w-[44ch] text-sm leading-7 text-muted-foreground md:text-base">
                    {path.description}
                  </p>
                  <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                    {path.cta}
                    <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </Section>

      <Section variant="muted" padding="lg" size="lg">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-start">
          <TextBlock
            title={t('eventPages.title')}
            description={t('eventPages.description')}
            size="sm"
          >
            <Button asChild className="w-fit">
              <Link href={publicRoutes.events}>{t('ctas.browseEvents')}</Link>
            </Button>
          </TextBlock>

          <ContentCard title={t('eventPages.cardTitle')} variant="default" className="h-full">
            <div className="inline-flex rounded-md border border-[var(--brand-blue)]/15 bg-[var(--brand-blue)]/8 p-3">
              <FileText className="h-6 w-6 text-[var(--brand-blue-dark)]" />
            </div>
            <IconList items={eventPageHighlights} iconVariant="blue" spacing="relaxed" />
          </ContentCard>
        </div>
      </Section>

      <Section padding="md" size="lg">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
          <TextBlock
            title={t('resultsRankings.title')}
            description={t('resultsRankings.description')}
            size="sm"
          />

          <div className="overflow-hidden rounded-[1.85rem] border border-border/75 bg-[color-mix(in_oklch,var(--background)_58%,var(--background-surface)_42%)]">
            {supportingLinks.map((item, index) => {
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={index === 0 ? 'group block p-6 md:p-8' : 'group block border-t border-border p-6 md:p-8'}
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={`inline-flex rounded-md border p-3 ${item.iconBackgroundClassName}`}
                    >
                      <Icon className={`h-5 w-5 ${item.iconClassName}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-display text-[clamp(1.45rem,2.8vw,1.9rem)] font-medium leading-tight tracking-[-0.03em] text-foreground">
                          {item.title}
                        </h3>
                        <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-1" />
                      </div>
                      <p className="mt-3 text-sm leading-7 text-muted-foreground">{item.description}</p>
                      <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                        {item.cta}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </Section>

      <Section padding="sm" size="md">
        <CtaBanner
          title={t('finalCta.title')}
          subtitle={t('finalCta.description')}
          variant="muted"
          actions={[{ label: t('finalCta.primaryCta'), href: publicRoutes.events }]}
        />
      </Section>
    </div>
  );
}
