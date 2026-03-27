import { Hero, IconList, Section, TextBlock } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { createLocalizedPageMetadata } from '@/utils/seo';
import { CalendarDays, CircleHelp, Medal } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({ params }: LocalePageProps): Promise<Metadata> {
  const { locale } = await params;
  return createLocalizedPageMetadata(
    locale,
    '/about',
    (messages) => messages.Pages?.About?.metadata,
    { imagePath: '/og-about.jpg' },
  );
}

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
  const t = await getTranslations({ locale, namespace: 'pages.about' });

  return (
    <div className="w-full">
      <Hero
        badge={t('hero.badge')}
        badgeVariant="blue"
        title={t('hero.title')}
        description={t('hero.description')}
        variant="gradient-blue"
        titleSize="xl"
        align="left"
        padding="lg"
        actions={[
          { label: t('hero.primaryCta'), href: '/events' },
          { label: t('hero.secondaryCta'), href: '/results', variant: 'outline' },
        ]}
      />

      <Section padding="md" size="lg">
        <TextBlock
          eyebrow={t('story.eyebrow')}
          eyebrowVariant="green"
          title={t('story.title')}
          description={t('story.description')}
          size="md"
          className="max-w-[46rem]"
        >
          <div className="space-y-4 text-base leading-7 text-muted-foreground">
            <p>{t('story.paragraph1')}</p>
            <p>{t('story.paragraph2')}</p>
          </div>
        </TextBlock>

        <div className="mt-12 border-t border-border/70 pt-8 md:pt-10">
          <h3 className="font-display text-[clamp(1.7rem,3vw,2.35rem)] font-medium leading-[0.96] tracking-[-0.03em] text-foreground">
            {t('story.cardTitle')}
          </h3>
          <IconList
            items={[
              t('story.highlights.eventDiscovery'),
              t('story.highlights.registrationContext'),
              t('story.highlights.officialResults'),
              t('story.highlights.rankings'),
              t('story.highlights.helpAndTrust'),
            ]}
            iconVariant="blue"
            spacing="relaxed"
            className="mt-6 max-w-[42rem]"
          />
        </div>
      </Section>

      <Section variant="muted" padding="lg" size="lg">
        <TextBlock
          eyebrow={t('focus.eyebrow')}
          eyebrowVariant="blue"
          title={t('focus.title')}
          description={t('focus.description')}
          size="md"
          className="max-w-[46rem]"
        />

        <div className="mt-12 grid gap-6 border-t border-border/70 pt-8 md:grid-cols-3 md:gap-8 md:pt-10">
          {focusOrder.map((key, index) => {
            const Icon = focusIcons[key];

            return (
              <article key={key} className="flex h-full flex-col border-t border-border/70 pt-6 md:border-t-0 md:pt-0">
                <div className="flex items-center justify-between gap-4">
                  <span aria-hidden="true" className="text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    0{index + 1}
                  </span>
                  <div className={`inline-flex rounded-[1rem] p-3 ${focusIconClasses[key]}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
                <div className="mt-6 min-w-0">
                  <h3 className="font-display text-[clamp(1.5rem,2.8vw,2rem)] font-medium leading-tight tracking-[-0.03em] text-foreground">
                    {t(`focus.items.${key}.title`)}
                  </h3>
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">{t(`focus.items.${key}.description`)}</p>
                </div>
              </article>
            );
          })}
        </div>
      </Section>

      <Section padding="sm" size="lg">
        <div className="border-t border-border/70 pt-8 md:pt-10">
          <TextBlock
            title={t('cta.title')}
            description={t('cta.description')}
            size="md"
            className="max-w-[46rem]"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button asChild className="w-fit">
                <Link href="/events">{t('cta.primaryActionLabel')}</Link>
              </Button>
              <Button asChild variant="outline" className="w-fit">
                <Link href="/results">{t('cta.secondaryActionLabel')}</Link>
              </Button>
            </div>
          </TextBlock>
        </div>
      </Section>
    </div>
  );
}
