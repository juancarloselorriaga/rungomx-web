'use client';

import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { useSession } from '@/lib/auth/client';
import { useTranslations } from 'next-intl';

export function AuthCtaWithSession() {
  const tAuth = useTranslations('auth');
  const tHome = useTranslations('pages.home');
  const { data } = useSession();

  const isLoggedIn = !!data?.user;
  const label = isLoggedIn
    ? tHome('actions.goToDashboard')
    : tAuth('signIn');
  const href = isLoggedIn ? '/dashboard' : '/sign-in';

  return (
    <Button
      asChild
      size="sm"
      className="min-w-[128px] justify-center whitespace-nowrap text-foreground"
    >
      <Link href={href}>
        {label}
      </Link>
    </Button>
  );
}
