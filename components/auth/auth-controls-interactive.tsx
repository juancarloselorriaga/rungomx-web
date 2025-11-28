'use client';

import UserAvatar from '@/components/auth/user-avatar';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { signOut } from '@/lib/auth/client';
import type { User } from '@/lib/auth/types';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { FormEvent, useTransition } from 'react';
import { Loader2 } from 'lucide-react';

interface AuthControls {
  user: User | null;
}

export const AuthControls = ({ user }: AuthControls) => {
  const t = useTranslations('auth');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleSignout = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    startTransition(async () => {
      try {
        await signOut();
      } finally {
        router.refresh();
      }
    });
  };

  return user ? (
    <div className="flex items-center gap-4">
      <UserAvatar user={user}/>
      <form className="flex" onSubmit={handleSignout}>
        <Button disabled={isPending} type="submit" variant={'outline'}>
          {isPending ? <Loader2 className="size-4 animate-spin"/> : null}
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
