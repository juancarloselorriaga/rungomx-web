import {
  FaqAccordion,
  type FaqAccordionGroup,
  Hero,
  Section,
  TextBlock,
} from '@/components/common';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { createLocalizedPageMetadata } from '@/utils/seo';
import {
  ArrowRight,
  CalendarDays,
  CreditCard,
  Medal,
  Ticket,
  Trophy,
  User,
} from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { ComponentProps } from 'react';

export async function generateMetadata({ params }: LocalePageProps): Promise<Metadata> {
  const { locale } = await params;
  return createLocalizedPageMetadata(locale, '/help', (messages) => messages.Pages?.Help?.metadata);
}

type HelpCategoryKey =
  | 'registrations'
  | 'eventInformation'
  | 'results'
  | 'rankings'
  | 'payments'
  | 'accountBasics';

type LocalizedLinkHref = ComponentProps<typeof Link>['href'];

type HelpFaqItemContent = {
  question: string;
  answerTitle?: string;
  paragraphs?: string[];
  bullets?: string[];
  links?: Array<{
    href: LocalizedLinkHref;
    label: string;
  }>;
};

const categoryOrder: HelpCategoryKey[] = [
  'registrations',
  'eventInformation',
  'results',
  'rankings',
  'payments',
  'accountBasics',
];

const categoryIcons = {
  registrations: Ticket,
  eventInformation: CalendarDays,
  results: Medal,
  rankings: Trophy,
  payments: CreditCard,
  accountBasics: User,
} satisfies Record<HelpCategoryKey, typeof Ticket>;

const categoryIconClasses = {
  registrations: 'text-[var(--brand-blue-dark)]',
  eventInformation: 'text-[var(--brand-green-dark)]',
  results: 'text-[var(--brand-indigo)]',
  rankings: 'text-[var(--brand-blue-dark)]',
  payments: 'text-[var(--brand-green-dark)]',
  accountBasics: 'text-muted-foreground',
} as const;

export default async function HelpPage({ params }: LocalePageProps) {
  const { locale } = await configPageLocale(params, { pathname: '/help' });
  const t = await getTranslations({ locale, namespace: 'pages.help' });

  const faqGroups: FaqAccordionGroup[] = categoryOrder.map((key) => {
    const items = t.raw(`faqGroups.groups.${key}.items` as never) as Record<string, HelpFaqItemContent>;

    return {
      id: key,
      title: t(`faqGroups.groups.${key}.title`),
      description: t(`faqGroups.groups.${key}.description`),
      items: Object.entries(items).map(([itemKey, item]) => ({
        id: `${key}-${itemKey}`,
        question: item.question,
        answerTitle: item.answerTitle,
        paragraphs: item.paragraphs,
        bullets: item.bullets,
        links: item.links,
      })),
    };
  });

  const relatedLinks = (['events', 'results', 'rankings', 'home'] as const).map((key) => ({
    href: t(`relatedLinks.items.${key}.href`) as LocalizedLinkHref,
    title: t(`relatedLinks.items.${key}.title`),
    description: t(`relatedLinks.items.${key}.description`),
  }));

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
          { label: t('hero.secondaryCta'), href: '/events', variant: 'outline' },
        ]}
      />

      <Section variant="muted" padding="md" size="lg">
        <TextBlock
          eyebrow={t('categories.eyebrow')}
          eyebrowVariant="green"
          title={t('categories.title')}
          description={t('categories.description')}
          size="md"
          className="max-w-[46rem]"
        />

        <div className="mt-12 grid gap-6 border-t border-border/70 pt-8 md:grid-cols-2 md:gap-8 md:pt-10 xl:grid-cols-3">
          {categoryOrder.map((key, index) => {
            const Icon = categoryIcons[key];
            const iconClassName = categoryIconClasses[key];

            return (
              <a
                key={key}
                href={`#${key}`}
                className="group flex h-full flex-col border-t border-border/70 pt-6 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 md:border-t-0 md:pt-0"
              >
                <div className="flex items-center justify-between gap-4">
                  <span aria-hidden="true" className="text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    0{index + 1}
                  </span>
                  <Icon className={`h-5 w-5 ${iconClassName}`} />
                </div>
                <h2 className="font-display mt-6 text-[clamp(1.55rem,2.8vw,2rem)] font-medium leading-[0.96] tracking-[-0.03em] text-foreground">
                  {t(`categories.items.${key}.title`)}
                </h2>
                <p className="mt-3 max-w-[28ch] text-sm leading-7 text-muted-foreground">
                  {t(`categories.items.${key}.description`)}
                </p>
                <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                  {t(`categories.items.${key}.linkLabel`)}
                  <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                </span>
              </a>
            );
          })}
        </div>
      </Section>

      <Section padding="lg" size="lg">
        <TextBlock
          eyebrow={t('faqGroups.eyebrow')}
          eyebrowVariant="blue"
          title={t('faqGroups.title')}
          description={t('faqGroups.description')}
          size="md"
          className="max-w-[46rem]"
        />

        <FaqAccordion groups={faqGroups} className="mt-12" />
      </Section>

      <Section padding="md" size="lg">
        <TextBlock
          eyebrow={t('relatedLinks.eyebrow')}
          eyebrowVariant="green"
          title={t('relatedLinks.title')}
          description={t('relatedLinks.description')}
          size="md"
          className="max-w-[46rem]"
        />

        <div className="mt-12 border-t border-border/70">
          {relatedLinks.map((link) => (
            <Link
              key={link.href.toString()}
              href={link.href}
              className="group grid gap-5 border-b border-border/70 py-7 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 md:grid-cols-[minmax(0,1fr)_auto] md:items-start md:gap-6 md:py-8"
            >
              <div className="min-w-0">
                <h3 className="font-display text-[clamp(1.55rem,2.9vw,2rem)] font-medium leading-tight tracking-[-0.03em] text-foreground">
                  {link.title}
                </h3>
                <p className="mt-3 max-w-[44ch] text-sm leading-7 text-muted-foreground">
                  {link.description}
                </p>
              </div>
              <span className="inline-flex items-center gap-2 self-start text-sm font-semibold text-foreground md:mt-2">
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
              </span>
            </Link>
          ))}
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
    </div>
  );
}
