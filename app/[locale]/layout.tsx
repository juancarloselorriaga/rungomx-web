import Loading from '@/app/[locale]/loading';
import { IntlProvider } from '@/components/providers/intl-provider';
import { WebVitals } from '@/components/web-vitals';
import { AppLocale, routing } from '@/i18n/routing';
import {
  getRequestPathname,
  getStoredRoutePathname,
  loadMessages,
  loadRouteMessages,
} from '@/i18n/utils';
import { generateRootMetadata } from '@/utils/seo';
import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { Suspense } from 'react';

type Props = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Omit<Props, 'children'>): Promise<Metadata> {
  const { locale } = await params;
  return await generateRootMetadata(locale);
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = (await params) as { locale: AppLocale };

  // Ensure that the incoming `locale` is valid
  if (!routing.locales.includes(locale)) {
    notFound();
  }

  setRequestLocale(locale);

  const storedPathname = getStoredRoutePathname();
  const pathname = storedPathname ?? getRequestPathname();
  const messages = storedPathname
    ? await loadRouteMessages(locale, pathname)
    : await loadMessages(locale);

  // Enable static rendering
  return (
    <Suspense fallback={<Loading />}>
      <IntlProvider locale={locale} messages={messages}>
        <WebVitals />
        {children}
      </IntlProvider>
    </Suspense>
  );
}
