'use client';

import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { useSession } from '@/lib/auth/client';
import { ExternalLink, HelpCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { useProFeatureDecision } from '@/hooks/use-pro-feature-decision';
import {
  adminUsersIconMap,
  adminUsersNavigationSections,
  eventIconMap,
  eventNavigationSections,
} from './submenu-configs';
import type { SubmenuFooterLink, SubmenuIconMap, SubmenuNavigationSection } from './submenu-types';

type SubmenuNavigationProps = {
  /** Which submenu to render */
  submenuId: string | null;
  /** Base path for resolving item hrefs */
  basePath: string;
  /** Optional footer link */
  footerLink?: SubmenuFooterLink | null;
  /** Display variant */
  variant?: 'sidebar' | 'drawer';
};

/**
 * Submenu navigation component that dispatches to the correct submenu renderer.
 * Each submenu type has its own component to load the appropriate translations.
 */
export function SubmenuNavigation({ submenuId, ...props }: SubmenuNavigationProps) {
  switch (submenuId) {
    case 'event-detail':
      return <EventSubmenuNavigation {...props} />;
    case 'org-detail':
      return <OrgSubmenuNavigation />;
    case 'admin-users':
      return <AdminUsersSubmenuNavigation {...props} />;
    default:
      return null;
  }
}

/**
 * Event detail submenu navigation.
 * Loads event-specific translations and renders the sections.
 */
function EventSubmenuNavigation({
  basePath,
  footerLink,
  variant = 'sidebar',
}: Omit<SubmenuNavigationProps, 'submenuId'>) {
  const tNav = useTranslations('pages.dashboardEvents.detail.nav');
  const pathname = usePathname();
  const couponsDecision = useProFeatureDecision('coupons');
  const hideCoupons = couponsDecision.status === 'hidden' || couponsDecision.status === 'disabled';

  // Build translations objects for the renderer
  const sectionTitles = {
    general: tNav('sections.general'),
    content: tNav('sections.content'),
    pricing: tNav('sections.pricing'),
    management: tNav('sections.management'),
  };

  const itemLabels = {
    overview: tNav('overview'),
    editions: tNav('editions'),
    settings: tNav('settings'),
    faq: tNav('faq'),
    waivers: tNav('waivers'),
    questions: tNav('questions'),
    policies: tNav('policies'),
    website: tNav('website'),
    pricing: tNav('pricing'),
    addOns: tNav('addOns'),
    coupons: tNav('coupons'),
    groupRegistrations: tNav('groupRegistrations'),
    registrations: tNav('registrations'),
  };

  const sections = useMemo(
    () =>
      eventNavigationSections
        .map((section) => ({
          ...section,
          items: section.items.filter((item) => item.label !== 'coupons' || !hideCoupons),
        }))
        .filter((section) => section.items.length > 0),
    [hideCoupons],
  );

  return (
    <SubmenuSectionRenderer
      sections={sections}
      sectionTitles={sectionTitles}
      itemLabels={itemLabels}
      iconMap={eventIconMap}
      basePath={basePath}
      footerLink={footerLink}
      variant={variant}
      pathname={pathname}
    />
  );
}

/**
 * Organization detail submenu navigation.
 * Organizations currently have no internal sections, so we render nothing.
 * The sidebar still shows the back header with organization name via context.
 */
function OrgSubmenuNavigation() {
  return null;
}

function AdminUsersSubmenuNavigation({
  basePath,
  footerLink,
  variant = 'sidebar',
}: Omit<SubmenuNavigationProps, 'submenuId'>) {
  const tNav = useTranslations('navigation');
  const pathname = usePathname();
  const { data } = useSession();
  const canManageUsers = Boolean(data?.permissions?.canManageUsers);

  const sections: SubmenuNavigationSection[] = adminUsersNavigationSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => item.label !== 'internal' || canManageUsers),
    }))
    .filter((section) => section.items.length > 0);

  const sectionTitles = {
    users: tNav('adminUsersSubmenu.sections.users'),
    proAccess: tNav('adminUsersSubmenu.sections.proAccess'),
  };

  const itemLabels = {
    selfSignup: tNav('adminUsersSubmenu.items.selfSignup'),
    internal: tNav('adminUsersSubmenu.items.internal'),
    status: tNav('adminUsersSubmenu.items.status'),
    overrides: tNav('adminUsersSubmenu.items.overrides'),
    promoCodes: tNav('adminUsersSubmenu.items.promoCodes'),
    emailGrants: tNav('adminUsersSubmenu.items.emailGrants'),
  };

  return (
    <SubmenuSectionRenderer
      sections={sections}
      sectionTitles={sectionTitles}
      itemLabels={itemLabels}
      iconMap={adminUsersIconMap}
      basePath={basePath}
      footerLink={footerLink}
      variant={variant}
      pathname={pathname}
    />
  );
}

