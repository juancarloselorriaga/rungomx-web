import { and, asc, eq, isNull } from 'drizzle-orm';

import { db } from '@/db';
import {
  eventDistances,
  eventEditions,
  groupRegistrationBatchRows,
  registrationInvites,
} from '@/db/schema';
import { getPathname } from '@/i18n/navigation';
import { getAuthContext } from '@/lib/auth/server';
import { BatchAccessError, getBatchForCoordinatorOrThrow } from '@/lib/events/group-upload/access';
import { getUploadLinkContext } from '@/lib/events/group-upload/queries';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';

import { GroupUploadLoginRequired } from '../../login-required';
import { GroupUploadBatchManager } from './batch-manager';

type GroupUploadBatchPageProps = LocalePageProps & {
  params: Promise<{
    locale: string;
    seriesSlug: string;
    editionSlug: string;
    uploadToken: string;
    batchId: string;
  }>;
};

export async function generateMetadata({ params }: GroupUploadBatchPageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pages.events.groupUpload' });

  return {
    title: t('batch.title'),
    robots: { index: false, follow: false },
  } as const;
}

export default async function GroupUploadBatchPage({ params }: GroupUploadBatchPageProps) {
  const { locale, seriesSlug, editionSlug, uploadToken, batchId } = await params;
  await configPageLocale(params, {
    pathname: '/events/[seriesSlug]/[editionSlug]/group-upload/[uploadToken]/batches/[batchId]',
  });

  const [authContext, linkContext] = await Promise.all([
    getAuthContext(),
    getUploadLinkContext({ token: uploadToken }),
  ]);

  if (!linkContext.link || !linkContext.event) {
    notFound();
  }

  const eventName = `${linkContext.event.seriesName} ${linkContext.event.editionLabel}`.trim();

  if (!authContext.user) {
    return (
      <GroupUploadLoginRequired
        locale={locale}
        seriesSlug={seriesSlug}
        editionSlug={editionSlug}
        uploadToken={uploadToken}
        eventName={eventName}
      />
    );
  }

  let access;
  try {
    access = await getBatchForCoordinatorOrThrow({
      batchId,
      uploadToken,
      authContext,
    });
  } catch (error) {
    if (error instanceof BatchAccessError) {
      if (error.code === 'LINK_INVALID') {
        const t = await getTranslations({ locale, namespace: 'pages.events.groupUpload' });
        return (
          <div className="container mx-auto px-4 py-16 max-w-lg text-center">
            <h1 className="text-2xl font-bold mb-2">{t('errors.linkInvalidTitle')}</h1>
            <p className="text-muted-foreground">{t('errors.linkInvalid')}</p>
          </div>
        );
      }
      notFound();
    }
    throw error;
  }

  const edition = await db.query.eventEditions.findFirst({
    where: and(eq(eventEditions.id, access.batch.editionId), isNull(eventEditions.deletedAt)),
    with: { series: true },
  });

  if (!edition?.series) {
    notFound();
  }

  if (edition.series.slug !== seriesSlug || edition.slug !== editionSlug) {
    const redirectPath = getPathname({
      href: {
        pathname: '/events/[seriesSlug]/[editionSlug]/group-upload/[uploadToken]/batches/[batchId]',
        params: {
          seriesSlug: edition.series.slug,
          editionSlug: edition.slug,
          uploadToken,
          batchId,
        },
      },
      locale,
    });
    redirect(redirectPath);
  }

  const distance = access.batch.distanceId
    ? await db.query.eventDistances.findFirst({
        where: and(eq(eventDistances.id, access.batch.distanceId), isNull(eventDistances.deletedAt)),
      })
    : null;

  if (!distance) {
    notFound();
  }

  const rows = await db
    .select({
      rowId: groupRegistrationBatchRows.id,
      rowIndex: groupRegistrationBatchRows.rowIndex,
      rawJson: groupRegistrationBatchRows.rawJson,
      validationErrors: groupRegistrationBatchRows.validationErrorsJson,
      createdRegistrationId: groupRegistrationBatchRows.createdRegistrationId,
      inviteId: registrationInvites.id,
      inviteStatus: registrationInvites.status,
      inviteEmail: registrationInvites.email,
      inviteSendCount: registrationInvites.sendCount,
      inviteLastSentAt: registrationInvites.lastSentAt,
      inviteExpiresAt: registrationInvites.expiresAt,
    })
    .from(groupRegistrationBatchRows)
    .leftJoin(
      registrationInvites,
      and(
        eq(registrationInvites.batchRowId, groupRegistrationBatchRows.id),
        eq(registrationInvites.isCurrent, true),
      ),
    )
    .where(eq(groupRegistrationBatchRows.batchId, access.batch.id))
    .orderBy(asc(groupRegistrationBatchRows.rowIndex));

  const mappedRows = rows.map((row) => {
    const raw = (row.rawJson ?? {}) as Record<string, unknown>;

    return {
      id: row.rowId,
      rowIndex: row.rowIndex,
      firstName: typeof raw.firstName === 'string' ? raw.firstName : '',
      lastName: typeof raw.lastName === 'string' ? raw.lastName : '',
      email: typeof raw.email === 'string' ? raw.email : '',
      dateOfBirth: typeof raw.dateOfBirth === 'string' ? raw.dateOfBirth : null,
      validationErrors: row.validationErrors ?? [],
      createdRegistrationId: row.createdRegistrationId ?? null,
      invite: row.inviteId
        ? {
            id: row.inviteId,
            status: row.inviteStatus ?? 'draft',
            sendCount: row.inviteSendCount ?? 0,
            lastSentAt: row.inviteLastSentAt ? row.inviteLastSentAt.toISOString() : null,
            expiresAt: row.inviteExpiresAt ? row.inviteExpiresAt.toISOString() : null,
            email: row.inviteEmail ?? '',
          }
        : null,
    };
  });

  return (
    <GroupUploadBatchManager
      uploadToken={uploadToken}
      event={{
        seriesSlug: edition.series.slug,
        editionSlug: edition.slug,
        seriesName: edition.series.name,
        editionLabel: edition.editionLabel,
      }}
      batch={{
        id: access.batch.id,
        status: access.batch.status,
        createdAt: access.batch.createdAt.toISOString(),
        processedAt: access.batch.processedAt ? access.batch.processedAt.toISOString() : null,
        distanceLabel: distance.label,
        paymentResponsibility: access.batch.paymentResponsibility,
      }}
      rows={mappedRows}
    />
  );
}
