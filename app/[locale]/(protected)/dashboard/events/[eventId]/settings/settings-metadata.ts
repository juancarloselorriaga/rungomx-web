import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import type { AppLocale } from '@/i18n/routing';

type EventSettingsMetadataEvent =
  | {
      seriesName: string;
      editionLabel: string;
    }
  | null;

export async function buildEventSettingsMetadata(
  locale: AppLocale,
  event: EventSettingsMetadataEvent,
): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'pages.dashboardEventSettings' });

  if (!event) {
    return {
      title: `${t('title')} | RunGoMX`,
      description: t('description'),
      robots: { index: false, follow: false },
    };
  }

  return {
    title: `${t('title')} - ${event.seriesName} ${event.editionLabel} | RunGoMX`,
    description: t('description'),
    robots: { index: false, follow: false },
  };
}
