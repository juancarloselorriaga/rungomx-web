'use client';

import UserAvatar from '@/components/auth/user-avatar';
import { Button } from '@/components/ui/button';
import { Link, useRouter } from '@/i18n/navigation';
import { signOut } from '@/lib/auth/client';
import type { User } from '@/lib/auth/types';
import { LucideLogOut } from 'lucide-react';
import { FC, useTransition } from 'react';
import { useTranslations } from 'next-intl';

interface AuthenticationControlsCompactProps {
  initialUser: User | null;
  cb?: () => void;
}

const AuthControlsCompact: FC<AuthenticationControlsCompactProps> = ({
  cb,
  initialUser,
}) => {
  const t = useTranslations('auth');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleSignOut = () => {
    startTransition(async () => {
      try {
        await signOut();
      } finally {
        cb?.();
        router.refresh();
      }
    });
  };

  if (!initialUser) {
    return (
      <div className="flex gap-2">
        <Button asChild size="sm" variant="outline">
          <Link href="/sign-in">{t('signIn')}</Link>
        </Button>
        <Button asChild size="sm">
          <Link href="/sign-up">{t('signUp')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex gap-3 items-center">
      <UserAvatar size="sm" onClick={cb} user={initialUser}/>
      <Button
        aria-label={t('signOut')}
        disabled={isPending}
        onClick={handleSignOut}
        variant="ghost"
        size="icon"
      >
        <LucideLogOut size={16}/>
      </Button>
    </div>
  );
};

export default AuthControlsCompact;
