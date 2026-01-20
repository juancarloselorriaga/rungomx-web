'use client';

import { MobileNavSheet } from '@/components/ui/mobile-nav-sheet';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import type { NavigationFooterLink, NavigationItem, NavigationSection } from './sidebar-navigation';
import { SidebarNavigation } from './sidebar-navigation';

type SidebarNavigationMobileProps = {
  sections: NavigationSection[];
  sectionTitles: Record<string, string>;
  itemLabels: Record<string, string>;
  basePath: string;
  footerLink?: NavigationFooterLink;
  menuLabel: string;
  className?: string;
};

function isItemActive(item: NavigationItem, pathname: string, basePath: string) {
  if (item.href === '') {
    return pathname === basePath || pathname.endsWith(basePath);
  }

  return pathname.includes(item.href);
}

export function SidebarNavigationMobile({
  sections,
  sectionTitles,
  itemLabels,
  basePath,
  footerLink,
  menuLabel,
  className,
}: SidebarNavigationMobileProps) {
  const tCommon = useTranslations('common');
  const pathname = usePathname();

  const activeItemLabel = useMemo(() => {
    for (const section of sections) {
      for (const item of section.items) {
        if (isItemActive(item, pathname, basePath)) {
          return itemLabels[item.label] ?? item.label;
        }
      }
    }

    const firstItem = sections[0]?.items[0];
    return firstItem ? (itemLabels[firstItem.label] ?? firstItem.label) : menuLabel;
  }, [basePath, itemLabels, menuLabel, pathname, sections]);

  return (
    <div
      className={cn(
        '-mt-6 mb-6',
        'lg:hidden sticky top-16 z-20 border-b bg-background/80 backdrop-blur',
        '-mx-4 md:-mx-6 px-4 md:px-6 py-3',
        className,
      )}
    >
      <MobileNavSheet
        label={menuLabel}
        value={activeItemLabel}
        title={menuLabel}
        closeLabel={tCommon('close')}
      >
        <SidebarNavigation
          sections={sections}
          sectionTitles={sectionTitles}
          itemLabels={itemLabels}
          basePath={basePath}
          footerLink={footerLink}
          variant="sheet"
        />
      </MobileNavSheet>
    </div>
  );
}
