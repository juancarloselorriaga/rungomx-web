'use client';

import { Link } from '@/i18n/navigation';
import { useMobileNavSheet } from '@/components/ui/mobile-nav-sheet';
import { cn } from '@/lib/utils';
import {
  BarChart3,
  ClipboardList,
  DollarSign,
  ExternalLink,
  FileText,
  Gift,
  Globe,
  HelpCircle,
  Settings,
  Tag,
  Users,
} from 'lucide-react';
import { usePathname } from 'next/navigation';
import type { ComponentType } from 'react';

const iconMap = {
  addOns: Gift,
  barChart3: BarChart3,
  clipboardList: ClipboardList,
  coupons: Tag,
  dollarSign: DollarSign,
  externalLink: ExternalLink,
  faq: HelpCircle,
  fileText: FileText,
  gift: Gift,
  globe: Globe,
  helpCircle: HelpCircle,
  overview: BarChart3,
  policies: ClipboardList,
  pricing: DollarSign,
  registrations: Users,
  settings: Settings,
  tag: Tag,
  users: Users,
  waivers: FileText,
  website: Globe,
} satisfies Record<string, ComponentType<{ className?: string }>>;

export type NavigationSection = {
  titleKey: string;
  items: NavigationItem[];
};

export type NavigationItem = {
  label: string;
  href: string;
  icon: keyof typeof iconMap;
  pathname?: string; // For exact pathname matching
};

export type NavigationFooterLink = {
  label: string;
  href: string | { pathname: string; params: Record<string, string> };
  icon: keyof typeof iconMap;
  external?: boolean;
};

type SidebarNavigationProps = {
  /**
   * Array of navigation sections
   */
  sections: NavigationSection[];
  /**
   * Translations object for section titles (key is titleKey)
   */
  sectionTitles: Record<string, string>;
  /**
   * Translations object for item labels (key is item.label)
   */
  itemLabels: Record<string, string>;
  /**
   * Base path for resolving navigation items
   */
  basePath: string;
  /**
   * Optional footer link (e.g., external link)
   */
  footerLink?: NavigationFooterLink;
  /**
   * Optional className for the root nav container
   */
  className?: string;
  variant?: 'sidebar' | 'sheet';
};

/**
 * Reusable sidebar navigation component with sections
 * Follows Vercel's design pattern with section headers and active states
 */
export function SidebarNavigation({
  sections,
  sectionTitles,
  itemLabels,
  basePath,
  footerLink,
  className,
  variant = 'sidebar',
}: SidebarNavigationProps) {
  const pathname = usePathname();
  const mobileNavSheet = useMobileNavSheet();
  const isSheet = variant === 'sheet';

  return (
    <nav
      className={cn(
        'flex flex-col',
        isSheet ? 'gap-5 py-2' : 'gap-6 pt-8 pb-4',
        className,
      )}
    >
      {sections.map((section) => (
        <div key={section.titleKey}>
          <div className={cn(isSheet ? 'px-4 mb-2' : 'px-3 mb-2')}>
            <h2 className="text-xs font-semibold text-muted-foreground/60 tracking-wider">
              {sectionTitles[section.titleKey]}
            </h2>
          </div>
          <div className="flex flex-col">
            {section.items.map((item) => {
              const Icon = iconMap[item.icon] ?? HelpCircle;
              const fullPath = item.pathname || `${basePath}${item.href}`;

              // Check if this is the active route
              const isActive = item.href === ''
                ? pathname === basePath || pathname.endsWith(basePath)
                : pathname.includes(item.href);

              return (
                <Link
                  key={item.label}
                  href={fullPath as unknown as Parameters<typeof Link>[0]['href']}
                  className={cn(
                    'group relative flex items-center gap-3 text-sm transition-colors',
                    isSheet ? 'mx-1 rounded-xl px-3 py-3' : 'px-3 py-1.5',
                    isActive
                      ? isSheet
                        ? 'bg-muted text-foreground'
                        : 'font-medium text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                  onClick={() => {
                    mobileNavSheet?.close();
                  }}
                >
                  <Icon
                    className={cn(
                      'h-4 w-4 flex-shrink-0',
                      isActive
                        ? 'text-foreground'
                        : 'text-muted-foreground/60 group-hover:text-muted-foreground',
                    )}
                  />
                  <span>{itemLabels[item.label]}</span>
                  {isActive && !isSheet ? (
                    <div className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 bg-primary rounded-r-full" />
                  ) : null}
                </Link>
              );
            })}
          </div>
        </div>
      ))}

      {footerLink && (
        <>
          <div className="h-px bg-border mx-3" />
          <div className="flex flex-col">
            {(() => {
              const FooterIcon = iconMap[footerLink.icon] ?? ExternalLink;
              return (
            <Link
              href={footerLink.href as unknown as Parameters<typeof Link>[0]['href']}
              className={cn(
                'group relative flex items-center gap-3 text-sm transition-colors',
                isSheet ? 'mx-1 rounded-xl px-3 py-3' : 'px-3 py-1.5',
                'text-muted-foreground hover:text-foreground',
              )}
              target={footerLink.external ? '_blank' : undefined}
              onClick={() => {
                mobileNavSheet?.close();
              }}
            >
              <FooterIcon className="h-4 w-4 flex-shrink-0 text-muted-foreground/60 group-hover:text-muted-foreground" />
              <span>{footerLink.label}</span>
            </Link>
              );
            })()}
          </div>
        </>
      )}
    </nav>
  );
}
