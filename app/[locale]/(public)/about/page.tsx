import { siteUrl } from '@/config/url';
import { AppLocale } from '@/i18n/routing';
import { getStaticTranslation } from '@/utils/staticMessages';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

type Props = {
  params: Promise<{ locale: string }>;
};

type AboutMetadataMessages = {
  title: string;
  description: string;
  keywords: string[];
  openGraph: {
    title: string;
    description: string;
    imageAlt: string;
  };
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const localeKey = locale as AppLocale;
  const metadataMessages = getStaticTranslation<AboutMetadataMessages>(
    localeKey,
    'Pages.About.metadata'
  );

  if (!metadataMessages) {
    return {};
  }

  return {
    title: metadataMessages.title,
    description: metadataMessages.description,
    keywords: metadataMessages.keywords ?? [],
    openGraph: {
      title: metadataMessages.openGraph.title,
      description: metadataMessages.openGraph.description,
      url: `${siteUrl}/about`,
      images: [
        {
          url: `${siteUrl}/og-about.jpg`,
          width: 1200,
          height: 630,
          alt: metadataMessages.openGraph.imageAlt,
        },
      ],
    },
  };
}

const AboutPage = async ({ params }: Props) => {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('Pages.About');
  return (
    <div className=" bg-gradient-to-b from-background to-muted/30 w-full ">
      {/* Hero Section */}
      <section
        className="relative overflow-hidden bg-gradient-to-br from-[var(--brand-blue)] via-[var(--brand-blue-dark)] to-[var(--brand-indigo)] py-20 text-primary-foreground">
        <div className="container relative mx-auto max-w-4xl px-4">
          <h1 className="mb-6 text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl">
            {t('hero.title')}
          </h1>
          <p className="text-xl leading-relaxed opacity-90 md:text-2xl">
            {t('hero.description')}
          </p>
        </div>
      </section>

      {/* Vision Section */}
      <section className="py-16">
        <div className="container mx-auto max-w-4xl px-4">
          <div className="rounded-2xl bg-card p-8 shadow-lg ring-1 ring-border md:p-12">
            <h2 className="mb-6 text-3xl font-bold text-foreground">{t('vision.title')}</h2>
            <div className="space-y-4 text-lg leading-relaxed text-muted-foreground">
              <p>{t('vision.paragraph1')}</p>
              <p>{t('vision.paragraph2')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Why We Exist Section */}
      <section className="bg-muted/50 py-16">
        <div className="container mx-auto max-w-4xl px-4">
          <h2 className="mb-8 text-3xl font-bold text-foreground">{t('whyWeExist.title')}</h2>
          <div className="mb-8 text-lg leading-relaxed text-muted-foreground">
            <p className="mb-4">{t('whyWeExist.intro')}</p>
            <p className="font-medium text-foreground">{t('whyWeExist.butText')}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {[
              t('whyWeExist.problems.0'),
              t('whyWeExist.problems.1'),
              t('whyWeExist.problems.2'),
              t('whyWeExist.problems.3'),
              t('whyWeExist.problems.4'),
              t('whyWeExist.problems.5'),
            ].map((problem, index) => (
              <div
                key={index}
                className="flex items-start space-x-3 rounded-lg bg-card p-4 shadow-sm ring-1 ring-border"
              >
                <div className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-destructive"></div>
                <p className="text-muted-foreground">{problem}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 rounded-xl bg-[var(--brand-blue)] p-6 text-center">
            <p className="text-xl font-semibold text-primary-foreground">
              {t('whyWeExist.solution')}
            </p>
          </div>
        </div>
      </section>

      {/* What We Do Section */}
      <section className="py-16">
        <div className="container mx-auto max-w-6xl px-4">
          <h2 className="mb-12 text-center text-3xl font-bold text-foreground">{t('whatWeDo.title')}</h2>
          <p className="mb-12 text-center text-xl text-muted-foreground">
            {t('whatWeDo.subtitle')}
          </p>

          <div className="grid gap-8 lg:grid-cols-2">
            {/* For Runners */}
            <div
              className="rounded-2xl bg-gradient-to-br from-[var(--brand-green)]/10 to-[var(--brand-green)]/5 p-8 shadow-lg ring-1 ring-[var(--brand-green)]/20">
              <h3 className="mb-6 text-2xl font-bold text-foreground">{t('whatWeDo.forRunners.title')}</h3>
              <ul className="space-y-4">
                {[
                  t('whatWeDo.forRunners.features.0'),
                  t('whatWeDo.forRunners.features.1'),
                  t('whatWeDo.forRunners.features.2'),
                  t('whatWeDo.forRunners.features.3'),
                  t('whatWeDo.forRunners.features.4'),
                ].map((feature, index) => (
                  <li key={index} className="flex items-start space-x-3">
                    <svg
                      className="mt-1 h-5 w-5 flex-shrink-0 text-[var(--brand-green)]"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* For Organizers */}
            <div
              className="rounded-2xl bg-gradient-to-br from-[var(--brand-blue)]/10 to-[var(--brand-indigo)]/5 p-8 shadow-lg ring-1 ring-[var(--brand-blue)]/20">
              <h3 className="mb-6 text-2xl font-bold text-foreground">{t('whatWeDo.forOrganizers.title')}</h3>
              <ul className="space-y-4">
                {[
                  t('whatWeDo.forOrganizers.features.0'),
                  t('whatWeDo.forOrganizers.features.1'),
                  t('whatWeDo.forOrganizers.features.2'),
                  t('whatWeDo.forOrganizers.features.3'),
                  t('whatWeDo.forOrganizers.features.4'),
                  t('whatWeDo.forOrganizers.features.5'),
                ].map((feature, index) => (
                  <li key={index} className="flex items-start space-x-3">
                    <svg
                      className="mt-1 h-5 w-5 flex-shrink-0 text-[var(--brand-blue)]"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-8 text-center">
            <p className="text-xl font-semibold text-foreground">
              {t('whatWeDo.tagline')}
            </p>
          </div>
        </div>
      </section>

      {/* Philosophy Section */}
      <section className="bg-gradient-to-br from-foreground to-foreground/90 py-16 text-background">
        <div className="container mx-auto max-w-4xl px-4">
          <h2 className="mb-8 text-3xl font-bold">{t('philosophy.title')}</h2>
          <p className="mb-8 text-xl leading-relaxed opacity-90">
            {t('philosophy.intro')}
          </p>

          <div className="mb-4 text-lg font-semibold">{t('philosophy.believeIn')}</div>
          <div className="grid gap-6 sm:grid-cols-2">
            {[
              {
                title: t('philosophy.values.0.title'),
                description: t('philosophy.values.0.description'),
              },
              {
                title: t('philosophy.values.1.title'),
                description: t('philosophy.values.1.description'),
              },
              {
                title: t('philosophy.values.2.title'),
                description: t('philosophy.values.2.description'),
              },
              {
                title: t('philosophy.values.3.title'),
                description: t('philosophy.values.3.description'),
              },
              {
                title: t('philosophy.values.4.title'),
                description: t('philosophy.values.4.description'),
              },
            ].map((value, index) => (
              <div
                key={index}
                className="rounded-lg bg-background/10 p-6 backdrop-blur-sm ring-1 ring-background/20"
              >
                <h3 className="mb-2 text-lg font-bold text-[var(--brand-blue)]">{value.title}</h3>
                <p className="opacity-90">{value.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Mexican Technology Section */}
      <section className="py-16">
        <div className="container mx-auto max-w-4xl px-4">
          <div
            className="rounded-2xl bg-gradient-to-br from-[var(--brand-green)] to-[var(--brand-green-dark)] p-8 text-primary-foreground shadow-xl md:p-12">
            <h2 className="mb-6 text-3xl font-bold">
              {t('mexicanTechnology.title')}
            </h2>
            <p className="mb-6 text-xl leading-relaxed opacity-90">
              {t('mexicanTechnology.subtitle')}
            </p>

            <div className="mb-4 font-semibold">{t('mexicanTechnology.weKnow')}</div>
            <ul className="mb-6 space-y-2 opacity-90">
              {[
                t('mexicanTechnology.knowledge.0'),
                t('mexicanTechnology.knowledge.1'),
                t('mexicanTechnology.knowledge.2'),
                t('mexicanTechnology.knowledge.3'),
                t('mexicanTechnology.knowledge.4'),
              ].map((item, index) => (
                <li key={index} className="flex items-start space-x-2">
                  <span className="mt-1">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <p className="text-lg font-medium">
              {t('mexicanTechnology.tagline')}
            </p>
          </div>
        </div>
      </section>

      {/* Commitment Section */}
      <section className="bg-muted/50 py-16">
        <div className="container mx-auto max-w-4xl px-4">
          <h2 className="mb-8 text-3xl font-bold text-foreground">{t('commitment.title')}</h2>
          <div className="space-y-4 text-lg leading-relaxed text-muted-foreground">
            <p>{t('commitment.goals.0')}</p>
            <p>{t('commitment.goals.1')}</p>
            <p>{t('commitment.goals.2')}</p>
            <p>{t('commitment.goals.3')}</p>
          </div>

          <div
            className="mt-12 rounded-xl bg-gradient-to-r from-[var(--brand-blue)] to-[var(--brand-indigo)] p-8 text-center shadow-xl">
            <p className="mb-4 text-2xl font-bold text-primary-foreground">
              {t('commitment.mission')}
            </p>
            <p className="text-3xl font-bold opacity-90">
              {t('commitment.tagline')}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default AboutPage;
