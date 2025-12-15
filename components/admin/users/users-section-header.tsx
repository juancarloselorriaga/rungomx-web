'use client';

import { UsersSectionSubnav } from '@/components/admin/users/users-section-subnav';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

type UsersSectionHeaderProps = {
  view: 'internal' | 'selfSignup';
  currentUserEmail?: string;
  primaryAction?: ReactNode;
  className?: string;
};

export function UsersSectionHeader({
  view,
  currentUserEmail,
  primaryAction,
  className,
}: UsersSectionHeaderProps) {
  const tAdmin = useTranslations('pages.adminUsers');
  const tSelfSignup = useTranslations('pages.selfSignupUsers');

  const tPage = view === 'internal' ? tAdmin : tSelfSignup;

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary/80">
            {tPage('page.sectionLabel')}
          </p>
          <div className="space-y-1">
            <h1 className="text-3xl font-bold leading-tight">{tPage('page.title')}</h1>
            <p className="text-muted-foreground">{tPage('page.description')}</p>
          </div>
          {currentUserEmail ? (
            <p className="text-xs text-muted-foreground">
              {tPage('page.signedInAs', { email: currentUserEmail })}
            </p>
          ) : null}
        </div>

        {primaryAction ? <div className="w-full sm:w-auto">{primaryAction}</div> : null}
      </div>

      <UsersSectionSubnav />
    </div>
  );
}
