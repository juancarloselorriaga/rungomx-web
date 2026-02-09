import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import type { Metadata } from 'next';
import { ResultsCaptureView } from './_capture-view';

type ResultsCapturePageProps = LocalePageProps & {
  params: Promise<{ locale: string; eventId: string }>;
};

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Results capture | RunGoMX',
    robots: { index: false, follow: false },
  };
}

export default async function ResultsCapturePage({ params }: ResultsCapturePageProps) {
  const { locale, eventId } = await params;
  await configPageLocale(params, { pathname: '/dashboard/events/[eventId]/results/capture' });

  return <ResultsCaptureView locale={locale} eventId={eventId} />;
}
