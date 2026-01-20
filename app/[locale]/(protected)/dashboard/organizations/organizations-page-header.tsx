'use client';

import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { CreateOrganizationDialog } from './create-organization-dialog';

type OrganizationsPageHeaderProps = {
  title: string;
  description: string;
};

export function OrganizationsPageHeader({ title, description }: OrganizationsPageHeaderProps) {
  const t = useTranslations('pages.dashboard.organizations');
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-3xl font-bold mb-2">{title}</h1>
        <p className="text-muted-foreground">{description}</p>
      </div>
      <Button onClick={() => setDialogOpen(true)} className="w-full min-w-0 sm:w-auto">
        <Plus className="size-4" />
        {t('createButton')}
      </Button>
      <CreateOrganizationDialog open={dialogOpen} onOpenChangeAction={setDialogOpen} />
    </div>
  );
}
