import { getPathname } from '@/i18n/navigation';
import { InsetSurface, Surface } from '@/components/ui/surface';
import { getAuthContext } from '@/lib/auth/server';
import { getEventEditionDetail } from '@/lib/events/queries';
import {
  getGroupDiscountRulesForEdition,
  getGroupRegistrationBatchesForEdition,
} from '@/lib/events/group-registrations/queries';
import { listUploadLinksForEdition } from '@/lib/events/group-upload/actions';
import { canUserAccessSeries } from '@/lib/organizations/permissions';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';

import { GroupRegistrationsManager } from './group-registrations-manager';
import { GroupUploadLinksManager } from './group-upload-links-manager';

type GroupRegistrationsPageProps = LocalePageProps & {
  params: Promise<{ locale: string; eventId: string }>;
};

export async function generateMetadata({ params }: GroupRegistrationsPageProps): Promise<Metadata> {
  const { eventId } = await params;
  const event = await getEventEditionDetail(eventId);

  if (!event) {
    return {
      title: 'Group Registrations | RunGoMX',
      robots: { index: false, follow: false },
    };
  }

  return {
    title: `Group Registrations - ${event.seriesName} ${event.editionLabel} | RunGoMX`,
    robots: { index: false, follow: false },
  };
}

export default async function EventGroupRegistrationsPage({ params }: GroupRegistrationsPageProps) {
  const { locale, eventId } = await params;
  await configPageLocale(params, { pathname: '/dashboard/events/[eventId]/group-registrations' });
  const t = await getTranslations('pages.dashboardEvents.groupRegistrations');
  const authContext = await getAuthContext();

  const canAccessEvents =
    authContext.permissions.canViewOrganizersDashboard || authContext.permissions.canManageEvents;
  if (!canAccessEvents) {
    redirect(getPathname({ href: '/dashboard', locale }));
  }

  const event = await getEventEditionDetail(eventId);
  if (!event) {
    notFound();
  }

  const canAccess = await canUserAccessSeries(authContext.user!.id, event.seriesId);
  if (!canAccess) {
    redirect(getPathname({ href: '/dashboard/events', locale }));
  }

  const [batches, discountRules, uploadLinksResult] = await Promise.all([
    getGroupRegistrationBatchesForEdition(eventId),
    getGroupDiscountRulesForEdition(eventId),
    listUploadLinksForEdition({ editionId: eventId }),
  ]);

  return (
    <div className="space-y-6">
      <Surface className="overflow-hidden border-border/60 bg-[color-mix(in_oklch,var(--background)_82%,var(--background-surface)_18%)] p-6 sm:p-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
          <div className="space-y-3">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('title')}</h2>
            <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
              {t('description')}
            </p>
          </div>
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
        </div>
      </Surface>

      <GroupRegistrationsManager
        editionId={eventId}
        organizationId={event.organizationId}
        seriesSlug={event.seriesSlug}
        editionSlug={event.slug}
        batches={batches.map((b) => ({
          id: b.id,
          status: b.status,
          createdAt: b.createdAt.toISOString(),
          processedAt: b.processedAt ? b.processedAt.toISOString() : null,
          rowCount: b.rowCount,
          errorCount: b.errorCount,
          createdBy: b.createdBy,
        }))}
        discountRules={discountRules.map((r) => ({
          id: r.id,
          minParticipants: r.minParticipants,
          percentOff: r.percentOff,
          isActive: r.isActive,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        }))}
      />

      {uploadLinksResult.ok ? (
        <GroupUploadLinksManager
          editionId={eventId}
          seriesSlug={event.seriesSlug}
          editionSlug={event.slug}
          initialLinks={uploadLinksResult.data.map((link) => ({
            ...link,
            startsAt: link.startsAt ? link.startsAt.toISOString() : null,
            endsAt: link.endsAt ? link.endsAt.toISOString() : null,
            createdAt: link.createdAt.toISOString(),
            revokedAt: link.revokedAt ? link.revokedAt.toISOString() : null,
          }))}
        />
      ) : null}
    </div>
  );
}
