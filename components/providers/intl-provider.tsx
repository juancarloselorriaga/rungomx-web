'use client';

import { AppLocale, DEFAULT_TIMEZONE } from '@/i18n/routing';
import { type Messages } from '@/i18n/types';
import { NextIntlClientProvider } from 'next-intl';
import React from 'react';

type IntlProviderProps = {
  locale: AppLocale;
  messages: Messages;
  children: React.ReactNode;
};

export function IntlProvider({ locale, messages, children }: IntlProviderProps) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone={DEFAULT_TIMEZONE}>
      {children}
    </NextIntlClientProvider>
  );
}
