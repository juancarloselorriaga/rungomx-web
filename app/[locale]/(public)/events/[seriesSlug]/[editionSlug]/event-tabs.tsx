'use client';

import { useTranslations } from 'next-intl';
import { Info, ListChecks, MapPin, FileText, Globe } from 'lucide-react';

import { Link } from '@/i18n/navigation';

export type TabId = 'overview' | 'distances' | 'faq' | 'policies' | 'website';

type EventTabsProps = {
  seriesSlug: string;
  editionSlug: string;
  hasWebsiteContent: boolean;
  currentTab: TabId;
};

type TabConfig = {
  id: TabId;
  icon: React.ComponentType<{ className?: string }>;
  condition?: boolean;
};

export function EventTabs({
  seriesSlug,
  editionSlug,
  hasWebsiteContent,
  currentTab,
}: EventTabsProps) {
  const t = useTranslations('pages.events.detail.tabs');

  const tabs: TabConfig[] = [
    { id: 'overview', icon: Info },
    { id: 'distances', icon: MapPin },
    { id: 'faq', icon: ListChecks },
    { id: 'policies', icon: FileText },
    { id: 'website', icon: Globe, condition: hasWebsiteContent },
  ];

  const visibleTabs = tabs.filter((tab) => tab.condition !== false);

  return (
    <div className="border-b border-border bg-card rounded-t-2xl">
      <nav className="flex gap-1 overflow-x-auto" aria-label={t('navigation')}>
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;

          return (
            <Link
              key={tab.id}
              href={{
                pathname: '/events/[seriesSlug]/[editionSlug]',
                params: { seriesSlug, editionSlug },
                query: tab.id === 'overview' ? undefined : { tab: tab.id },
              }}
              className={`
                flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap
                border-b-2 transition-colors
                ${
                  isActive
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                }
              `}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon className="h-4 w-4" />
              {t(tab.id)}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
