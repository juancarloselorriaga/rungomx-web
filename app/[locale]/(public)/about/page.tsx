import {
  Badge,
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
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { createLocalizedPageMetadata } from '@/utils/seo';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import {
  AlertTriangle,
  Flag,
  Heart,
  Lightbulb,
  MapPin,
  Medal,
  Rocket,
  Target,
  Trophy,
  Users,
  Zap,
} from 'lucide-react';

export async function generateMetadata({ params }: LocalePageProps): Promise<Metadata> {
  const { locale } = await params;
  return createLocalizedPageMetadata(
    locale,
    '/about',
    (messages) => messages.Pages?.About?.metadata,
    { imagePath: '/og-about.jpg' },
  );
}

const AboutPage = async ({ params }: LocalePageProps) => {
  await configPageLocale(params, { pathname: '/about' });

  const t = await getTranslations('pages.about');

  return (
    <div className="w-full">
      {/* Hero Section */}
      <Hero
        badge={t('hero.badge')}
        badgeVariant="blue"
        title={t('hero.title')}
        description={t('hero.description')}
        variant="gradient-blue"
        actions={[
          { label: t('hero.primaryCta'), href: '/auth/sign-in' },
          { label: t('hero.secondaryCta'), href: '/auth/sign-up', variant: 'outline' },
        ]}
      />

      {/* Vision Section */}
      <Section padding="lg" size="md">
        <div className="grid gap-8 md:grid-cols-2 md:gap-12 items-center">
          <div className="relative hidden md:block">
            <div className="absolute -inset-4 bg-gradient-to-r from-[var(--brand-blue)]/10 to-[var(--brand-green)]/10 rounded-3xl blur-2xl" />
            <div className="relative aspect-square max-w-sm mx-auto rounded-2xl bg-gradient-to-br from-[var(--brand-blue)] to-[var(--brand-indigo)] flex items-center justify-center">
              <Rocket className="h-20 w-20 text-white/80" />
            </div>
          </div>
          <div>
            <TextBlock
              eyebrow={t('vision.eyebrow')}
              eyebrowVariant="blue"
              title={t('vision.title')}
              titleSize="md"
              align="center"
              className="md:!text-left md:!mx-0"
            >
              <div className="space-y-4 text-muted-foreground leading-relaxed">
                <p>{t('vision.paragraph1')}</p>
                <p>{t('vision.paragraph2')}</p>
              </div>
            </TextBlock>
          </div>
        </div>
      </Section>

      {/* Problem Section */}
      <Section variant="muted" padding="lg" size="lg">
        <TextBlock
          eyebrow={t('whyWeExist.eyebrow')}
          eyebrowVariant="indigo"
          title={t('whyWeExist.title')}
          description={t('whyWeExist.intro')}
          align="center"
          size="lg"
          className="mb-12"
        />

        <BentoGrid columns={2} className="mb-8 max-w-4xl mx-auto gap-2 md:gap-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <FeatureCard
              key={i}
              icon={AlertTriangle}
              iconVariant="indigo"
              title={t(`whyWeExist.problems.${i}`)}
              variant="ghost"
              size="sm"
              layout="inline"
            />
          ))}
        </BentoGrid>

        <div className="text-center">
          <Badge variant="green" size="lg" className="mb-4">
            {t('whyWeExist.butText')}
          </Badge>
          <p className="text-xl md:text-2xl font-semibold text-foreground max-w-3xl mx-auto">
            {t('whyWeExist.solution')}
          </p>
        </div>
      </Section>

      {/* What We Do - Bento Grid */}
      <Section padding="lg" size="lg">
        <TextBlock
          eyebrow={t('whatWeDo.eyebrow')}
          eyebrowVariant="green"
          title={t('whatWeDo.title')}
          subtitle={t('whatWeDo.subtitle')}
          align="center"
          size="lg"
          className="mb-12"
        />

        <BentoGrid columns={2} className="mb-8">
          {/* For Runners - Large Card */}
          <BentoGridItem className="md:row-span-2">
            <ContentCard variant="branded-green" className="h-full">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-[var(--brand-green)]/20 rounded-lg">
                  <Users className="h-6 w-6 text-[var(--brand-green)]" />
                </div>
                <h3 className="text-xl md:text-2xl font-bold text-foreground">
                  {t('whatWeDo.forRunners.title')}
                </h3>
              </div>
              <IconList
                items={[0, 1, 2, 3, 4].map((i) => t(`whatWeDo.forRunners.features.${i}`))}
                iconVariant="green"
                spacing="relaxed"
              />
            </ContentCard>
          </BentoGridItem>

          {/* For Organizers - Large Card */}
          <BentoGridItem className="md:row-span-2">
            <ContentCard variant="branded-blue" className="h-full">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-[var(--brand-blue)]/20 rounded-lg">
                  <Trophy className="h-6 w-6 text-[var(--brand-blue)]" />
                </div>
                <h3 className="text-xl md:text-2xl font-bold text-foreground">
                  {t('whatWeDo.forOrganizers.title')}
                </h3>
              </div>
              <IconList
                items={[0, 1, 2, 3, 4, 5].map((i) => t(`whatWeDo.forOrganizers.features.${i}`))}
                iconVariant="blue"
                spacing="relaxed"
              />
            </ContentCard>
          </BentoGridItem>
        </BentoGrid>

        <p className="text-center text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
          {t('whatWeDo.tagline')}
        </p>
      </Section>

      {/* Philosophy / Values Section */}
      <Section variant="dark" padding="lg" size="lg">
        <TextBlock
          eyebrow={t('philosophy.eyebrow')}
          eyebrowVariant="green"
          title={t('philosophy.title')}
          description={t('philosophy.intro')}
          align="center"
          size="lg"
          className="mb-12"
          titleAs="h2"
        />

        <p className="text-center text-lg text-muted-foreground mb-8">{t('philosophy.believeIn')}</p>

        <BentoGrid columns={3} className="gap-4 md:gap-6">
          {[
            { icon: Heart, color: 'green' as const },
            { icon: Target, color: 'blue' as const },
            { icon: Zap, color: 'indigo' as const },
            { icon: Lightbulb, color: 'green' as const },
            { icon: Medal, color: 'blue' as const },
          ].map((item, i) => (
            <FeatureCard
              key={i}
              icon={item.icon}
              iconVariant={item.color}
              title={t(`philosophy.values.${i}.title`)}
              description={t(`philosophy.values.${i}.description`)}
              variant="muted"
            />
          ))}
        </BentoGrid>
      </Section>

      {/* Mexican Technology Section */}
      <Section padding="lg" size="md">
        <div className="text-center mb-8">
          <div className="inline-flex p-2 bg-[var(--brand-green)]/10 rounded-lg mb-4">
            <Flag className="h-6 w-6 text-[var(--brand-green)]" />
          </div>
          <h2 className="text-2xl md:text-3xl font-bold text-foreground">
            {t('mexicanTechnology.title')}
          </h2>
          <p className="mt-4 text-base md:text-lg text-muted-foreground max-w-2xl mx-auto">
            {t('mexicanTechnology.subtitle')}
          </p>
        </div>

        <div className="bg-card rounded-xl p-5 md:p-8 border border-[var(--brand-green)]/20">
          <p className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <MapPin className="h-5 w-5 shrink-0 text-[var(--brand-green)]" />
            {t('mexicanTechnology.weKnow')}
          </p>

          <IconList
            items={[0, 1, 2, 3, 4].map((i) => t(`mexicanTechnology.knowledge.${i}`))}
            iconVariant="green"
            spacing="relaxed"
            className="mb-6"
          />

          <p className="text-base md:text-lg font-semibold text-foreground text-center pt-4 border-t border-border">
            {t('mexicanTechnology.tagline')}
          </p>
        </div>
      </Section>

      {/* Commitment / CTA Section */}
      <Section padding="lg" size="md">
        <TextBlock
          eyebrow={t('commitment.eyebrow')}
          eyebrowVariant="blue"
          title={t('commitment.title')}
          align="center"
          size="lg"
          className="mb-8"
        />

        <div className="space-y-4 text-lg text-muted-foreground text-center max-w-3xl mx-auto mb-12">
          <p>{t('commitment.goals.0')}</p>
          <p>{t('commitment.goals.1')}</p>
          <p>{t('commitment.goals.2')}</p>
          <p>{t('commitment.goals.3')}</p>
        </div>

        <CtaBanner
          title={t('commitment.mission')}
          subtitle={t('commitment.tagline')}
          variant="gradient"
          actions={[
            { label: t('commitment.primaryCta'), href: '/auth/sign-in' },
            { label: t('commitment.secondaryCta'), href: '/contact', variant: 'outline' },
          ]}
        />
      </Section>
    </div>
  );
};

export default AboutPage;
