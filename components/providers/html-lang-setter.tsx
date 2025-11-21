'use client'

import { AppLocale } from '@/i18n/routing';
import { useEffect } from 'react';

export function HtmlLangSetter({ locale }: { locale: AppLocale }) {
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return null;
}