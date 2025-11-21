import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { getTranslations } from 'next-intl/server';

export default async function SignUpPage({ params }: LocalePageProps) {
  await configPageLocale(params);
  const t = await getTranslations('Pages.SignUp');

  return (
    <div className="rounded-lg border bg-card p-8 shadow-lg">
      <h1 className="text-2xl font-bold mb-4">{t('title')}</h1>
      <p className="text-muted-foreground">
        {t('description')}
      </p>
    </div>
  );
}
