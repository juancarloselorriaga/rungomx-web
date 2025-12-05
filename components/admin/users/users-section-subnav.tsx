'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Link, usePathname } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';

type UsersSectionSubnavProps = {
  className?: string;
};

export function UsersSectionSubnav({ className }: UsersSectionSubnavProps) {
  const t = useTranslations('pages.adminUsers.subnav');
  const pathname = usePathname();

  const items = [
    {
      key: 'internal',
      href: '/admin/users',
      label: t('internal.label'),
      description: t('internal.description'),
    },
    {
      key: 'selfSignup',
      href: '/admin/users/self-signup',
      label: t('selfSignup.label'),
      description: t('selfSignup.description'),
    },
  ] as const;

  return (
    <div className={cn('flex flex-wrap gap-2 rounded-lg border bg-muted/40 p-1', className)}>
      {items.map((item) => {
        const isActive = pathname?.endsWith(item.href) ?? false;

        return (
          <Button
            key={item.key}
            asChild
            variant={isActive ? 'secondary' : 'ghost'}
            size="sm"
            className={cn(
              'h-auto items-start gap-2 px-3 py-2 text-left',
              isActive ? 'shadow-sm' : 'text-muted-foreground'
            )}
          >
            <Link href={item.href} scroll={false} replace={isActive}>
              <span className="block text-sm font-semibold">{item.label}</span>
              <span className="block text-xs text-muted-foreground">{item.description}</span>
            </Link>
          </Button>
        );
      })}
    </div>
  );
}
