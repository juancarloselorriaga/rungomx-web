'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Link, usePathname } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';

type SettingsSectionSubnavProps = {
  className?: string;
};

export function SettingsSectionSubnav({ className }: SettingsSectionSubnavProps) {
  const t = useTranslations('components.settings.shell');
  const pathname = usePathname()?.replace(/\/+$/, '') || '/';

  const items = [
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
  ] as const;

  return (
    <div
      className={cn(
        'flex flex-wrap items-stretch gap-1 rounded-lg border bg-background/60 p-1',
        className
      )}
    >
      {items.map((item) => {
        const isActive =
          pathname === item.href ||
          pathname === item.localizedHref;

        return (
          <Button
            key={item.key}
            asChild
            variant={isActive ? 'secondary' : 'ghost'}
            size="sm"
            className={cn(
              'h-auto flex-1 items-start justify-start gap-2 px-3 py-2 text-left sm:flex-none sm:min-w-[240px]',
              isActive ? 'shadow-sm' : 'text-muted-foreground'
            )}
          >
            <Link href={item.href} scroll={false} replace={isActive}>
              <div className="flex flex-col">
                <span className="text-sm font-semibold leading-tight">{item.label}</span>
                <span className="text-xs leading-tight text-muted-foreground">
                  {item.description}
                </span>
              </div>
            </Link>
          </Button>
        );
      })}
    </div>
  );
}

