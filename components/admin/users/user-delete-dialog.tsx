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
import { AlertTriangle, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

type UserDeleteDialogProps = {
  open: boolean;
  onOpenChangeAction: (open: boolean) => void;
  userId: string;
  userName: string;
  userEmail: string;
  onDeletedAction?: () => void;
  onPendingChangeAction?: (isPending: boolean) => void;
};

export function UserDeleteDialog({
  open,
  onOpenChangeAction,
  userId,
  userName,
  userEmail,
  onDeletedAction,
  onPendingChangeAction,
}: UserDeleteDialogProps) {
  const t = useTranslations('pages.adminUsers.deleteDialog');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleDelete = () => {
    setError(null);

    startTransition(async () => {
      onPendingChangeAction?.(true);

      try {
        const result = await deleteInternalUser({ userId });

        if (!result.ok) {
          if (result.error === 'UNAUTHENTICATED') {
            const message = t('errors.unauthenticated');
            setError(message);
            toast.error(message);
            return;
          }

          if (result.error === 'FORBIDDEN') {
            const message = t('errors.forbidden');
            setError(message);
            toast.error(message);
            return;
          }

          if (result.error === 'CANNOT_DELETE_SELF') {
            const message = t('errors.cannotDeleteSelf');
            setError(message);
            toast.error(message);
            return;
          }

          if (result.error === 'NOT_FOUND') {
            const message = t('errors.notFound');
            setError(message);
            toast.error(message);
            return;
          }

          const message = t('errors.genericError');
          setError(message);
          toast.error(message);
          return;
        }

        toast.success(t('success.toast'), { description: userEmail });
        onOpenChangeAction(false);
        onDeletedAction?.();
      } catch {
        const message = t('errors.genericError');
        setError(message);
        toast.error(message);
      } finally {
        onPendingChangeAction?.(false);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChangeAction}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>
            {t('description', { userName: userName || userEmail })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-foreground">
          <AlertTriangle className="mt-0.5 size-5 text-destructive" />
          <div className="space-y-1">
            <p className="font-semibold text-destructive">{t('warning.title')}</p>
            <p className="text-muted-foreground">{t('warning.description')}</p>
          </div>
        </div>

        <div className="space-y-1 rounded-md border border-border/60 bg-muted/30 p-3 text-sm">
          <p className="font-semibold text-foreground">{userName || t('userInfo.unnamedUser')}</p>
          <p className="text-muted-foreground">{userEmail}</p>
        </div>

        {error ? (
          <div
            className={cn(
              'rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive',
            )}
          >
            {error}
          </div>
        ) : null}

        <DialogFooter className="flex justify-end gap-2 sm:justify-end">
          <Button type="button" variant="ghost" onClick={() => onOpenChangeAction(false)}>
            {t('buttons.cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={isPending}
            isLoading={isPending}
            loadingPlacement="replace"
            loadingLabel={t('buttons.deleting')}
            onClick={handleDelete}
            className="min-w-[120px]"
          >
            <Trash2 className="size-4" />
            {t('buttons.delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
