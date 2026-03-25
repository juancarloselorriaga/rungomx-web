import { Hero, Section, TextBlock } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { getAuthContext } from '@/lib/auth/server';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { createLocalizedPageMetadata } from '@/utils/seo';
import { ArrowRight, CircleAlert, Handshake, LifeBuoy } from 'lucide-react';
import type { Metadata } from 'next';
import { getMessages } from 'next-intl/server';
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

type TriageItem = {
  title: string;
  description: string;
};

type RelatedLinkContent = {
  href: LocalizedLinkHref;
  title: string;
  description: string;
};

type ContactPageMessages = {
  hero: {
    badge: string;
    title: string;
    description: string;
    primaryCta: string;
    secondaryCta: string;
  };
  triage: {
    eyebrow: string;
    title: string;
    description: string;
    items: Record<TriageKey, TriageItem>;
  };
  form: {
    eyebrow: string;
    title: string;
    description: string;
    expectation: string;
    signedInNote: string;
    signedOutNote: string;
  };
  directLinks: {
    eyebrow: string;
    title: string;
    description: string;
    items: {
      events: RelatedLinkContent;
      results: RelatedLinkContent;
      rankings: RelatedLinkContent;
      help: RelatedLinkContent;
    };
  };
  trustBlock: {
    title: string;
    description: string;
    primaryActionLabel: string;
    secondaryActionLabel: string;
  };
};

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

export default async function ContactPage({ params }: LocalePageProps) {
  const [{ locale }, authContext] = await Promise.all([
    configPageLocale(params, { pathname: '/contact' }),
    getAuthContext(),
  ]);
  const messages = (await getMessages({ locale })) as {
    pages: { contact: ContactPageMessages };
  };
  const page = messages.pages.contact;
  const isSignedIn = Boolean(authContext.user);
  const directLinks = [
    page.directLinks.items.events,
    page.directLinks.items.results,
    page.directLinks.items.rankings,
    page.directLinks.items.help,
  ];

  return (
    <div className="w-full">
      <Hero
        badge={page.hero.badge}
        badgeVariant="green"
        title={page.hero.title}
        description={page.hero.description}
        variant="gradient-green"
        titleSize="xl"
        align="left"
        actions={[
          { label: page.hero.primaryCta, href: '/help' },
          { label: page.hero.secondaryCta, href: '/events', variant: 'outline' },
        ]}
      />

      <Section variant="muted" padding="md" size="lg">
        <TextBlock
          eyebrow={page.triage.eyebrow}
          eyebrowVariant="blue"
          title={page.triage.title}
          description={page.triage.description}
          size="md"
          className="max-w-[46rem]"
        />

        <div className="mt-12 grid gap-6 border-t border-border/70 pt-8 md:grid-cols-3 md:gap-8 md:pt-10">
          {triageOrder.map((key, index) => {
            const item = page.triage.items[key];
            const Icon = triageIcons[key];
            const iconClassName = triageIconClasses[key];

            return (
              <article key={key} className="flex h-full flex-col border-t border-border/70 pt-6 md:border-t-0 md:pt-0">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    0{index + 1}
                  </span>
                  <Icon className={`h-5 w-5 ${iconClassName}`} />
                </div>
                <h2 className="font-display mt-6 text-[clamp(1.55rem,2.8vw,2rem)] font-medium leading-[0.96] tracking-[-0.03em] text-foreground">
                  {item.title}
                </h2>
                <p className="mt-3 max-w-[28ch] text-sm leading-7 text-muted-foreground">
                  {item.description}
                </p>
              </article>
            );
          })}
        </div>
      </Section>

      <Section padding="lg" size="lg">
        <TextBlock
          eyebrow={page.form.eyebrow}
          eyebrowVariant="green"
          title={page.form.title}
          description={page.form.description}
          size="md"
          className="max-w-[46rem]"
        >
          <div className="space-y-4 text-base leading-7 text-muted-foreground">
            <p>{page.form.expectation}</p>
            <p>{isSignedIn ? page.form.signedInNote : page.form.signedOutNote}</p>
          </div>
        </TextBlock>

        <div className="mt-12 max-w-3xl border-t border-border/70 pt-8 md:pt-10">
          <ContactForm
            defaultName={authContext.user?.name ?? ''}
            defaultEmail={authContext.user?.email ?? ''}
            isSignedIn={isSignedIn}
          />
        </div>
      </Section>

      <Section padding="md" size="lg">
        <TextBlock
          eyebrow={page.directLinks.eyebrow}
          eyebrowVariant="blue"
          title={page.directLinks.title}
          description={page.directLinks.description}
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
            title={page.trustBlock.title}
            description={page.trustBlock.description}
            size="md"
            className="max-w-[46rem]"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button asChild className="w-fit">
                <Link href="/privacy">{page.trustBlock.primaryActionLabel}</Link>
              </Button>
              <Button asChild variant="outline" className="w-fit">
                <Link href="/terms">{page.trustBlock.secondaryActionLabel}</Link>
              </Button>
            </div>
          </TextBlock>
        </div>
      </Section>
    </div>
  );
}
