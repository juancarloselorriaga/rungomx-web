"use client";

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
};

type NavHref = Parameters<typeof Link>[0]['href'];

function buildHref(basePath: string, filters: Record<string, string>, updates: Record<string, string | null | undefined>): NavHref {
  const params = new URLSearchParams(filters);

  Object.entries(updates).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') {
      params.delete(key);
    } else {
      params.set(key, value);
    }
  });

  const query = Object.fromEntries(params.entries());
  return { pathname: basePath, query } as NavHref;
}

export function UsersTablePagination({ page, pageCount, total, pageSize, basePath, filters }: UsersTablePaginationProps) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = total === 0 ? 0 : Math.min(total, page * pageSize);

  const prevPage = Math.max(1, page - 1);
  const nextPage = pageCount === 0 ? page : Math.min(pageCount, page + 1);
  const prevDisabled = page <= 1;
  const nextDisabled = pageCount === 0 || page >= pageCount;

  const prevHref = buildHref(basePath, filters, { page: String(prevPage) });
  const nextHref = buildHref(basePath, filters, { page: String(nextPage) });

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-xs text-muted-foreground">
        Showing {start}-{end} of {total} users
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={prevDisabled} asChild={!prevDisabled}>
          {prevDisabled ? (
            <>
              <ChevronLeft className="size-4" />
              Previous
            </>
          ) : (
            <Link href={prevHref} scroll={false}>
              <ChevronLeft className="size-4" />
              Previous
            </Link>
          )}
        </Button>
        <Button variant="outline" size="sm" disabled={nextDisabled} asChild={!nextDisabled}>
          {nextDisabled ? (
            <>
              Next
              <ChevronRight className="size-4" />
            </>
          ) : (
            <Link href={nextHref} scroll={false}>
              Next
              <ChevronRight className="size-4" />
            </Link>
          )}
        </Button>
      </div>
    </div>
  );
}
