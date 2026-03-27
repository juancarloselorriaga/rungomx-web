import {
  Hero,
  LegalDocumentSection,
  RelatedLinksStrip,
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

export async function generateMetadata({ params }: LocalePageProps): Promise<Metadata> {
  const { locale } = await params;
  return createLocalizedPageMetadata(locale, '/privacy', (messages) => messages.Pages?.Privacy?.metadata);
}

type PrivacySectionKey =
  | 'informationWeCollect'
  | 'howInformationIsUsed'
  | 'whenInformationIsShared'
  | 'eventOrganizerRelationship'
  | 'communicationsAndSupport'
  | 'dataRetentionAndAccounts'
  | 'userChoicesAndContact';

const privacySectionOrder: PrivacySectionKey[] = [
  'informationWeCollect',
  'howInformationIsUsed',
  'whenInformationIsShared',
  'eventOrganizerRelationship',
  'communicationsAndSupport',
  'dataRetentionAndAccounts',
  'userChoicesAndContact',
];

export default async function PrivacyPage({ params }: LocalePageProps) {
  const { locale } = await configPageLocale(params, { pathname: '/privacy' });
  const t = await getTranslations({ locale, namespace: 'pages.privacy' });

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
        actions={[
          { label: t('hero.primaryCta'), href: '/contact' },
          { label: t('hero.secondaryCta'), href: '/terms', variant: 'outline' },
        ]}
      />

      <Section variant="muted" padding="md" size="lg">
        <TextBlock
          eyebrow={t('summary.eyebrow')}
          eyebrowVariant="green"
          title={t('summary.title')}
          description={t('summary.description')}
          size="md"
          className="max-w-[46rem]"
        />

        <div className="mt-12 grid gap-6 border-t border-border/70 pt-8 md:grid-cols-2 md:gap-8 md:pt-10">
          {(t.raw('summary.highlights') as string[]).map((highlight, index) => (
            <article
              key={index}
              className="flex h-full flex-col border-t border-border/70 pt-6 md:border-t-0 md:pt-0"
            >
              <span aria-hidden="true" className="text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                0{index + 1}
              </span>
              <p className="mt-5 max-w-[34ch] text-sm leading-7 text-muted-foreground md:text-base">
                {highlight}
              </p>
            </article>
          ))}
        </div>
      </Section>

      <Section padding="lg" size="lg">
        <TextBlock
          eyebrow={t('sections.eyebrow')}
          eyebrowVariant="blue"
          title={t('sections.title')}
          description={t('sections.description')}
          size="md"
          className="max-w-[46rem]"
        />

        <div className="mt-12 space-y-10 md:space-y-12">
          {privacySectionOrder.map((key) => {
            const paragraphs = t.raw(`sections.items.${key}.paragraphs`) as string[];
            const bullets = t.raw(`sections.items.${key}.bullets`) as string[] | undefined;

            return (
              <LegalDocumentSection key={key} id={key} title={t(`sections.items.${key}.title`)} intro={t.has(`sections.items.${key}.intro`) ? t(`sections.items.${key}.intro`) : undefined}>
                {paragraphs.map((paragraph, i) => (
                  <p key={i}>{paragraph}</p>
                ))}
                {bullets && bullets.length > 0 ? (
                  <ul className="list-disc space-y-2 pl-5">
                    {bullets.map((bullet, i) => (
                      <li key={i}>{bullet}</li>
                    ))}
                  </ul>
                ) : null}
              </LegalDocumentSection>
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
            <Button asChild className="w-fit">
              <Link href="/contact">{t('cta.primaryActionLabel')}</Link>
            </Button>
          </TextBlock>
        </div>
      </Section>

      <Section padding="md" size="lg">
        <RelatedLinksStrip
          eyebrow={t('relatedLinks.eyebrow')}
          title={t('relatedLinks.title')}
          description={t('relatedLinks.description')}
          links={[{ href: '/terms', title: t('relatedLinks.items.terms.title'), description: t('relatedLinks.items.terms.description') }]}
        />
      </Section>
    </div>
  );
}
