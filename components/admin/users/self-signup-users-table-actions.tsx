'use client';

import { UserDeleteDialog } from '@/components/admin/users/user-delete-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Link } from '@/i18n/navigation';
import { useSession } from '@/lib/auth/client';
import { BadgeCheck, Loader2, MoreHorizontal, ShieldCheck, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

type SelfSignupUsersTableActionsProps = {
  userId: string;
  userName: string;
  userEmail: string;
  currentUserId?: string;
  onDeletedAction?: () => void;
};

export function SelfSignupUsersTableActions({
  userId,
  userName,
  userEmail,
  currentUserId,
  onDeletedAction,
}: SelfSignupUsersTableActionsProps) {
  const t = useTranslations('pages.selfSignupUsers.actions');
  const { data } = useSession();
  const canManageUsers = Boolean(data?.permissions?.canManageUsers);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const isSelf = currentUserId === userId;

  return (
    <div className="flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-muted-foreground"
            disabled={isPending}
          >
            {isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <MoreHorizontal className="size-4" />
            )}
            {isPending ? t('working') : ''}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem asChild>
            <Link
              href={{
                pathname: '/admin/users/pro-access',
                query: { email: userEmail },
              }}
            >
              <BadgeCheck className="size-4" />
              {t('proStatus')}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link
              href={{
                pathname: '/admin/users/pro-access',
                query: { email: userEmail, section: 'overrides' },
              }}
            >
              <ShieldCheck className="size-4" />
              {t('proOverrides')}
            </Link>
          </DropdownMenuItem>
          {canManageUsers ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  if (isSelf) return;
                  setDeleteOpen(true);
                }}
                disabled={isSelf || isPending}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="size-4" />
                {t('deleteUser')}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {canManageUsers ? (
        <UserDeleteDialog
          open={deleteOpen}
          onOpenChangeAction={setDeleteOpen}
          userId={userId}
          userName={userName}
          userEmail={userEmail}
          translationNamespace="pages.selfSignupUsers.deleteDialog"
          onDeletedAction={onDeletedAction}
          onPendingChangeAction={(pending) => {
            setIsPending(pending);
          }}
        />
      ) : null}
    </div>
  );
}
