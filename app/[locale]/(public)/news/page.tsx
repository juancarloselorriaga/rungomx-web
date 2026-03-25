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
import { getMessages } from 'next-intl/server';
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

type UpdateLink = {
  href: LocalizedLinkHref;
  label: string;
};

type RelatedLinkContent = {
  href: LocalizedLinkHref;
  title: string;
  description: string;
};

type UpdateItem = {
  badge: string;
  title: string;
  summary: string;
  points: {
    point1: string;
    point2: string;
    point3: string;
  };
  links: {
    primary: UpdateLink;
    secondary: UpdateLink;
  };
};

type NewsPageMessages = {
  hero: {
    badge: string;
    title: string;
    description: string;
    primaryCta: string;
    secondaryCta: string;
  };
  updates: {
    eyebrow: string;
    title: string;
    description: string;
    items: {
      registrations: UpdateItem;
      help: UpdateItem;
      trust: UpdateItem;
    };
  };
  relatedLinks: {
    eyebrow: string;
    title: string;
    description: string;
    items: {
      events: RelatedLinkContent;
      results: RelatedLinkContent;
      help: RelatedLinkContent;
      contact: RelatedLinkContent;
    };
  };
};

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
  const messages = (await getMessages({ locale })) as {
    pages: { news: NewsPageMessages };
  };
  const page = messages.pages.news;

  return (
    <div className="w-full">
      <Hero
        badge={page.hero.badge}
        badgeVariant="green"
        title={page.hero.title}
        description={page.hero.description}
        variant="gradient-green"
        actions={[
          { label: page.hero.primaryCta, href: '/events' },
          { label: page.hero.secondaryCta, href: '/help', variant: 'outline' },
        ]}
      />

      <Section variant="muted" padding="md" size="lg">
        <TextBlock
          eyebrow={page.updates.eyebrow}
          eyebrowVariant="blue"
          title={page.updates.title}
          description={page.updates.description}
          size="md"
          className="max-w-[46rem]"
        />

        <div className="mt-12 grid gap-6 border-t border-border/70 pt-8 md:grid-cols-2 md:gap-8 md:pt-10 xl:grid-cols-3">
          {updateOrder.map((key, index) => {
            const item = page.updates.items[key];
            const toneClassName = updateToneClasses[key];
            const toneDotClassName = updateToneDotClasses[key];

            return (
              <article
                key={key}
                className="flex h-full min-w-0 flex-col border-t border-border/70 pt-6 md:border-t-0 md:pt-0"
              >
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    0{index + 1}
                  </span>
                  <span className={`text-[0.72rem] font-semibold uppercase tracking-[0.18em] ${toneClassName}`}>
                    {item.badge}
                  </span>
                </div>

                <h2 className="font-display mt-6 text-[clamp(1.55rem,2.8vw,2rem)] font-medium leading-[0.96] tracking-[-0.03em] text-foreground">
                  {item.title}
                </h2>
                <p className="mt-3 max-w-[28ch] text-sm leading-7 text-muted-foreground">
                  {item.summary}
                </p>

                <ul className="mt-6 space-y-3 text-sm leading-7 text-muted-foreground">
                  {[item.points.point1, item.points.point2, item.points.point3].map((point) => (
                    <li key={point} className="flex gap-3">
                      <span
                        className={`mt-[0.78rem] h-1.5 w-1.5 shrink-0 rounded-full ${toneDotClassName}`}
                        aria-hidden="true"
                      />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-auto flex flex-col gap-3 pt-6">
                  {[item.links.primary, item.links.secondary].map((link) => (
                    <Link
                      key={`${key}-${link.href.toString()}`}
                      href={link.href}
                      className="group inline-flex items-center gap-2 text-sm font-semibold text-foreground transition-colors hover:text-[var(--brand-blue)]"
                    >
                      <span>{link.label}</span>
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
          eyebrow={page.relatedLinks.eyebrow}
          title={page.relatedLinks.title}
          description={page.relatedLinks.description}
          links={[
            page.relatedLinks.items.events,
            page.relatedLinks.items.results,
            page.relatedLinks.items.help,
            page.relatedLinks.items.contact,
          ]}
        />
      </Section>
    </div>
  );
}
