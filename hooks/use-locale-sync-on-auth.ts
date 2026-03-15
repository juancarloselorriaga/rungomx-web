'use client';

import { usePathname, useRouter } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { useSession } from '@/lib/auth/client';
import { useLocale } from 'next-intl';
import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef } from 'react';

function isAppLocale(value: string | null | undefined): value is AppLocale {
  return value === 'es' || value === 'en';
}

export type LocaleSyncOnAuthState = {
  preferredLocale: AppLocale | null;
  isLocaleRedirectPending: boolean;
};

/**
 * Syncs the user's DB locale preference with the browser when authenticated.
 * On session restore/login, if the user has a DB locale that differs from the
 * current browser locale, this hook redirects to their preferred locale.
 *
 * This hook should be used in a layout or provider that renders on authenticated pages.
 */
export function useLocaleSyncOnAuth(
  initialPreferredLocale?: string | null,
): LocaleSyncOnAuthState {
  const { data: session, isPending } = useSession();
  const currentLocale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const searchParams = useSearchParams();
  const lastReplaceKeyRef = useRef<string | null>(null);
  const queryString = searchParams?.toString() ?? '';

  const preferredLocale = useMemo(() => {
    const sessionLocale = (session as { profile?: { locale?: string | null } } | null)?.profile?.locale;
    if (isAppLocale(sessionLocale)) return sessionLocale;
    if (isAppLocale(initialPreferredLocale)) return initialPreferredLocale;
    return null;
  }, [initialPreferredLocale, session]);

  const isLocaleRedirectPending = preferredLocale !== null && preferredLocale !== currentLocale;

  useEffect(() => {
    if (isPending && !preferredLocale) return;
    if (!preferredLocale || preferredLocale === currentLocale) return;

    const replaceKey = `${pathname}?${queryString}->${preferredLocale}`;
    if (lastReplaceKeyRef.current === replaceKey) return;
    lastReplaceKeyRef.current = replaceKey;

    const query =
      searchParams && searchParams.size > 0
        ? Object.fromEntries(searchParams.entries())
        : undefined;

    router.replace(
      // @ts-expect-error -- Params from the active route already match the pathname
      { pathname, params, query },
      { locale: preferredLocale },
    );
  }, [currentLocale, isPending, params, pathname, preferredLocale, queryString, router, searchParams]);

  return {
    preferredLocale,
    isLocaleRedirectPending,
  };
}
