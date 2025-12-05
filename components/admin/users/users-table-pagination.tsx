'use client';

import { useTranslations } from 'next-intl';
import { buildAdminUsersQueryObject } from '@/components/admin/users/search-params';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';

type UsersTablePaginationProps = {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  basePath: string;
  filters: Record<string, string>;
  onNavigateAction?: () => void;
  translationNamespace?: 'pages.adminUsers.pagination' | 'pages.selfSignupUsers.pagination';
};

export function UsersTablePagination({
  page,
  pageCount,
  total,
  pageSize,
  basePath,
  filters,
  onNavigateAction,
  translationNamespace = 'pages.adminUsers.pagination',
}: UsersTablePaginationProps) {
  const t = useTranslations(translationNamespace);
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = total === 0 ? 0 : Math.min(total, page * pageSize);

  const prevPage = Math.max(1, page - 1);
  const nextPage = pageCount === 0 ? page : Math.min(pageCount, page + 1);
  const prevDisabled = page <= 1;
  const nextDisabled = pageCount === 0 || page >= pageCount;

  const prevHref = {
    pathname: basePath,
    query: buildAdminUsersQueryObject(filters, { page: String(prevPage) }),
  } as Parameters<typeof Link>[0]['href'];
  const nextHref = {
    pathname: basePath,
    query: buildAdminUsersQueryObject(filters, { page: String(nextPage) }),
  } as Parameters<typeof Link>[0]['href'];

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-xs text-muted-foreground">
        {t('showing', { start, end, total })}
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={prevDisabled} asChild={!prevDisabled}>
          {prevDisabled ? (
            <>
              <ChevronLeft className="size-4" />
              {t('previous')}
            </>
          ) : (
            <Link href={prevHref} scroll={false} onClick={onNavigateAction}>
              <ChevronLeft className="size-4" />
              {t('previous')}
            </Link>
          )}
        </Button>
        <Button variant="outline" size="sm" disabled={nextDisabled} asChild={!nextDisabled}>
          {nextDisabled ? (
            <>
              {t('next')}
              <ChevronRight className="size-4" />
            </>
          ) : (
            <Link href={nextHref} scroll={false} onClick={onNavigateAction}>
              {t('next')}
              <ChevronRight className="size-4" />
            </Link>
          )}
        </Button>
      </div>
    </div>
  );
}
