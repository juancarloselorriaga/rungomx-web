import {
  BentoGrid,
  CtaBanner,
  FeatureCard,
  Hero,
  RelatedLinksStrip,
  Section,
  TextBlock,
} from '@/components/common';
import { Link } from '@/i18n/navigation';
import { getAuthContext } from '@/lib/auth/server';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { createLocalizedPageMetadata } from '@/utils/seo';
import { CircleAlert, Handshake, LifeBuoy } from 'lucide-react';
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

const triageVariants = {
  support: 'blue',
  partnerships: 'green',
  accountOrEventIssue: 'indigo',
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

  return (
    <div className="w-full">
      <Hero
        badge={page.hero.badge}
        badgeVariant="green"
        title={page.hero.title}
        description={page.hero.description}
        variant="gradient-green"
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
          align="center"
          size="lg"
          className="mb-10"
        />

        <BentoGrid columns={3}>
          {triageOrder.map((key) => {
            const item = page.triage.items[key];
            const Icon = triageIcons[key];

            return (
              <FeatureCard
                key={key}
                icon={Icon}
                variant={triageVariants[key]}
                title={item.title}
                description={item.description}
                className="h-full"
              />
            );
          })}
        </BentoGrid>
      </Section>

      <Section padding="lg" size="lg">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
          <TextBlock
            eyebrow={page.form.eyebrow}
            eyebrowVariant="green"
            title={page.form.title}
            description={page.form.description}
            size="md"
          >
            <div className="space-y-4 text-base leading-7 text-muted-foreground">
              <p>{page.form.expectation}</p>
              <p>{isSignedIn ? page.form.signedInNote : page.form.signedOutNote}</p>
            </div>
          </TextBlock>

          <ContactForm
            defaultName={authContext.user?.name ?? ''}
            defaultEmail={authContext.user?.email ?? ''}
            isSignedIn={isSignedIn}
          />
        </div>
      </Section>

      <Section padding="md" size="lg">
        <RelatedLinksStrip
          eyebrow={page.directLinks.eyebrow}
          title={page.directLinks.title}
          description={page.directLinks.description}
          links={[
            page.directLinks.items.events,
            page.directLinks.items.results,
            page.directLinks.items.rankings,
            page.directLinks.items.help,
          ]}
        />
      </Section>

      <Section padding="md" size="md">
        <CtaBanner
          title={page.trustBlock.title}
          subtitle={page.trustBlock.description}
          actions={[
            { label: page.trustBlock.primaryActionLabel, href: '/privacy' },
            { label: page.trustBlock.secondaryActionLabel, href: '/terms', variant: 'outline' },
          ]}
          variant="muted"
        />
      </Section>
    </div>
  );
}
