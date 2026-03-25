'use client';

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
import {
  PaymentsEyebrow,
  PaymentsSectionDescription,
  PaymentsSectionTitle,
} from './payments-typography';

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
    <section className="rounded-xl border bg-card/60 p-4 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-1">
          <PaymentsEyebrow>{title}</PaymentsEyebrow>
          <div className="flex flex-col gap-1 lg:flex-row lg:items-center lg:gap-3">
            <PaymentsSectionTitle compact className="truncate">
              {selectedOrganization.name}
            </PaymentsSectionTitle>
            {organizations.length > 1 ? (
              <p className="text-xs text-muted-foreground">{organizationCountLabel}</p>
            ) : null}
          </div>
          <PaymentsSectionDescription className="max-w-2xl">{description}</PaymentsSectionDescription>
        </div>

        {organizations.length > 1 ? (
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
        ) : null}
      </div>
    </section>
  );
}
