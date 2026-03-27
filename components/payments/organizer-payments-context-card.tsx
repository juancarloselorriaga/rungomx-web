'use client';

import { DashboardSectionSurface } from '@/components/dashboard/dashboard-section-surface';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { CheckIcon, ChevronDownIcon } from 'lucide-react';

type OrganizationOption = {
  id: string;
  name: string;
};

type OrganizerPaymentsContextCardProps = {
  pathname: '/dashboard/payments' | '/dashboard/payments/payouts';
  organizations: OrganizationOption[];
  selectedOrganization: OrganizationOption;
  title: string;
  description: string;
  selectorLabel: string;
  organizationCountLabel: string;
};

export function OrganizerPaymentsContextCard({
  pathname,
  organizations,
  selectedOrganization,
  title,
  description,
  selectorLabel,
  organizationCountLabel,
}: OrganizerPaymentsContextCardProps) {
  const router = useRouter();

  return (
    <DashboardSectionSurface
      eyebrow={title}
      title={selectedOrganization.name}
      description={description}
      contentClassName="pt-4"
      actions={
        organizations.length > 1 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-between gap-3 whitespace-nowrap lg:w-auto lg:min-w-[15rem]"
              >
                {selectorLabel}
                <ChevronDownIcon className="size-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-[22rem] w-[18rem] overflow-y-auto">
              <DropdownMenuLabel>{selectorLabel}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {organizations.map((organization) => {
                const isSelected = organization.id === selectedOrganization.id;

                return (
                  <DropdownMenuItem
                    key={organization.id}
                    className="p-0"
                    onSelect={() =>
                      router.push({
                        pathname,
                        query: { organizationId: organization.id },
                      })
                    }
                  >
                    <div
                      className={cn(
                        'flex w-full items-start justify-between gap-3 rounded-sm px-2 py-2',
                        isSelected && 'bg-accent/60',
                      )}
                    >
                      <span className="space-y-0.5">
                        <span className="block max-w-[13rem] truncate font-medium">
                          {organization.name}
                        </span>
                      </span>
                      {isSelected ? (
                        <span className="inline-flex items-center text-muted-foreground">
                          <CheckIcon className="size-4" />
                        </span>
                      ) : null}
                    </div>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null
      }
    >
      {organizations.length > 1 ? (
        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
          {organizationCountLabel}
        </p>
      ) : null}
    </DashboardSectionSurface>
  );
}
