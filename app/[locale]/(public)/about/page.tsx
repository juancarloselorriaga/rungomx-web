import {
  ContentCard,
  ContentSection,
  DescriptiveCardsGrid,
  HighlightedListSection,
  IconListGrid,
  PageHero,
} from '@/components/common';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { createLocalizedPageMetadata } from '@/utils/seo';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({
  params,
}: LocalePageProps): Promise<Metadata> {
  const { locale } = await params;
  return createLocalizedPageMetadata(
    locale,
    '/about',
    (messages) => messages.Pages?.About?.metadata,
    { imagePath: '/og-about.jpg' }
  );
}

const AboutPage = async ({ params }: LocalePageProps) => {
  await configPageLocale(params);

  const t = await getTranslations('pages.about');

  return (
    <div className="bg-gradient-to-b from-background to-muted/30 w-full">
      {/* Hero Section */}
      <PageHero
        title={t('hero.title')}
        description={t('hero.description')}
        variant="blue"
      />

      {/* Vision Section */}
      <ContentSection containerSize="md">
        <ContentCard title={t('vision.title')}>
          <p>{t('vision.paragraph1')}</p>
          <p>{t('vision.paragraph2')}</p>
        </ContentCard>
      </ContentSection>

      {/* Why We Exist Section */}
      <ContentSection variant="muted" containerSize="md">
        <HighlightedListSection
          title={t('whyWeExist.title')}
          intro={t('whyWeExist.intro')}
          calloutText={t('whyWeExist.butText')}
          items={[0, 1, 2, 3, 4, 5].map((i) =>
            t(`whyWeExist.problems.${i}`)
          )}
          highlightedText={t('whyWeExist.solution')}
        />
      </ContentSection>

      {/* What We Do Section */}
      <ContentSection containerSize="lg">
        <IconListGrid
          title={t('whatWeDo.title')}
          subtitle={t('whatWeDo.subtitle')}
          columns={[
            {
              title: t('whatWeDo.forRunners.title'),
              items: [0, 1, 2, 3, 4].map((i) =>
                t(`whatWeDo.forRunners.features.${i}`)
              ),
              variant: 'green',
            },
            {
              title: t('whatWeDo.forOrganizers.title'),
              items: [0, 1, 2, 3, 4, 5].map((i) =>
                t(`whatWeDo.forOrganizers.features.${i}`)
              ),
              variant: 'blue',
            },
          ]}
          tagline={t('whatWeDo.tagline')}
        />
      </ContentSection>

      {/* Philosophy Section */}
      <DescriptiveCardsGrid
        title={t('philosophy.title')}
        intro={t('philosophy.intro')}
        label={t('philosophy.believeIn')}
        items={[0, 1, 2, 3, 4].map((i) => ({
          title: t(`philosophy.values.${i}.title`),
          description: t(`philosophy.values.${i}.description`),
        }))}
        variant="dark"
      />

      {/* Mexican Technology Section */}
      <ContentSection containerSize="md">
        <ContentCard
          variant="branded-green"
          title={t('mexicanTechnology.title')}
        >
          <p className="mb-6">{t('mexicanTechnology.subtitle')}</p>

          <div className="mb-4 font-semibold">
            {t('mexicanTechnology.weKnow')}
          </div>
          <ul className="mb-6 space-y-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <li key={i} className="flex items-start space-x-2">
                <span className="mt-1">•</span>
                <span>{t(`mexicanTechnology.knowledge.${i}`)}</span>
              </li>
            ))}
          </ul>

          <p className="text-lg font-medium">
            {t('mexicanTechnology.tagline')}
          </p>
        </ContentCard>
      </ContentSection>

      {/* Commitment Section */}
      <ContentSection variant="muted" containerSize="md">
        <h2 className="mb-8 text-3xl font-bold text-foreground">
          {t('commitment.title')}
        </h2>
        <div className="space-y-4 text-lg leading-relaxed text-muted-foreground mb-12">
          <p>{t('commitment.goals.0')}</p>
          <p>{t('commitment.goals.1')}</p>
          <p>{t('commitment.goals.2')}</p>
          <p>{t('commitment.goals.3')}</p>
        </div>

        <div className="rounded-xl bg-gradient-to-r from-[var(--brand-blue)] to-[var(--brand-indigo)] p-8 text-center shadow-xl">
          <p className="mb-4 text-2xl font-bold text-primary-foreground">
            {t('commitment.mission')}
          </p>
          <p className="text-3xl font-bold text-primary-foreground opacity-90">
            {t('commitment.tagline')}
          </p>
        </div>
      </ContentSection>
    </div>
  );
};

export default AboutPage;
