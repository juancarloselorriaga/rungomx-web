import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import React from 'react';

type IntlProviderProps = {
  locale: string;
  children: React.ReactNode;
};

export async function IntlProvider({
  locale,
  children
}: IntlProviderProps) {
  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}