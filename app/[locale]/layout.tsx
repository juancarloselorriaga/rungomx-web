import { IntlProvider } from '@/components/providers/intl-provider';
import { AppLocale, routing } from '@/i18n/routing';
import { generateRootMetadata } from '@/utils/seo';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import React, { Suspense } from 'react';
import Loading from './loading';

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: Omit<Props, 'children'>): Promise<Metadata> {
  const { locale } = await params;
  return await generateRootMetadata(locale);
}

export default async function LocaleLayout({
  children,
  params,
}: Props) {
  const { locale } = await params;

  // Ensure that the incoming `locale` is valid
  if (!routing.locales.includes(locale as AppLocale)) {
    notFound();
  }

  // Enable static rendering
  return (
    <Suspense fallback={<Loading/>}>
      <IntlProvider locale={locale}>
        {children}
      </IntlProvider>
    </Suspense>
  );
}


