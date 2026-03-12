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
  ShieldCheck,
  Trophy,
  Users,
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

  const participationHighlights = [
    { icon: CalendarDays, title: t('participation.highlights.discover'), variant: 'blue' as const },
    { icon: Users, title: t('participation.highlights.decide'), variant: 'green' as const },
    { icon: ShieldCheck, title: t('participation.highlights.commit'), variant: 'indigo' as const },
  ];

  const resultsRankingsHighlights = [
    { icon: Medal, title: t('resultsRankings.highlights.results'), variant: 'blue' as const },
    { icon: Trophy, title: t('resultsRankings.highlights.rankings'), variant: 'green' as const },
    {
      icon: ShieldCheck,
      title: t('resultsRankings.highlights.retention'),
      variant: 'indigo' as const,
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
        padding="xl"
        actions={[
          { label: t('hero.primaryCta'), href: publicRoutes.events },
          { label: t('hero.secondaryCta'), href: publicRoutes.results, variant: 'outline' },
        ]}
      />

      <Section padding="lg" size="lg">
        <TextBlock
          eyebrow={t('proofPaths.eyebrow')}
          eyebrowVariant="green"
          title={t('proofPaths.title')}
          description={t('proofPaths.description')}
          align="center"
          size="lg"
          className="mb-12"
        />

        <BentoGrid columns={3}>
          {proofPaths.map((path) => (
            <BentoGridItem key={path.href}>
              <FeatureCard
                icon={path.icon}
                iconVariant={path.variant}
                title={path.title}
                description={path.description}
                variant={path.variant}
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

      <Section variant="muted" padding="lg" size="lg">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-center">
          <TextBlock
            eyebrow={t('eventPages.eyebrow')}
            eyebrowVariant="blue"
            title={t('eventPages.title')}
            description={t('eventPages.description')}
            size="md"
          />

          <ContentCard variant="branded-blue" className="h-full">
            <div className="inline-flex rounded-xl bg-[var(--brand-blue)]/15 p-3">
              <FileText className="h-6 w-6 text-[var(--brand-blue)]" />
            </div>
            <IconList items={eventPageHighlights} iconVariant="blue" spacing="relaxed" />
            <Button asChild className="mt-2 w-fit">
              <Link href={publicRoutes.events}>{t('ctas.browseEvents')}</Link>
            </Button>
          </ContentCard>
        </div>
      </Section>

      <Section padding="lg" size="lg">
        <TextBlock
          eyebrow={t('participation.eyebrow')}
          eyebrowVariant="green"
          title={t('participation.title')}
          description={t('participation.description')}
          align="center"
          size="lg"
          className="mb-12"
        />

        <BentoGrid columns={3}>
          {participationHighlights.map((item) => (
            <BentoGridItem key={item.title}>
              <FeatureCard
                icon={item.icon}
                iconVariant={item.variant}
                title={item.title}
                variant={item.variant}
                className="h-full"
              />
            </BentoGridItem>
          ))}
        </BentoGrid>
      </Section>

      <Section variant="dark" padding="lg" size="lg">
        <TextBlock
          eyebrow={t('resultsRankings.eyebrow')}
          eyebrowVariant="indigo"
          title={t('resultsRankings.title')}
          description={t('resultsRankings.description')}
          align="center"
          size="lg"
          className="mb-12"
        />

        <BentoGrid columns={3} className="mb-10">
          {resultsRankingsHighlights.map((item) => (
            <BentoGridItem key={item.title}>
              <FeatureCard
                icon={item.icon}
                iconVariant={item.variant}
                title={item.title}
                variant="muted"
                className="h-full"
              />
            </BentoGridItem>
          ))}
        </BentoGrid>

        <div className="flex flex-wrap justify-center gap-4">
          <Button asChild size="lg">
            <Link href={publicRoutes.results}>{t('ctas.viewResults')}</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href={publicRoutes.rankings}>{t('ctas.viewRankings')}</Link>
          </Button>
        </div>
      </Section>

      <Section padding="lg" size="md">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-center">
          <TextBlock
            eyebrow={t('aboutBridge.eyebrow')}
            eyebrowVariant="green"
            title={t('aboutBridge.title')}
            description={t('aboutBridge.description')}
            size="md"
          />

          <ContentCard variant="branded-green" className="h-full">
            <div className="inline-flex rounded-xl bg-[var(--brand-green)]/15 p-3">
              <Flag className="h-6 w-6 text-[var(--brand-green)]" />
            </div>
            <p>{t('aboutBridge.description')}</p>
            <Button asChild className="mt-2 w-fit">
              <Link href={publicRoutes.about}>{t('aboutBridge.cta')}</Link>
            </Button>
          </ContentCard>
        </div>
      </Section>

      <Section padding="lg" size="md">
        <CtaBanner
          title={t('finalCta.title')}
          subtitle={t('finalCta.description')}
          variant="gradient-green"
          actions={[{ label: t('ctas.browseEvents'), href: publicRoutes.events }]}
        />
      </Section>
    </div>
  );
}
