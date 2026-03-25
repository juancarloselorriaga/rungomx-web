import type { AppLocale } from '@/i18n/routing';

const MONEY_LOCALE_MAP: Record<AppLocale, string> = {
  es: 'es-MX',
  en: 'en-US',
};

type FormatMoneyOptions = Pick<
  Intl.NumberFormatOptions,
  | 'minimumFractionDigits'
  | 'maximumFractionDigits'
  | 'currencyDisplay'
  | 'currencySign'
  | 'notation'
  | 'signDisplay'
>;

export function resolveMoneyLocale(locale?: string | null): string {
  if (!locale) {
    return MONEY_LOCALE_MAP.es;
  }

  if (locale in MONEY_LOCALE_MAP) {
    return MONEY_LOCALE_MAP[locale as AppLocale];
  }

  return locale;
}

export function formatMoneyFromMinor(
  amountMinor: number,
  currency: string,
  locale: string | AppLocale,
  options: FormatMoneyOptions = {},
): string {
  return new Intl.NumberFormat(resolveMoneyLocale(locale), {
    style: 'currency',
    currency,
    minimumFractionDigits: options.minimumFractionDigits ?? 2,
    maximumFractionDigits: options.maximumFractionDigits ?? 2,
    currencyDisplay: options.currencyDisplay,
    currencySign: options.currencySign,
    notation: options.notation,
    signDisplay: options.signDisplay,
  }).format(amountMinor / 100);
}
