import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { getTranslations } from 'next-intl/server';

export default async function EventsPage({ params }: LocalePageProps) {
  const { locale } = await configPageLocale(params);

  const t = await getTranslations({
    locale,
    namespace: 'Pages.Events'
  });

  return (
    <div>
      <h1 className="text-3xl font-bold mb-4">{t('title')}</h1>
      <p className="text-muted-foreground">
        {t('description')}
      </p>
    </div>
  );
}
