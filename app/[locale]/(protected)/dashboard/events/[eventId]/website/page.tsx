import { getPathname } from '@/i18n/navigation';
import { InsetSurface, Surface } from '@/components/ui/surface';
import { getAuthContext } from '@/lib/auth/server';
import { getEventEditionDetail } from '@/lib/events/queries';
import { canUserAccessSeries } from '@/lib/organizations/permissions';
import { getPublicWebsiteContent, resolveWebsiteMediaUrls } from '@/lib/events/website/queries';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';

import { WebsiteContentEditor } from './website-content-editor';
import { WebsiteContentRenderer } from '@/app/[locale]/(public)/events/[seriesSlug]/[editionSlug]/website-content-renderer';
import { WebsitePreviewSheet } from './website-preview-sheet';

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
    authContext.permissions.canViewOrganizersDashboard || authContext.permissions.canManageEvents;
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
      <Surface className="overflow-hidden border-border/60 bg-[color-mix(in_oklch,var(--background)_82%,var(--background-surface)_18%)] p-6 sm:p-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          <div className="space-y-3">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('title')}</h2>
            <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
              {t('description')}
            </p>
          </div>

          <div className="space-y-4">
            <InsetSurface className="border-border/60 bg-background/80 p-5">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {t('title')}
                </p>
                <p className="text-sm font-medium text-foreground">
                  {event.seriesName} {event.editionLabel}
                </p>
                <p className="text-sm text-muted-foreground">{event.organizationName}</p>
              </div>
            </InsetSurface>

            <WebsitePreviewSheet
              triggerLabel={t('preview.title')}
              title={t('preview.title')}
              description={t('preview.description')}
            >
              <div className="rounded-lg border bg-card p-6">
                {previewBlocks ? (
                  <WebsiteContentRenderer
                    blocks={previewBlocks}
                    mediaUrls={previewMediaUrls}
                    showSponsors={true}
                    labels={{
                      documents: tPublic('detail.website.documents'),
                      photos: tPublic('detail.website.photos'),
                      terrain: tPublic('detail.website.terrain'),
                      download: tPublic('detail.website.download'),
                      sponsors: tPublic('detail.website.sponsors'),
                    }}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">{t('preview.empty')}</p>
                )}
              </div>
            </WebsitePreviewSheet>
          </div>
        </div>
      </Surface>

      <WebsiteContentEditor
        editionId={eventId}
        locale={locale}
        organizationId={event.organizationId}
      />
    </div>
  );
}
