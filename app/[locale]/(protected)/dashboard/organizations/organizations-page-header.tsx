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
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold mb-2">{title}</h1>
        <p className="text-muted-foreground">{description}</p>
      </div>
      <Button onClick={() => setDialogOpen(true)}>
        <Plus className="size-4" />
        {t('createButton')}
      </Button>
      <CreateOrganizationDialog open={dialogOpen} onOpenChangeAction={setDialogOpen} />
    </div>
  );
}