/**
 * Generic submenu section renderer.
 * Renders navigation sections with items, icons, and active states.
 */
type SubmenuSectionRendererProps = {
  sections: SubmenuNavigationSection[];
  sectionTitles: Record<string, string>;
  itemLabels: Record<string, string>;
  iconMap: SubmenuIconMap;
  basePath: string;
  footerLink?: SubmenuFooterLink | null;
  variant: 'sidebar' | 'drawer';
  pathname: string;
};

function SubmenuSectionRenderer({
  sections,
  sectionTitles,
  itemLabels,
  iconMap,
  basePath,
  footerLink,
  variant,
  pathname,
}: SubmenuSectionRendererProps) {
  const isSheet = variant === 'drawer';
  const normalizePath = (value: string) => value.replace(/\/+$/, '') || '/';
  const normalizedPathname = normalizePath(pathname);
  const normalizedBasePath = normalizePath(basePath);

  return (
    <nav
      className={cn(
        'flex flex-col',
        isSheet ? 'gap-5 py-2' : 'gap-6 py-4',
      )}
    >
      {sections.map((section) => (
        <div key={section.titleKey}>
          <div className={cn(isSheet ? 'px-4 mb-2' : 'px-3 mb-2')}>
            <h2 className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider">
              {sectionTitles[section.titleKey]}
            </h2>
          </div>
          <div className="flex flex-col">
            {section.items.map((item) => {
              const Icon = iconMap[item.icon] ?? HelpCircle;
              const fullPath = item.pathname || `${basePath}${item.href}`;
              const normalizedFullPath = normalizePath(fullPath);

              // Check if this is the active route
              const isActive =
                item.href === ''
                  ? normalizedPathname === normalizedBasePath ||
                    normalizedPathname.endsWith(normalizedBasePath)
                  : normalizedPathname === normalizedFullPath ||
                    normalizedPathname.endsWith(normalizedFullPath);

              return (
                <Link
                  key={item.label}
                  href={fullPath as Parameters<typeof Link>[0]['href']}
                  className={cn(
                    'group relative flex items-center gap-3 text-sm transition-colors',
                    isSheet ? 'mx-1 rounded-xl px-3 py-3' : 'px-3 py-1.5',
                    isActive
                      ? isSheet
                        ? 'bg-muted text-foreground'
                        : 'font-medium text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
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
                    <div className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-primary" />
                  ) : null}
                </Link>
              );
            })}
          </div>
        </div>
      ))}

      {footerLink && (
        <>
          <div className="mx-3 h-px bg-border" />
          <div className="flex flex-col">
            {(() => {
              const FooterIcon = iconMap[footerLink.icon] ?? ExternalLink;
              return (
                <Link
                  href={footerLink.href as Parameters<typeof Link>[0]['href']}
                  className={cn(
                    'group relative flex items-center gap-3 text-sm transition-colors',
                    isSheet ? 'mx-1 rounded-xl px-3 py-3' : 'px-3 py-1.5',
                    'text-muted-foreground hover:text-foreground',
                  )}
                  target={footerLink.external ? '_blank' : undefined}
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
