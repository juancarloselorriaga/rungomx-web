import { Hero, Section, TextBlock } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { getAuthContext } from '@/lib/auth/server';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { createLocalizedPageMetadata } from '@/utils/seo';
import { ArrowRight, CircleAlert, Handshake, LifeBuoy } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { ComponentProps } from 'react';
import { ContactForm } from './contact-form';

export async function generateMetadata({ params }: LocalePageProps): Promise<Metadata> {
  const { locale } = await params;
  return createLocalizedPageMetadata(
    locale,
    '/contact',
    (messages) => messages.Pages?.Contact?.metadata,
  );
}

type LocalizedLinkHref = ComponentProps<typeof Link>['href'];

type TriageKey = 'support' | 'partnerships' | 'accountOrEventIssue';

const triageOrder: TriageKey[] = ['support', 'partnerships', 'accountOrEventIssue'];

const triageIcons = {
  support: LifeBuoy,
  partnerships: Handshake,
  accountOrEventIssue: CircleAlert,
} satisfies Record<TriageKey, typeof LifeBuoy>;

const triageIconClasses = {
  support: 'text-[var(--brand-blue-dark)]',
  partnerships: 'text-[var(--brand-green-dark)]',
  accountOrEventIssue: 'text-[var(--brand-indigo)]',
} as const;

const triageToInquiryType: Record<TriageKey, string> = {
  support: 'support',
  partnerships: 'partnerships',
  accountOrEventIssue: 'account_or_event',
};

const validInquiryTypes = new Set(['support', 'partnerships', 'account_or_event']);

export default async function ContactPage({ params, searchParams }: LocalePageProps) {
  const [{ locale }, authContext, resolvedSearchParams] = await Promise.all([
    configPageLocale(params, { pathname: '/contact' }),
    getAuthContext(),
    searchParams ?? Promise.resolve({} as Record<string, string | string[] | undefined>),
  ]);
  const t = await getTranslations({ locale, namespace: 'pages.contact' });
  const isSignedIn = Boolean(authContext.user);

  const rawType =
    typeof resolvedSearchParams.type === 'string' ? resolvedSearchParams.type : undefined;
  const defaultInquiryType = rawType && validInquiryTypes.has(rawType) ? rawType : '';

  const directLinkKeys = ['events', 'results', 'rankings', 'help'] as const;
  const directLinks = directLinkKeys.map((key) => ({
    href: t(`directLinks.items.${key}.href`) as LocalizedLinkHref,
    title: t(`directLinks.items.${key}.title`),
    description: t(`directLinks.items.${key}.description`),
  }));

  return (
    <div className="w-full">
      <Hero
        badge={t('hero.badge')}
        badgeVariant="green"
        title={t('hero.title')}
        description={t('hero.description')}
        variant="gradient-green"
        titleSize="xl"
        align="left"
        actions={[
          { label: t('hero.primaryCta'), href: '/help' },
          { label: t('hero.secondaryCta'), href: '/results', variant: 'outline' },
        ]}
      />

      <Section variant="muted" padding="md" size="lg">
        <TextBlock
          eyebrow={t('triage.eyebrow')}
          eyebrowVariant="blue"
          title={t('triage.title')}
          description={t('triage.description')}
          size="md"
          className="max-w-[46rem]"
        />

        <div className="mt-12 grid gap-6 border-t border-border/70 pt-8 md:grid-cols-3 md:gap-8 md:pt-10">
          {triageOrder.map((key, index) => {
            const Icon = triageIcons[key];
            const iconClassName = triageIconClasses[key];
            const inquiryType = triageToInquiryType[key];

            return (
              <Link
                key={key}
                href={`/contact?type=${inquiryType}#contact-form` as LocalizedLinkHref}
                className="group flex h-full flex-col border-t border-border/70 pt-6 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 md:border-t-0 md:pt-0"
              >
                <div className="flex items-center justify-between gap-4">
                  <span
                    aria-hidden="true"
                    className="text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground"
                  >
                    0{index + 1}
                  </span>
                  <Icon className={`h-5 w-5 ${iconClassName}`} />
                </div>
                <h2 className="font-display mt-6 text-[clamp(1.55rem,2.8vw,2rem)] font-medium leading-[0.96] tracking-[-0.03em] text-foreground group-hover:text-foreground/80">
                  {t(`triage.items.${key}.title`)}
                </h2>
                <p className="mt-3 max-w-[28ch] text-sm leading-7 text-muted-foreground">
                  {t(`triage.items.${key}.description`)}
                </p>
              </Link>
            );
          })}
        </div>
      </Section>

      <Section padding="lg" size="lg">
        <TextBlock
          eyebrow={t('form.eyebrow')}
          eyebrowVariant="green"
          title={t('form.title')}
          description={t('form.description')}
          size="md"
          className="max-w-[46rem]"
        >
          <div className="space-y-4 text-base leading-7 text-muted-foreground">
            <p>{t('form.expectation')}</p>
            <p>{isSignedIn ? t('form.signedInNote') : t('form.signedOutNote')}</p>
          </div>
        </TextBlock>

        <div className="mt-12 max-w-3xl border-t border-border/70 pt-8 md:pt-10">
          <ContactForm
            defaultName={authContext.user?.name ?? ''}
            defaultEmail={authContext.user?.email ?? ''}
            defaultInquiryType={defaultInquiryType}
            isSignedIn={isSignedIn}
          />
        </div>
      </Section>

      <Section padding="md" size="lg">
        <TextBlock
          eyebrow={t('directLinks.eyebrow')}
          eyebrowVariant="blue"
          title={t('directLinks.title')}
          description={t('directLinks.description')}
          size="md"
          className="max-w-[46rem]"
        />

        <div className="mt-12 border-t border-border/70">
          {directLinks.map((link) => (
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
            title={t('trustBlock.title')}
            description={t('trustBlock.description')}
            size="md"
            className="max-w-[46rem]"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button asChild className="w-fit">
                <Link href="/privacy">{t('trustBlock.primaryActionLabel')}</Link>
              </Button>
              <Button asChild variant="outline" className="w-fit">
                <Link href="/terms">{t('trustBlock.secondaryActionLabel')}</Link>
              </Button>
            </div>
          </TextBlock>
        </div>
      </Section>
    </div>
  );
}
