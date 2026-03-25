import {
  BentoGrid,
  BentoGridItem,
  ContentCard,
  CtaBanner,
  FeatureCard,
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
      iconClassName: 'text-[var(--brand-green)]',
      iconBackgroundClassName: 'bg-[var(--brand-green)]/12',
    },
    {
      icon: Trophy,
      title: t('proofPaths.items.rankings.title'),
      description: t('resultsRankings.highlights.rankings'),
      cta: t('ctas.viewRankings'),
      href: publicRoutes.rankings,
      iconClassName: 'text-[var(--brand-indigo)]',
      iconBackgroundClassName: 'bg-[var(--brand-indigo)]/12',
    },
    {
      icon: Flag,
      title: t('aboutBridge.title'),
      description: t('aboutBridge.description'),
      cta: t('aboutBridge.cta'),
      href: publicRoutes.about,
      iconClassName: 'text-[var(--brand-blue)]',
      iconBackgroundClassName: 'bg-[var(--brand-blue)]/12',
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
        padding="lg"
        actions={[
          { label: t('hero.primaryCta'), href: publicRoutes.events },
          { label: t('hero.secondaryCta'), href: publicRoutes.results, variant: 'outline' },
        ]}
      />

      <Section padding="md" size="lg">
        <TextBlock
          title={t('proofPaths.title')}
          description={t('proofPaths.description')}
          size="md"
          className="mb-8"
        />

        <BentoGrid columns={3}>
          {proofPaths.map((path, index) => (
            <BentoGridItem key={path.href} span={index === 0 ? 2 : 1}>
              <FeatureCard
                icon={path.icon}
                iconVariant={path.variant}
                title={path.title}
                description={path.description}
                variant={path.variant}
                size={index === 0 ? 'lg' : 'md'}
                className="h-full"
              >
                <Button asChild variant="link" className="mt-4 h-auto px-0 text-base">
                  <Link href={path.href}>
                    {path.cta}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </FeatureCard>
            </BentoGridItem>
          ))}
        </BentoGrid>
      </Section>

      <Section variant="muted" padding="md" size="lg">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-start">
          <TextBlock
            title={t('eventPages.title')}
            description={t('eventPages.description')}
            size="md"
          >
            <Button asChild className="w-fit">
              <Link href={publicRoutes.events}>{t('ctas.browseEvents')}</Link>
            </Button>
          </TextBlock>

          <ContentCard title={t('eventPages.cardTitle')} variant="default" className="h-full">
            <div className="inline-flex rounded-xl bg-[var(--brand-blue)]/15 p-3">
              <FileText className="h-6 w-6 text-[var(--brand-blue)]" />
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
            size="md"
          />

          <div className="overflow-hidden rounded-3xl border border-border bg-card">
            {supportingLinks.map((item, index) => {
              const Icon = item.icon;

              return (
                <div
                  key={item.href}
                  className={index === 0 ? 'p-6 md:p-8' : 'border-t border-border p-6 md:p-8'}
                >
                  <div className="flex items-start gap-4">
                    <div className={`inline-flex rounded-xl p-3 ${item.iconBackgroundClassName}`}>
                      <Icon className={`h-5 w-5 ${item.iconClassName}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-lg font-semibold text-foreground">{item.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
                      <Button asChild variant="link" className="mt-3 h-auto px-0 text-sm">
                        <Link href={item.href}>
                          {item.cta}
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </Button>
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
          title={t('finalCta.title')}
          subtitle={t('finalCta.description')}
          variant="muted"
          actions={[{ label: t('finalCta.primaryCta'), href: publicRoutes.events }]}
        />
      </Section>
    </div>
  );
}
