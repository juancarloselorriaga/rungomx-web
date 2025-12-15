'use client';

import { Users } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function SelfSignupUsersEmptyState() {
  const t = useTranslations('pages.selfSignupUsers.table.emptyState.noFilters');

  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border bg-card p-8 text-center shadow-sm">
      <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Users className="size-6" />
      </div>
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">{t('title')}</h2>
        <p className="max-w-xl text-sm text-muted-foreground">{t('description')}</p>
      </div>
    </div>
  );
}
