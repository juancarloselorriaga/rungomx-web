import { getPathname } from '@/i18n/navigation';
import { getAuthContext } from '@/lib/auth/server';
import { BatchAccessError, getBatchForCoordinatorOrThrow } from '@/lib/events/group-upload/access';
import {
  getBatchDistance,
  getBatchEditionWithSeries,
  getBatchRowsWithInvites,
  getUploadLinkContext,
} from '@/lib/events/group-upload/queries';
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
      requireActiveLink: false,
    });
  } catch (error) {
    if (error instanceof BatchAccessError) {
      if (error.code === 'LINK_INVALID') {
        const t = await getTranslations({ locale, namespace: 'pages.events.groupUpload' });
        return (
          <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
            <div className="rounded-[1.9rem] border border-border/45 bg-[color-mix(in_oklch,var(--background)_79%,var(--background-surface)_21%)] px-6 py-8 text-center shadow-[0_32px_90px_-72px_rgba(15,23,42,0.78)] sm:px-8 sm:py-10">
              <h1 className="font-display text-[clamp(2rem,4.6vw,3rem)] font-medium tracking-[-0.04em] text-foreground">
                {t('errors.linkInvalidTitle')}
              </h1>
              <p className="mx-auto mt-4 max-w-[40rem] text-sm leading-7 text-muted-foreground sm:text-[0.98rem]">
                {t('errors.linkInvalid')}
              </p>
            </div>
          </div>
        );
      }
      notFound();
    }
    throw error;
  }

  const edition = await getBatchEditionWithSeries(access.batch.editionId);

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
    ? await getBatchDistance(access.batch.distanceId)
    : null;

  if (!distance) {
    notFound();
  }

  const mappedRows = await getBatchRowsWithInvites(access.batch.id);

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
