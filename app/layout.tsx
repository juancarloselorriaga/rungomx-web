import { Providers } from '@/components/providers/providers';
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import React, { Suspense } from 'react';
import { Toaster } from 'sonner';
import { metadata as baseMetadata } from '@/utils/seo';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = baseMetadata;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
    <body
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
    >
    <Suspense fallback={null}>
      <Toaster/>
    </Suspense>
    <Providers>{children}</Providers>
    </body>
    </html>
  );
}
