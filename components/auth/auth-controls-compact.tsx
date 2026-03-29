'use client';

import UserAvatar from '@/components/auth/user-avatar';
import { Button } from '@/components/ui/button';
import { Link, useRouter } from '@/i18n/navigation';
import { signOut } from '@/lib/auth/client';
import type { User } from '@/lib/auth/types';
import { cn } from '@/lib/utils';
import { LucideLogOut } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { FC, useTransition } from 'react';

interface AuthenticationControlsCompactProps {
  initialUser: User | null;
  cb?: () => void;
  className?: string;
}

const AuthControlsCompact: FC<AuthenticationControlsCompactProps> = ({
  cb,
  initialUser,
  className,
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
      <div className={cn('grid w-full grid-cols-2 gap-2', className)}>
        <Button
          asChild
          size="sm"
          variant="outline"
          className="w-full rounded-2xl px-4 py-2.5 whitespace-nowrap"
        >
          <Link href="/sign-in">{t('signIn')}</Link>
        </Button>
        <Button asChild size="sm" className="w-full rounded-2xl px-4 py-2.5 whitespace-nowrap">
          <Link href="/sign-up">{t('signUp')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className={cn('flex items-center justify-between gap-3', className)}>
      <UserAvatar size="sm" onClick={cb} user={initialUser} />
      <Button
        aria-label={t('signOut')}
        disabled={isPending}
        onClick={handleSignOut}
        variant="ghost"
        size="icon"
        className="rounded-full border border-border/55 bg-background/70 shadow-xs hover:bg-background"
      >
        <LucideLogOut size={16} />
      </Button>
    </div>
  );
};

export default AuthControlsCompact;
