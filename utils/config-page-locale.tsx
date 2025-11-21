import { LocalePageProps } from '@/types/next';
import { setRequestLocale } from 'next-intl/server';

/**
 * Configures locale settings for static page rendering in Next.js.
 *
 * This utility function enables static rendering by setting the request locale context
 * before the page component renders. It's essential for Next.js App Router pages that
 * use internationalization (i18n) with next-intl and need to be statically generated
 * at build time rather than rendered on-demand.
 *
 * @param params - The page params an object containing the locale segment from the URL route
 * @returns An object containing the resolved locale string
 *
 * @example
 * ```tsx
 * // In a Next.js page component (app/[locale]/page.tsx)
 * export default async function Page({ params }: LocalePageProps) {
 *   'use cache'
 *   const { locale } = await configPageLocale(params);
 *
 *   return <div>Current locale: {locale}</div>;
 * }
 * ```
 *
 * @see {@link https://next-intl-docs.vercel.app/docs/getting-started/app-router/with-i18n-routing#static-rendering|next-intl Static Rendering}
 */
export const configPageLocale = async (params: LocalePageProps['params']) => {
  const { locale } = await params;

  // Enable static rendering by setting the locale in the request context.
  // This allows next-intl to access the locale during static generation without
  // relying on runtime request headers, which would force dynamic rendering.
  setRequestLocale(locale);

  return { locale };
};