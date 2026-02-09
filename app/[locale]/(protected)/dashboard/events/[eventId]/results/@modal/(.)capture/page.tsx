import { ResultsRouteModal } from '@/components/results/organizer/results-route-modal';
import { configPageLocale } from '@/utils/config-page-locale';

import { getTranslations } from 'next-intl/server';

import { ResultsCaptureView } from '../../capture/_capture-view';

type ResultsCaptureModalPageProps = {
  params: Promise<{ locale: string; eventId: string }>;
};

export default async function ResultsCaptureModalPage({
  params,
}: ResultsCaptureModalPageProps) {
  const { locale, eventId } = await params;
  await configPageLocale(params, { pathname: '/dashboard/events/[eventId]/results/capture' });

  const t = await getTranslations('pages.dashboardEvents.resultsWorkspace.lanes.capture');

  return (
    <ResultsRouteModal
      title={t('title')}
      description={t('description')}
      returnHref={{
        pathname: '/dashboard/events/[eventId]/results',
        params: { eventId },
      }}
    >
      <ResultsCaptureView locale={locale} eventId={eventId} />
    </ResultsRouteModal>
  );
}
