import { Providers } from '@/components/providers/providers';
import { Toaster } from '@/components/ui/sonner';
import { routing } from '@/i18n/routing';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import React, { Suspense } from 'react';

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
    var stored = localStorage.getItem('sprintmx-theme');
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = stored || (prefersDark ? 'dark' : 'light');
    var root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.style.colorScheme = theme === 'dark' ? 'dark' : 'light';
  } catch (e) {}
 })();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html suppressHydrationWarning lang={routing.defaultLocale}>
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
        <Toaster/>
      </Suspense>
      {children}
    </Providers>
    </body>
    </html>
  );
}
