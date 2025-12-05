'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { buildAdminUsersQueryObject } from '@/components/admin/users/search-params';
import { adminUsersTextInputClassName } from '@/components/admin/users/styles';
import { LayoutList, Search, SlidersHorizontal, Filter } from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { useSearchParams } from 'next/navigation';

import type { SelfSignupUsersColumnKey } from '@/lib/self-signup-users/types';

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

  const densityOptions = useMemo(
    () => [
      { key: 'comfortable', label: tTable('density.comfortable') },
      { key: 'compact', label: tTable('density.compact') },
    ] as const,
    [tTable]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Filter className="size-4" />
          <span>{t('filtersLabel')}</span>
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <form onSubmit={handleSearch} className="flex flex-1 items-center gap-2" key={query.search}>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder={t('searchPlaceholder')}
                className={`pl-10 pr-3 ${adminUsersTextInputClassName}`}
              />
            </div>
            <Button type="submit" size="sm" variant="secondary">
              {t('applyButton')}
            </Button>
          </form>

          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                { key: 'all', label: t('roleAll') },
                { key: 'organizer', label: t('roleOrganizer') },
                { key: 'athlete', label: t('roleAthlete') },
                { key: 'volunteer', label: t('roleVolunteer') },
              ] as const
            ).map(({ key, label }) => (
              <Button
                key={key}
                type="button"
                size="sm"
                variant={query.role === key ? 'default' : 'outline'}
                onClick={() => navigate({ role: key, page: '1' })}
              >
                {label}
              </Button>
            ))}

            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => navigate({ role: 'all', search: null, page: '1' })}
            >
              {t('clearFilters')}
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
              <SlidersHorizontal className="size-4" />
              {t('displayLabel')}
            </div>
            <div className="flex items-center gap-1 rounded-md border bg-background px-2 py-1">
              {densityOptions.map((option) => (
                <Button
                  key={option.key}
                  size="sm"
                  variant={density === option.key ? 'secondary' : 'ghost'}
                  className="h-8 text-xs"
                  onClick={() => onDensityChangeAction(option.key)}
                  type="button"
                >
                  {option.label}
                </Button>
              ))}
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-2 text-xs">
                  <LayoutList className="size-4" />
                  {t('columnsButton')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel>{t('columnsLabel')}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {(
                  [
                    { key: 'role', label: tTable('columns.role') },
                    { key: 'created', label: tTable('columns.created') },
                    { key: 'actions', label: tTable('columns.actions') },
                  ] as const
                ).map(({ key, label }) => (
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
