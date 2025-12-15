'use client';

import { buildAdminUsersQueryObject } from '@/components/admin/users/search-params';
import { adminUsersTextInputClassName } from '@/components/admin/users/styles';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePathname, useRouter } from '@/i18n/navigation';

import type { SelfSignupUsersColumnKey } from '@/lib/self-signup-users/types';
import { Filter, LayoutList, Search, SlidersHorizontal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { FormEvent, useMemo, useState } from 'react';

type SelfSignupUsersTableToolbarProps = {
  query: {
    role: 'all' | 'organizer' | 'athlete' | 'volunteer';
    search: string;
  };
  density: 'comfortable' | 'compact';
  onDensityChangeAction: (density: 'comfortable' | 'compact') => void;
  columnVisibility: Record<SelfSignupUsersColumnKey, boolean>;
  onToggleColumnAction: (key: SelfSignupUsersColumnKey) => void;
  onLoadingChangeAction?: (loading: boolean) => void;
};

export function SelfSignupUsersTableToolbar({
  query,
  density,
  onDensityChangeAction,
  columnVisibility,
  onToggleColumnAction,
  onLoadingChangeAction,
}: SelfSignupUsersTableToolbarProps) {
  const t = useTranslations('pages.selfSignupUsers.toolbar');
  const tTable = useTranslations('pages.selfSignupUsers.table');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchValue, setSearchValue] = useState(query.search);

  const navigate = (updates: Record<string, string | null | undefined>) => {
    onLoadingChangeAction?.(true);
    const queryObject = buildAdminUsersQueryObject(searchParams.toString(), updates);
    const href = { pathname, query: queryObject } as unknown as Parameters<typeof router.push>[0];
    router.push(href, { scroll: false });
  };

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    navigate({ search: searchValue.trim() || null, page: '1' });
  };

  const handleClearFilters = () => {
    setSearchValue('');
    navigate({ role: 'all', search: null, page: '1' });
  };

  const hasActiveFilters = query.role !== 'all' || query.search.trim() !== '';

  const densityOptions = useMemo(
    () =>
      [
        { key: 'comfortable', label: tTable('density.comfortable') },
        { key: 'compact', label: tTable('density.compact') },
      ] as const,
    [tTable],
  );

  const roleOptions = useMemo(
    () =>
      [
        { key: 'all', label: t('roleAll') },
        { key: 'organizer', label: t('roleOrganizer') },
        { key: 'athlete', label: t('roleAthlete') },
        { key: 'volunteer', label: t('roleVolunteer') },
      ] as const,
    [t],
  );

  const columnOptions = useMemo(
    () =>
      [
        { key: 'role', label: tTable('columns.role') },
        { key: 'created', label: tTable('columns.created') },
        { key: 'actions', label: tTable('columns.actions') },
      ] as const,
    [tTable],
  );

  return (
    <div className="space-y-3">
      {/* Search Section */}
      <div className="rounded-lg border bg-card p-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Search className="size-3.5" />
          <span>{t('searchLabel')}</span>
        </div>
        <form
          onSubmit={handleSearch}
          className="flex flex-col gap-2 sm:flex-row sm:items-center"
          key={query.search}
        >
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder={t('searchPlaceholder')}
              className={`min-w-[180px] pl-10 pr-3 ${adminUsersTextInputClassName}`}
            />
          </div>
          <Button type="submit" size="sm" variant="secondary" className="w-full shrink-0 sm:w-auto">
            {t('applyButton')}
          </Button>
        </form>
      </div>

      {/* Filters & Display Row */}
      <div className="flex flex-col gap-3 sm:flex-row">
        {/* Filters Section */}
        <div className="flex-1 rounded-lg border bg-card p-3">
          <div className="mb-2 flex justify-between gap-2 text-xs font-medium text-muted-foreground">
            <div className="flex gap-2">
              <Filter className="size-3.5" />
              <span>{t('filtersLabel')}</span>
            </div>
            <Button
              variant="ghost"
              type="button"
              disabled={!hasActiveFilters}
              onClick={handleClearFilters}
              className="text-destructive hover:bg-destructive/80 hover:text-destructive h-auto text-xs p-0 min-w-auto"
            >
              {t('clearFilters')}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {roleOptions.map(({ key, label }) => (
              <Button
                key={key}
                type="button"
                size="sm"
                variant={query.role === key ? 'default' : 'outline'}
                onClick={() => navigate({ role: key, page: '1' })}
                className="h-8 flex-1"
              >
                {label}
              </Button>
            ))}
          </div>
        </div>

        {/* Display Section */}
        <div className="flex-1 rounded-lg border bg-card p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <SlidersHorizontal className="size-3.5" />
            <span>{t('displayLabel')}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-0.5 rounded-md border bg-muted/30 p-0.5 flex-1">
              {densityOptions.map((option) => (
                <Button
                  key={option.key}
                  size="sm"
                  variant={density === option.key ? 'secondary' : 'ghost'}
                  className="h-7 px-2.5 text-xs flex-1"
                  onClick={() => onDensityChangeAction(option.key)}
                  type="button"
                >
                  {option.label}
                </Button>
              ))}
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs flex-1">
                  <LayoutList className="size-3.5" />
                  {t('columnsButton')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel>{t('columnsLabel')}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {columnOptions.map(({ key, label }) => (
                  <DropdownMenuCheckboxItem
                    key={key}
                    checked={columnVisibility[key]}
                    onCheckedChange={() => onToggleColumnAction(key)}
                  >
                    {label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </div>
  );
}
