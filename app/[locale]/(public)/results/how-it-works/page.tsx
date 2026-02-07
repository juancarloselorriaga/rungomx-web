import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { createLocalizedPageMetadata } from '@/utils/seo';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({ params }: LocalePageProps): Promise<Metadata> {
  const { locale } = await params;
  return createLocalizedPageMetadata(
    locale,
    '/results/how-it-works',
    (messages) => messages.Pages?.Results?.metadata,
  );
}

export default async function ResultsHowItWorksPage({ params }: LocalePageProps) {
  await configPageLocale(params, { pathname: '/results/how-it-works' });
  const t = await getTranslations('pages.results.howItWorks.explainer');

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('eyebrow')}
        </p>
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </header>

      <section className="rounded-xl border bg-card p-4 shadow-sm">
        <h2 className="text-lg font-semibold">{t('officialMeaning.title')}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t('officialMeaning.point1')}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t('officialMeaning.point2')}</p>
      </section>

      <section className="rounded-xl border bg-card p-4 shadow-sm">
        <h2 className="text-lg font-semibold">{t('correctionProcess.title')}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t('correctionProcess.point1')}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t('correctionProcess.point2')}</p>
      </section>

      <section className="rounded-xl border bg-card p-4 shadow-sm">
        <h2 className="text-lg font-semibold">{t('rankingsRules.title')}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t('rankingsRules.point1')}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t('rankingsRules.point2')}</p>
      </section>
    </div>
  );
}
