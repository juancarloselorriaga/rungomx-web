'use client';

import { updateUserLocale } from '@/app/actions/locale';
import { usePathname, useRouter } from '@/i18n/navigation';
import { type AppLocale } from '@/i18n/routing';
import { useSession } from '@/lib/auth/client';
import { useLocale } from 'next-intl';
import { useParams, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

/**
 * Hook for changing locale with automatic DB persistence for authenticated users.
 * Use this hook whenever you need to change locale to ensure:
 * 1. Cookie-based locale change (browser)
 * 2. DB persistence for authenticated users
 */
export function useLocaleChange() {
  const { data: session } = useSession();
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();

  const changeLocale = useCallback(
    async (targetLocale: AppLocale) => {
      if (targetLocale === locale) return;

      // If user is authenticated, persist locale to database
      if (session?.user) {
        const result = await updateUserLocale(targetLocale);
        if (!result.ok) {
          console.error('[useLocaleChange] Failed to save locale preference:', result.error);
          // Continue with browser-only change even if DB save fails
        }
      }

      const query =
        searchParams && searchParams.size > 0
          ? Object.fromEntries(searchParams.entries())
          : undefined;

      router.replace(
        // @ts-expect-error -- Params from the active route already match the pathname; next-intl requires them when pathnames are configured.
        { pathname, params, query },
        { locale: targetLocale },
      );
    },
    [locale, session?.user, searchParams, router, pathname, params],
  );

  return { changeLocale, currentLocale: locale };
}
