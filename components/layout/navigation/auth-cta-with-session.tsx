'use client';

import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { useSession } from '@/lib/auth/client';
import type { User } from '@/lib/auth/types';
import { useTranslations } from 'next-intl';

interface AuthCtaWithSessionProps {
  initialUser?: User | null;
}

export function AuthCtaWithSession({ initialUser }: AuthCtaWithSessionProps) {
  const tAuth = useTranslations('auth');
  const tHome = useTranslations('pages.home');
  const { data, isPending } = useSession();

  // Use server state during hydration, then client state for real-time updates
  const user = isPending ? initialUser : (data?.user ?? null);
  const isLoggedIn = !!user;
  const label = isLoggedIn ? tHome('actions.goToDashboard') : tAuth('signIn');
  const href = isLoggedIn ? '/dashboard' : '/sign-in';

  return (
    <Button asChild size="sm" className="min-w-[128px] justify-center whitespace-nowrap">
      <Link href={href}>{label}</Link>
    </Button>
  );
}
