import { getPathname, Link } from '@/i18n/navigation';
import { getAuthContext } from '@/lib/auth/server';
import { getEventEditionDetail } from '@/lib/events/queries';
import { canUserAccessSeries } from '@/lib/organizations/permissions';
import { getPublicWebsiteContent, resolveWebsiteMediaUrls } from '@/lib/events/website/queries';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';

import { WebsiteContentEditor } from './website-content-editor';
import { WebsiteContentRenderer } from '@/app/[locale]/(public)/events/[seriesSlug]/[editionSlug]/website-content-renderer';

type WebsitePageProps = LocalePageProps & {
  params: Promise<{ locale: string; eventId: string }>;
};

export async function generateMetadata({ params }: WebsitePageProps): Promise<Metadata> {
  const { eventId } = await params;
  const event = await getEventEditionDetail(eventId);

  if (!event) {
    return {
      title: 'Website Content | RunGoMX',
      robots: { index: false, follow: false },
    };
  }

  return {
    title: `Website Content - ${event.seriesName} ${event.editionLabel} | RunGoMX`,
    robots: { index: false, follow: false },
  };
}

export default async function EventWebsitePage({ params }: WebsitePageProps) {
  const { locale, eventId } = await params;
  await configPageLocale(params, { pathname: '/dashboard/events/[eventId]/website' });
  const t = await getTranslations('pages.dashboardEventWebsite');
  const tPublic = await getTranslations({ locale, namespace: 'pages.events' });
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

  const previewBlocks = await getPublicWebsiteContent(eventId, locale);
  const previewMediaUrls = previewBlocks ? await resolveWebsiteMediaUrls(previewBlocks) : undefined;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={{ pathname: '/dashboard/events/[eventId]', params: { eventId } }}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          {event.seriesName} {event.editionLabel}
        </Link>
        <h1 className="text-3xl font-bold mb-2">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <div>
          <WebsiteContentEditor editionId={eventId} locale={locale} organizationId={event.organizationId} />
        </div>

        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold">{t('preview.title')}</h2>
            <p className="text-sm text-muted-foreground">{t('preview.description')}</p>
          </div>
          <div className="rounded-lg border bg-card p-6">
            {previewBlocks ? (
              <WebsiteContentRenderer
                blocks={previewBlocks}
                mediaUrls={previewMediaUrls}
                labels={{
                  documents: tPublic('detail.website.documents'),
                  photos: tPublic('detail.website.photos'),
                  terrain: tPublic('detail.website.terrain'),
                  download: tPublic('detail.website.download'),
                }}
              />
            ) : (
              <p className="text-sm text-muted-foreground">{t('preview.empty')}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
