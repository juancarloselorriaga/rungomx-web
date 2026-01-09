'use client';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useLocaleChange } from '@/hooks/use-locale-change';
import { routing } from '@/i18n/routing';
import { Languages } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function LanguageSwitcher() {
  const { changeLocale, currentLocale } = useLocaleChange();
  const t = useTranslations('components.localeSwitcher');

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
            onClick={() => changeLocale(availableLocale)}
            className={availableLocale === currentLocale ? 'font-semibold' : ''}
          >
            {t('locale', { locale: availableLocale })}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
