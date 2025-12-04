'use client';

import { UserDeleteDialog } from '@/components/admin/users/user-delete-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Trash2 } from 'lucide-react';
import { useState } from 'react';

type UsersTableActionsProps = {
  userId: string;
  userName: string;
  userEmail: string;
  currentUserId?: string;
  onDeletedAction?: () => void;
};

export function UsersTableActions({ userId, userName, userEmail, currentUserId, onDeletedAction }: UsersTableActionsProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const isSelf = currentUserId === userId;

  return (
    <div className="flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground">
            <MoreHorizontal className="size-4" />
            Actions
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              if (isSelf) return;
              setDeleteOpen(true);
            }}
            disabled={isSelf}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="size-4" />
            Delete user
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <UserDeleteDialog
        open={deleteOpen}
        onOpenChangeAction={setDeleteOpen}
        userId={userId}
        userName={userName}
        userEmail={userEmail}
        onDeletedAction={onDeletedAction}
      />
    </div>
  );
}
