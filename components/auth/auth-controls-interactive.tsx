'use client';

import UserAvatar from '@/components/auth/user-avatar';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { User } from '@/types/auth';
import { useTranslations } from 'next-intl';

interface AuthControls {
  user: User | null;
}

export const AuthControls = ({ user }: AuthControls) => {
  const t = useTranslations('Auth');

  const handleSignout = async () => {
    console.log('signout');
  };

  return user ? (
    <div className="flex items-center gap-4">
      <UserAvatar user={user}/>
      <form action={handleSignout}>
        <Button type="submit" variant={'outline'}>
          {t('signOut')}
        </Button>
      </form>
    </div>
  ) : (
    <div className="flex gap-2">
      <Button asChild size="sm" variant={'outline'}>
        <Link href="/sign-in">{t('signIn')}</Link>
      </Button>
      <Button asChild size="sm" variant={'default'}>
        <Link href="/sign-up">{t('signUp')}</Link>
      </Button>
    </div>
  );
};
