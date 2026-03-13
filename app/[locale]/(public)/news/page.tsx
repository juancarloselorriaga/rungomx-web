import {
  Badge,
  ContentCard,
  Hero,
  RelatedLinksStrip,
  Section,
  TextBlock,
} from '@/components/common';
import { Link } from '@/i18n/navigation';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { createLocalizedPageMetadata } from '@/utils/seo';
import { ArrowUpRight } from 'lucide-react';
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

      <Section padding="lg" size="lg">
        <TextBlock
          eyebrow={page.updates.eyebrow}
          eyebrowVariant="blue"
          title={page.updates.title}
          description={page.updates.description}
          align="center"
          size="lg"
          className="mb-10"
        />

        <div className="grid gap-6 lg:grid-cols-3">
          {updateOrder.map((key) => {
            const item = page.updates.items[key];

            return (
              <ContentCard key={key} className="h-full">
                <div className="space-y-5">
                  <div className="space-y-3">
                    <Badge variant="green">{item.badge}</Badge>
                    <div className="space-y-2">
                      <h2 className="text-2xl font-semibold text-foreground">{item.title}</h2>
                      <p className="text-base leading-7 text-muted-foreground">{item.summary}</p>
                    </div>
                  </div>

                  <ul className="space-y-3 pl-5 text-sm leading-6 text-muted-foreground">
                    <li className="list-disc">{item.points.point1}</li>
                    <li className="list-disc">{item.points.point2}</li>
                    <li className="list-disc">{item.points.point3}</li>
                  </ul>

                  <div className="flex flex-col gap-3 pt-2">
                    {[item.links.primary, item.links.secondary].map((link) => (
                      <Link
                        key={`${key}-${link.href.toString()}`}
                        href={link.href}
                        className="inline-flex items-center gap-2 text-sm font-medium text-[var(--brand-blue)] transition-colors hover:text-[var(--brand-indigo)]"
                      >
                        <span>{link.label}</span>
                        <ArrowUpRight className="h-4 w-4" />
                      </Link>
                    ))}
                  </div>
                </div>
              </ContentCard>
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
