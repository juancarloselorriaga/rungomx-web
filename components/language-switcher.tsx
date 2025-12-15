'use client';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePathname, useRouter } from '@/i18n/navigation';
import { type AppLocale, routing } from '@/i18n/routing';
import { Languages } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useParams, useSearchParams } from 'next/navigation';

export function LanguageSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const t = useTranslations('components.localeSwitcher');

  const handleLocaleChange = (targetLocale: AppLocale) => {
    if (targetLocale === locale) return;

    const query =
      searchParams && searchParams.size > 0
        ? Object.fromEntries(searchParams.entries())
        : undefined;

    router.replace(
      // @ts-expect-error -- Params from the active route already match the pathname; next-intl requires them when pathnames are configured.
      { pathname, params, query },
      { locale: targetLocale },
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <Languages className="h-[1.2rem] w-[1.2rem]" />
          <span className="sr-only">{t('label')}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {routing.locales.map((availableLocale) => (
          <DropdownMenuItem
            key={availableLocale}
            onClick={() => handleLocaleChange(availableLocale)}
            className={availableLocale === locale ? 'font-semibold' : ''}
          >
            {t('locale', { locale: availableLocale })}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
