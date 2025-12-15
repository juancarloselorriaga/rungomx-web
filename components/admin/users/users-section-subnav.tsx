'use client';

import { SectionSubnav, type SectionSubnavItem } from '@/components/ui/section-subnav';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

type UsersSectionSubnavProps = {
  className?: string;
};

export function UsersSectionSubnav({ className }: UsersSectionSubnavProps) {
  const t = useTranslations('pages.adminUsers.subnav');

  const items: SectionSubnavItem[] = useMemo(
    () => [
      {
        key: 'internal',
        href: '/admin/users',
        localizedHref: '/admin/usuarios',
        label: t('internal.label'),
        description: t('internal.description'),
      },
      {
        key: 'selfSignup',
        href: '/admin/users/self-signup',
        localizedHref: '/admin/usuarios/auto-registro',
        label: t('selfSignup.label'),
        description: t('selfSignup.description'),
      },
    ],
    [t],
  );

  return <SectionSubnav items={items} className={className} />;
}
