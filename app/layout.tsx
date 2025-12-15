import { Providers } from '@/components/providers/providers';
import { Toaster } from '@/components/ui/sonner';
import { AppLocale, routing } from '@/i18n/routing';
import type { Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import type { ReactNode } from 'react';
import { Suspense } from 'react';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const PREFLIGHT_SCRIPT = `
 (function() {
  try {
    var stored = localStorage.getItem('rungomx-theme');
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = stored || (prefersDark ? 'dark' : 'light');
    var root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.style.colorScheme = theme === 'dark' ? 'dark' : 'light';
  } catch (e) {}
 })();`;

type RootLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale?: string }> | { locale?: string };
};

async function resolveLocale(params: RootLayoutProps['params']): Promise<AppLocale> {
  const resolved = await params;
  const locale = resolved?.locale;
  return routing.locales.includes(locale as AppLocale)
    ? (locale as AppLocale)
    : routing.defaultLocale;
}

export default async function RootLayout({ children, params }: RootLayoutProps) {
  const locale = await resolveLocale(params);

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: PREFLIGHT_SCRIPT,
          }}
        />
      </head>
      <body className={` ${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Providers>
          <Suspense fallback={null}>
            <Toaster />
          </Suspense>
          {children}
        </Providers>
      </body>
    </html>
  );
}
