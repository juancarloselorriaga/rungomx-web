'use client';

import { SectionSubnav, type SectionSubnavItem } from '@/components/ui/section-subnav';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

type SettingsSectionSubnavProps = {
  className?: string;
};

export function SettingsSectionSubnav({ className }: SettingsSectionSubnavProps) {
  const t = useTranslations('components.settings.shell');

  const items: SectionSubnavItem[] = useMemo(
    () => [
      {
        key: 'profile',
        href: '/settings/profile',
        localizedHref: '/configuracion/perfil',
        label: t('sections.profile.title'),
        description: t('sections.profile.description'),
      },
      {
        key: 'account',
        href: '/settings/account',
        localizedHref: '/configuracion/cuenta',
        label: t('sections.account.title'),
        description: t('sections.account.description'),
      },
    ],
    [t],
  );

  return <SectionSubnav items={items} className={className} />;
}
