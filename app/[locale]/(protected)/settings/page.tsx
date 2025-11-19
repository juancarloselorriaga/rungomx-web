import { getTranslations } from 'next-intl/server';

export default async function SettingsPage() {
  const t = await getTranslations('Pages.Settings');

  return (
    <div>
      <h1 className="text-3xl font-bold mb-4">{t('title')}</h1>
      <p className="text-muted-foreground">
        {t('description')}
      </p>
    </div>
  );
}
