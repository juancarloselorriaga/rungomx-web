import { Hero, Section, TextBlock } from '@/components/common';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { createLocalizedPageMetadata } from '@/utils/seo';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({ params }: LocalePageProps): Promise<Metadata> {
  const { locale } = await params;
  return createLocalizedPageMetadata(
    locale,
    '/results/how-it-works',
    (messages) => messages.Pages?.Results?.metadata,
  );
}

export default async function ResultsHowItWorksPage({ params }: LocalePageProps) {
  await configPageLocale(params, { pathname: '/results/how-it-works' });
  const t = await getTranslations('pages.results.howItWorks.explainer');

  const sections = [
    {
      title: t('officialMeaning.title'),
      points: [t('officialMeaning.point1'), t('officialMeaning.point2')],
    },
    {
      title: t('correctionProcess.title'),
      points: [t('correctionProcess.point1'), t('correctionProcess.point2')],
    },
    {
      title: t('rankingsRules.title'),
      points: [t('rankingsRules.point1'), t('rankingsRules.point2')],
    },
  ];

  return (
    <div className="w-full">
      <Hero
        badge={t('eyebrow')}
        badgeVariant="blue"
        title={t('title')}
        description={t('description')}
        variant="gradient-blue"
        titleSize="xl"
        align="left"
      />

      <Section padding="lg" size="lg">
        <div className="space-y-10 border-t border-border/70 pt-8 md:space-y-12 md:pt-10">
          {sections.map((section) => (
            <article key={section.title} className="border-t border-border/70 pt-8 md:pt-10 first:border-t-0 first:pt-0">
              <TextBlock title={section.title} size="sm" className="max-w-[42rem]" />
              <div className="mt-5 max-w-[42rem] space-y-4 text-sm leading-7 text-muted-foreground md:text-base">
                {section.points.map((point) => (
                  <p key={point}>{point}</p>
                ))}
              </div>
            </article>
          ))}
        </div>
      </Section>
    </div>
  );
}
