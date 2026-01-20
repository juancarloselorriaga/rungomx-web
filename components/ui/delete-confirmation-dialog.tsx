'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

type DeleteConfirmationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  itemName?: string;
  itemDetail?: string;
  onConfirm: () => Promise<void> | void;
  isPending?: boolean;
  cancelLabel?: string;
  confirmLabel?: string;
  confirmingLabel?: string;
};

export function DeleteConfirmationDialog({
  open,
  onOpenChange,
  title,
  description,
  itemName,
  itemDetail,
  onConfirm,
  isPending = false,
  cancelLabel,
  confirmLabel,
  confirmingLabel,
}: DeleteConfirmationDialogProps) {
  const t = useTranslations('common.deleteDialog');

  const handleConfirm = async () => {
    await onConfirm();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-foreground">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
          <div className="space-y-1">
            <p className="font-semibold text-destructive">{t('warningTitle')}</p>
            <p className="text-muted-foreground">{t('warningDescription')}</p>
          </div>
        </div>

        {itemName && (
          <div className="space-y-1 rounded-md border border-border/60 bg-muted/30 p-3 text-sm">
            <p className="font-semibold text-foreground">{itemName}</p>
            {itemDetail && <p className="text-muted-foreground">{itemDetail}</p>}
          </div>
        )}

        <DialogFooter className="flex justify-end gap-2 sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            {cancelLabel ?? t('cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={isPending}
            isLoading={isPending}
            loadingPlacement="replace"
            loadingLabel={confirmingLabel ?? t('deleting')}
            onClick={handleConfirm}
            className="min-w-[120px]"
          >
            <Trash2 className="size-4" />
            {confirmLabel ?? t('delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
