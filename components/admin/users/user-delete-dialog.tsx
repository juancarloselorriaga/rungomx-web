'use client';

import { deleteInternalUser } from '@/app/actions/admin-users-delete';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { AlertTriangle } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

type UserDeleteDialogProps = {
  open: boolean;
  onOpenChangeAction: (open: boolean) => void;
  userId: string;
  userName: string;
  userEmail: string;
  onDeletedAction?: () => void;
};

export function UserDeleteDialog({ open, onOpenChangeAction, userId, userName, userEmail, onDeletedAction }: UserDeleteDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleDelete = () => {
    setError(null);

    startTransition(async () => {
      const result = await deleteInternalUser({ userId });

      if (!result.ok) {
        if (result.error === 'UNAUTHENTICATED') {
          const message = 'Your session expired. Please sign in again.';
          setError(message);
          toast.error(message);
          return;
        }

        if (result.error === 'FORBIDDEN') {
          const message = 'You are not allowed to delete internal users.';
          setError(message);
          toast.error(message);
          return;
        }

        if (result.error === 'CANNOT_DELETE_SELF') {
          const message = 'You cannot delete your own account.';
          setError(message);
          toast.error(message);
          return;
        }

        if (result.error === 'NOT_FOUND') {
          const message = 'User not found or already removed.';
          setError(message);
          toast.error(message);
          return;
        }

        const message = 'Could not delete this user. Try again later.';
        setError(message);
        toast.error(message);
        return;
      }

      toast.success('User deleted', { description: userEmail });
      onOpenChangeAction(false);
      onDeletedAction?.();
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChangeAction}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete user</DialogTitle>
          <DialogDescription>
            This will revoke internal access for <span className="font-semibold text-foreground">{userName || userEmail}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-foreground">
          <AlertTriangle className="mt-0.5 size-5 text-destructive" />
          <div className="space-y-1">
            <p className="font-semibold text-destructive">Are you sure you want to delete this user?</p>
            <p className="text-muted-foreground">
              Their internal account will be deactivated. You can recreate them later if needed.
            </p>
          </div>
        </div>

        <div className="space-y-1 rounded-md border border-border/60 bg-muted/30 p-3 text-sm">
          <p className="font-semibold text-foreground">{userName || 'Unnamed user'}</p>
          <p className="text-muted-foreground">{userEmail}</p>
        </div>

        {error ? (
          <div className={cn('rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive')}>
            {error}
          </div>
        ) : null}

        <DialogFooter className="flex justify-end gap-2 sm:justify-end">
          <Button type="button" variant="ghost" onClick={() => onOpenChangeAction(false)}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" disabled={isPending} onClick={handleDelete}>
            {isPending ? 'Deleting...' : 'Delete user'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
