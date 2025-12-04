'use client';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Filter, LayoutList, Search, SlidersHorizontal } from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { useSearchParams } from 'next/navigation';

type ColumnKey = 'role' | 'permissions' | 'created' | 'actions';

type UsersTableToolbarProps = {
  query: {
    role: 'all' | 'admin' | 'staff';
    search: string;
  };
  density: 'comfortable' | 'compact';
  onDensityChangeAction: (density: 'comfortable' | 'compact') => void;
  columnVisibility: Record<ColumnKey, boolean>;
  onToggleColumnAction: (key: ColumnKey) => void;
};

export function UsersTableToolbar({
  query,
  density,
  onDensityChangeAction,
  columnVisibility,
  onToggleColumnAction,
}: UsersTableToolbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchValue, setSearchValue] = useState(query.search);

  const navigate = (updates: Record<string, string | null | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());

    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === undefined || value === '') {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });

    const query = Object.fromEntries(params.entries());
    const href = { pathname, query } as unknown as Parameters<typeof router.push>[0];
    router.push(href, { scroll: false });
  };

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    navigate({ search: searchValue.trim() || null, page: '1' });
  };

  const densityOptions = useMemo(
    () => [
      { key: 'comfortable', label: 'Comfortable' },
      { key: 'compact', label: 'Compact' },
    ] as const,
    []
  );

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold leading-tight">Internal users</h2>
        <p className="text-sm text-muted-foreground">Admins and staff with control panel access.</p>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Filter className="size-4" />
          <span>Filters</span>
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <form onSubmit={handleSearch} className="flex flex-1 items-center gap-2" key={query.search}>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder="Search by name or email"
                className="w-full rounded-md border bg-background pl-10 pr-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
              />
            </div>
            <Button type="submit" size="sm" variant="secondary">
              Apply
            </Button>
          </form>

          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                { key: 'all', label: 'All' },
                { key: 'admin', label: 'Admin' },
                { key: 'staff', label: 'Staff' },
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
              Clear filters
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
              <SlidersHorizontal className="size-4" />
              Display
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
                  Columns
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel>Show columns</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {(
                  [
                    { key: 'role', label: 'Internal role' },
                    { key: 'permissions', label: 'Permissions' },
                    { key: 'created', label: 'Created' },
                    { key: 'actions', label: 'Actions' },
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
