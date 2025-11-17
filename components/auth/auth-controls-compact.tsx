'use client';

import UserAvatar from '@/components/auth/user-avatar';
import { Button } from '@/components/ui/button';
import { User } from '@/types/auth';
import { LucideLogOut } from 'lucide-react';
import { FC } from 'react';

interface AuthenticationControlsCompactProps {
  initialUser: User | null;
  cb?: () => void;
}

const AuthControlsCompact: FC<AuthenticationControlsCompactProps> = ({
  cb,
  initialUser,
}) => {
  return (
    <div className="flex gap-3 items-center">
      <UserAvatar size="sm" onClick={cb} user={initialUser}/>
      <Button
        onClick={() => {
          cb?.();
        }}
        variant="ghost"
        size="icon"
      >
        <LucideLogOut size={16}/>
      </Button>
    </div>
  );
};

export default AuthControlsCompact;
