import { listSelfSignupUsers } from '@/app/actions/self-signup-users-list';
import { SelfSignupUsersClient } from '@/components/admin/users/self-signup-users-client';
import {
  normalizeSelfSignupUsersQuery,
  type NormalizedSelfSignupUsersQuery,
  parseSelfSignupUsersSearchParams,
} from '@/lib/self-signup-users/query';
import { type SerializedSelfSignupUserRow } from '@/lib/self-signup-users/types';
import { getAuthContext } from '@/lib/auth/server';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { createLocalizedPageMetadata } from '@/utils/seo';
import type { Metadata } from 'next';

type SelfSignupUsersPageProps = LocalePageProps & {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: LocalePageProps): Promise<Metadata> {
  const { locale } = await params;
  const { getTranslations } = await import('next-intl/server');
  const t = await getTranslations({ locale, namespace: 'pages.selfSignupUsers.metadata' });

  return createLocalizedPageMetadata(
    locale,
    '/admin/users/self-signup',
    () => ({
      title: t('title'),
      description: t('description'),
    }),
    { robots: { index: false, follow: false } }
  );
}

export default async function SelfSignupUsersPage({ params, searchParams }: SelfSignupUsersPageProps) {
  await configPageLocale(params, { pathname: '/admin/users/self-signup' });
  const authContext = await getAuthContext();

  const resolvedSearchParams = await searchParams;
  const query = parseSelfSignupUsersSearchParams(resolvedSearchParams);
  const normalizedQuery: NormalizedSelfSignupUsersQuery = normalizeSelfSignupUsersQuery(query);

  const result = await listSelfSignupUsers(normalizedQuery);

  const initialUsers: SerializedSelfSignupUserRow[] = result.ok
    ? result.users.map((user) => ({
        ...user,
        createdAt: user.createdAt.toISOString(),
      }))
    : [];

  const initialError = result.ok ? null : result.error;

  const paginationMeta = result.ok
    ? {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        pageCount: result.pageCount,
      }
    : {
        page: normalizedQuery.page,
        pageSize: normalizedQuery.pageSize,
        total: 0,
        pageCount: 0,
      };

  return (
    <SelfSignupUsersClient
      initialUsers={initialUsers}
      initialError={initialError}
      initialQuery={{
        ...normalizedQuery,
        page: result.ok ? result.page : normalizedQuery.page,
        pageSize: result.ok ? result.pageSize : normalizedQuery.pageSize,
      }}
      paginationMeta={paginationMeta}
      currentUserId={authContext.user?.id}
      currentUserEmail={authContext.user?.email ?? undefined}
    />
  );
}
