import { Providers } from '@/components/providers/providers';
import { AppLocale, routing } from '@/i18n/routing';
import { generateRootMetadata } from '@/utils/seo';
import { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { Geist, Geist_Mono } from 'next/font/google';
import { notFound } from 'next/navigation';
import React, { Suspense } from 'react';
import { Toaster } from 'sonner';
import Loading from './loading';
import '../globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

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
    <html lang={locale} suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>
          <Suspense fallback={<Loading />}>
            <IntlProvider locale={locale}>
              {children}
            </IntlProvider>
          </Suspense>
        </Providers>
      </body>
    </html>
  );
}

type IntlProviderProps = {
  locale: string;
  children: React.ReactNode;
};

async function IntlProvider({ locale, children }: IntlProviderProps) {
  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <Toaster />
      {children}
    </NextIntlClientProvider>
  );
}
