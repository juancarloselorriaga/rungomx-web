'use server';

import { auth } from '@/lib/auth';
import { withAuthenticatedUser } from '@/lib/auth/action-wrapper';
import { type AppLocale, routing } from '@/i18n/routing';
import { upsertProfile } from '@/lib/profiles/repository';
import { headers } from 'next/headers';

type UpdateLocaleResult =
  | { ok: true; locale: AppLocale }
  | { ok: false; error: 'UNAUTHENTICATED' | 'INVALID_LOCALE' | 'SERVER_ERROR' };

function isValidLocale(locale: string): locale is AppLocale {
  return routing.locales.includes(locale as AppLocale);
}

export const updateUserLocale = withAuthenticatedUser<UpdateLocaleResult>({
  unauthenticated: () => ({ ok: false, error: 'UNAUTHENTICATED' }),
})(async ({ user }, locale: string) => {
  try {
    if (!isValidLocale(locale)) {
      return { ok: false, error: 'INVALID_LOCALE' };
    }

    await upsertProfile(user.id, { locale });

    // Force the session cache to refresh so client hooks see the updated locale
    const h = await headers();
    await auth.api.getSession({
      headers: h,
      query: { disableCookieCache: true },
    });

    return { ok: true, locale };
  } catch (error) {
    console.error('[locale] Failed to update user locale:', error);
    return { ok: false, error: 'SERVER_ERROR' };
  }
});
