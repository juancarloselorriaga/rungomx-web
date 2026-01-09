'use client';

import { usePathname, useRouter } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { useSession } from '@/lib/auth/client';
import { useLocale } from 'next-intl';
import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';

/**
 * Syncs the user's DB locale preference with the browser when authenticated.
 * On session restore/login, if the user has a DB locale that differs from the
 * current browser locale, this hook redirects to their preferred locale.
 *
 * This hook should be used in a layout or provider that renders on authenticated pages.
 */
export function useLocaleSyncOnAuth() {
  const { data: session, isPending } = useSession();
  const currentLocale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const searchParams = useSearchParams();
  const lastSyncedLocaleRef = useRef<string | null>(null);

  useEffect(() => {
    // Don't sync while session is loading
    if (isPending) return;

    // Need a user with a profile to sync
    if (!session?.user) return;

    // Get the DB locale from the session profile (profile is at session.profile, not session.user.profile)
    const dbLocale = (session as { profile?: { locale?: string | null } }).profile
      ?.locale as AppLocale | null | undefined;

    // Skip if no DB locale or already synced to this locale
    if (!dbLocale) return;
    if (lastSyncedLocaleRef.current === dbLocale) return;

    // Only redirect if DB locale differs from current browser locale
    if (dbLocale !== currentLocale) {
      lastSyncedLocaleRef.current = dbLocale;

      const query =
        searchParams && searchParams.size > 0
          ? Object.fromEntries(searchParams.entries())
          : undefined;

      router.replace(
        // @ts-expect-error -- Params from the active route already match the pathname
        { pathname, params, query },
        { locale: dbLocale },
      );
    } else {
      // Already on correct locale, mark as synced
      lastSyncedLocaleRef.current = dbLocale;
    }
  }, [session, isPending, currentLocale, router, pathname, params, searchParams]);
}
