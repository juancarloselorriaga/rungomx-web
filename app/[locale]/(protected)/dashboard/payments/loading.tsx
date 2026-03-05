import { getTranslations } from 'next-intl/server';

export default async function DashboardPaymentsLoading() {
  const t = await getTranslations('pages.dashboardPayments');

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold">{t('home.title')}</h1>
        <p className="text-muted-foreground">{t('home.description')}</p>
      </div>

      <div className="rounded-lg border bg-card p-6 shadow-sm" role="status" aria-live="polite">
        <h2 className="text-lg font-semibold">{t('home.shell.loadingTitle')}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t('home.shell.loadingDescription')}</p>
      </div>
    </div>
  );
}
