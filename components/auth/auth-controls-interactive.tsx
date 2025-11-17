'use client';

import UserAvatar from '@/components/auth/user-avatar';
import { Button } from '@/components/ui/button';
import { User } from '@/types/auth';
import Link from 'next/link';

interface AuthControls {
  user: User | null;
}

export const AuthControls = ({ user }: AuthControls) => {

  const handleSignout = async () => {
    console.log('signout');
  };

  return user ? (
    <div className="flex items-center gap-4">
      <UserAvatar user={user}/>
      <form action={handleSignout}>
        <Button type="submit" variant={'outline'}>
          Sign out
        </Button>
      </form>
    </div>
  ) : (
    <div className="flex gap-2">
      <Button asChild size="sm" variant={'outline'}>
        <Link href="/sign-in">Sign in</Link>
      </Button>
      <Button asChild size="sm" variant={'default'}>
        <Link href="/sign-up">Sign up</Link>
      </Button>
    </div>
  );
};
