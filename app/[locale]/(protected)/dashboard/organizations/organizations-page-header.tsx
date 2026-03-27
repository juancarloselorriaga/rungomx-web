'use client';

import { DashboardPageIntro } from '@/components/dashboard/page-intro';
import { DashboardPageIntroMeta } from '@/components/dashboard/page-intro';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { CreateOrganizationDialog } from './create-organization-dialog';

type OrganizationsPageHeaderProps = {
  title: string;
  description: string;
  totalOrganizations: number;
  isSupportUser: boolean;
};

export function OrganizationsPageHeader({
  title,
  description,
  totalOrganizations,
  isSupportUser,
}: OrganizationsPageHeaderProps) {
  const t = useTranslations('pages.dashboard.organizations');
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div>
      <DashboardPageIntro
        title={title}
        description={description}
        actions={
          <Button onClick={() => setDialogOpen(true)} className="w-full min-w-0 sm:w-auto">
            <Plus className="size-4" />
            {t('createButton')}
          </Button>
        }
        aside={
          <DashboardPageIntroMeta
            eyebrow={t('summary.eyebrow')}
            title={t('summary.total', { count: totalOrganizations })}
            subtitle={isSupportUser ? t('summary.supportSubtitle') : t('summary.memberSubtitle')}
          />
        }
      />
      <CreateOrganizationDialog open={dialogOpen} onOpenChangeAction={setDialogOpen} />
    </div>
  );
}
