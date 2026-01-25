import { getPathname, Link } from '@/i18n/navigation';
import { getAuthContext } from '@/lib/auth/server';
import { getEventEditionDetail } from '@/lib/events/queries';
import type { EventVisibility } from '@/lib/events/constants';
import { canUserAccessSeries } from '@/lib/organizations/permissions';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { ReactNode } from 'react';
import { SidebarLayout } from '@/components/layouts/sidebar-layout';
import { SidebarNavigation, NavigationSection } from '@/components/layouts/sidebar-navigation';
import { SidebarNavigationMobile } from '@/components/layouts/sidebar-navigation-mobile';
import { ChevronLeft } from 'lucide-react';

type EventLayoutProps = LocalePageProps & {
  params: Promise<{ locale: string; eventId: string }>;
  children: ReactNode;
};

const navigationSections: NavigationSection[] = [
  {
    titleKey: 'general',
    items: [
      { label: 'overview', href: '', icon: 'overview' },
      { label: 'editions', href: '/editions', icon: 'editions' },
      { label: 'settings', href: '/settings', icon: 'settings' },
    ],
  },
  {
    titleKey: 'content',
    items: [
      { label: 'faq', href: '/faq', icon: 'faq' },
      { label: 'waivers', href: '/waivers', icon: 'waivers' },
      { label: 'questions', href: '/questions', icon: 'clipboardList' },
      { label: 'policies', href: '/policies', icon: 'policies' },
      { label: 'website', href: '/website', icon: 'website' },
    ],
  },
  {
    titleKey: 'pricing',
    items: [
      { label: 'pricing', href: '/pricing', icon: 'pricing' },
      { label: 'addOns', href: '/add-ons', icon: 'addOns' },
      { label: 'coupons', href: '/coupons', icon: 'coupons' },
    ],
  },
  {
    titleKey: 'management',
    items: [
      { label: 'groupRegistrations', href: '/group-registrations', icon: 'groupRegistrations' },
      { label: 'registrations', href: '/registrations', icon: 'registrations' },
    ],
  },
];

export default async function EventDetailLayout({
  params,
  children,
}: EventLayoutProps) {
  const { locale, eventId } = await params;
  await configPageLocale(params, { pathname: '/dashboard/events/[eventId]' });
  const t = await getTranslations('pages.dashboardEvents.detail');
  const tNav = await getTranslations('pages.dashboardEvents.detail.nav');
  const tEvents = await getTranslations('pages.dashboardEvents');
  const authContext = await getAuthContext();

  // Access gate: organizers and internal staff only.
  const canAccessEvents =
    authContext.permissions.canViewOrganizersDashboard ||
    authContext.permissions.canManageEvents;
  if (!canAccessEvents) {
    redirect(getPathname({ href: '/dashboard', locale }));
  }

  // Get event details
  const event = await getEventEditionDetail(eventId);
  if (!event) {
    notFound();
  }

  // Check if user can access this event's series
  const canAccess = await canUserAccessSeries(authContext.user!.id, event.seriesId);
  if (!canAccess) {
    redirect(getPathname({ href: '/dashboard/events', locale }));
  }

  // Prepare translations for the navigation
  const navTranslations = {
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

  const sectionTitles = {
    general: tNav('sections.general'),
    content: tNav('sections.content'),
    pricing: tNav('sections.pricing'),
    management: tNav('sections.management'),
  };

  const visibilityStyles = {
    draft: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
    published: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    unlisted: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    archived: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  };

  // Render header
  const header = (
    <>
      {/* Breadcrumb */}
      <Link
        href="/dashboard/events"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
      >
        <ChevronLeft className="h-4 w-4" />
        {tEvents('title')}
      </Link>

      {/* Event Title */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              {event.seriesName} {event.editionLabel}
            </h1>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                visibilityStyles[event.visibility as keyof typeof visibilityStyles] ||
                visibilityStyles.draft
              }`}
            >
              {tEvents(`visibility.${event.visibility as EventVisibility}`)}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{event.organizationName}</p>
        </div>
      </div>
    </>
  );

  const footerLink =
    event.visibility === 'published'
      ? {
          label: t('viewPublicPage'),
          href: {
            pathname: '/events/[seriesSlug]/[editionSlug]',
            params: { seriesSlug: event.seriesSlug, editionSlug: event.slug },
          },
          icon: 'externalLink' as const,
          external: true,
        }
      : undefined;

  return (
    <SidebarLayout
      header={header}
      sidebar={
        <SidebarNavigation
          sections={navigationSections}
          sectionTitles={sectionTitles}
          itemLabels={navTranslations}
          basePath={`/dashboard/events/${eventId}`}
          footerLink={footerLink}
        />
      }
      maxWidth="5xl"
    >
      <SidebarNavigationMobile
        sections={navigationSections}
        sectionTitles={sectionTitles}
        itemLabels={navTranslations}
        basePath={`/dashboard/events/${eventId}`}
        footerLink={footerLink}
        menuLabel={tNav('menu')}
      />
      {children}
    </SidebarLayout>
  );
}
