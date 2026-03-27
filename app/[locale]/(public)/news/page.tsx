import {
  Hero,
  RelatedLinksStrip,
  Section,
  TextBlock,
} from '@/components/common';
import { Link } from '@/i18n/navigation';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { createLocalizedPageMetadata } from '@/utils/seo';
import { ArrowRight } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { ComponentProps } from 'react';

export async function generateMetadata({ params }: LocalePageProps): Promise<Metadata> {
  const { locale } = await params;
  return createLocalizedPageMetadata(
    locale,
    '/news',
    (messages) => messages.Pages?.News?.metadata,
  );
}

type LocalizedLinkHref = ComponentProps<typeof Link>['href'];

const updateOrder = ['registrations', 'help', 'trust'] as const;

const updateToneClasses = {
  registrations: 'text-[var(--brand-blue-dark)]',
  help: 'text-[var(--brand-green-dark)]',
  trust: 'text-[var(--brand-indigo)]',
} as const;

const updateToneDotClasses = {
  registrations: 'bg-[var(--brand-blue-dark)]',
  help: 'bg-[var(--brand-green-dark)]',
  trust: 'bg-[var(--brand-indigo)]',
} as const;

export default async function NewsPage({ params }: LocalePageProps) {
  const { locale } = await configPageLocale(params, { pathname: '/news' });
  const t = await getTranslations({ locale, namespace: 'pages.news' });

  return (
    <div className="w-full">
      <Hero
        badge={t('hero.badge')}
        badgeVariant="green"
        title={t('hero.title')}
        description={t('hero.description')}
        variant="gradient-green"
        actions={[
          { label: t('hero.primaryCta'), href: '/events' },
          { label: t('hero.secondaryCta'), href: '/results', variant: 'outline' },
        ]}
      />

      <Section variant="muted" padding="md" size="lg">
        <TextBlock
          eyebrow={t('updates.eyebrow')}
          eyebrowVariant="blue"
          title={t('updates.title')}
          description={t('updates.description')}
          size="md"
          className="max-w-[46rem]"
        />

        <div className="mt-12 grid gap-6 border-t border-border/70 pt-8 md:grid-cols-2 md:gap-8 md:pt-10 xl:grid-cols-3">
          {updateOrder.map((key, index) => {
            const toneClassName = updateToneClasses[key];
            const toneDotClassName = updateToneDotClasses[key];

            return (
              <article
                key={key}
                className="flex h-full min-w-0 flex-col border-t border-border/70 pt-6 md:border-t-0 md:pt-0"
              >
                <div className="flex items-center justify-between gap-4">
                  <span aria-hidden="true" className="text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    0{index + 1}
                  </span>
                  <span className={`text-[0.72rem] font-semibold uppercase tracking-[0.18em] ${toneClassName}`}>
                    {t(`updates.items.${key}.badge`)}
                  </span>
                </div>
                {t.has(`updates.items.${key}.date` as never) ? (
                  <p className="mt-4 text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground/70">
                    {t(`updates.items.${key}.date` as never)}
                  </p>
                ) : null}

                <h2 className="font-display mt-6 text-[clamp(1.55rem,2.8vw,2rem)] font-medium leading-[0.96] tracking-[-0.03em] text-foreground">
                  {t(`updates.items.${key}.title`)}
                </h2>
                <p className="mt-3 max-w-[28ch] text-sm leading-7 text-muted-foreground">
                  {t(`updates.items.${key}.summary`)}
                </p>

                <ul className="mt-6 space-y-3 text-sm leading-7 text-muted-foreground">
                  {(['point1', 'point2', 'point3'] as const).map((pointKey) => (
                    <li key={pointKey} className="flex gap-3">
                      <span
                        className={`mt-[0.78rem] h-1.5 w-1.5 shrink-0 rounded-full ${toneDotClassName}`}
                        aria-hidden="true"
                      />
                      <span>{t(`updates.items.${key}.points.${pointKey}`)}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-auto flex flex-col gap-3 pt-6">
                  {(['primary', 'secondary'] as const).map((linkKey) => (
                    <Link
                      key={`${key}-${linkKey}`}
                      href={t(`updates.items.${key}.links.${linkKey}.href`) as LocalizedLinkHref}
                      className="group inline-flex items-center gap-2 text-sm font-semibold text-foreground transition-colors hover:text-[var(--brand-blue)]"
                    >
                      <span>{t(`updates.items.${key}.links.${linkKey}.label`)}</span>
                      <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                    </Link>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </Section>

      <Section padding="md" size="lg">
        <RelatedLinksStrip
          eyebrow={t('relatedLinks.eyebrow')}
          title={t('relatedLinks.title')}
          description={t('relatedLinks.description')}
          links={(['events', 'results', 'help', 'contact'] as const).map((key) => ({
            href: t(`relatedLinks.items.${key}.href`) as LocalizedLinkHref,
            title: t(`relatedLinks.items.${key}.title`),
            description: t(`relatedLinks.items.${key}.description`),
          }))}
        />
      </Section>
    </div>
  );
}
