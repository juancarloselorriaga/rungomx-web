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
import { FormField } from '@/components/ui/form-field';
import { useRouter } from '@/i18n/navigation';
import { deleteOrganization } from '@/lib/organizations/actions';
import { cn } from '@/lib/utils';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

type DeleteOrganizationDialogProps = {
  open: boolean;
  onOpenChangeAction: (open: boolean) => void;
  organizationId: string;
  organizationName: string;
};

export function DeleteOrganizationDialog({
  open,
  onOpenChangeAction,
  organizationId,
  organizationName,
}: DeleteOrganizationDialogProps) {
  const t = useTranslations('pages.dashboard.organizations.deleteDialog');
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [confirmName, setConfirmName] = useState('');
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isConfirmValid = confirmName.trim().toLowerCase() === organizationName.toLowerCase();

  const handleOpenChange = (newOpen: boolean) => {
    onOpenChangeAction(newOpen);
    // Reset state when dialog closes
    if (!newOpen) {
      setError(null);
      setConfirmName('');
      setConfirmError(null);
    }
  };

  const handleDelete = () => {
    setError(null);
    setConfirmError(null);

    if (!isConfirmValid) {
      setConfirmError(t('fields.confirmName.mismatch'));
      return;
    }

    startTransition(async () => {
      try {
        const result = await deleteOrganization({ organizationId });

        if (!result.ok) {
          if (result.code === 'UNAUTHENTICATED') {
            const message = t('errors.unauthenticated');
            setError(message);
            toast.error(message);
            return;
          }

          if (result.code === 'FORBIDDEN') {
            const message = t('errors.forbidden');
            setError(message);
            toast.error(message);
            return;
          }

          if (result.code === 'NOT_FOUND') {
            const message = t('errors.notFound');
            setError(message);
            toast.error(message);
            return;
          }

          if (result.code === 'HAS_ACTIVE_EVENTS') {
            // Extract count from error message pattern: "Cannot delete organization with N active event series..."
            const match = result.error.match(/with (\d+) active/);
            const count = match ? parseInt(match[1], 10) : 0;
            const message = t('errors.hasActiveEvents', { count });
            setError(message);
            toast.error(message);
            return;
          }

          const message = t('errors.genericError');
          setError(message);
          toast.error(message);
          return;
        }

        toast.success(t('success.toast', { name: organizationName }));
        handleOpenChange(false);
        router.push('/dashboard/organizations');
      } catch {
        const message = t('errors.genericError');
        setError(message);
        toast.error(message);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description', { name: organizationName })}</DialogDescription>
        </DialogHeader>

        <div className="flex gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-foreground">
          <AlertTriangle className="mt-0.5 size-5 flex-shrink-0 text-destructive" />
          <div className="space-y-1">
            <p className="font-semibold text-destructive">{t('warning.title')}</p>
            <p className="text-muted-foreground">{t('warning.description')}</p>
          </div>
        </div>

        <div className="space-y-1 rounded-md border border-border/60 bg-muted/30 p-3 text-sm">
          <p className="font-semibold text-foreground">{organizationName}</p>
          <p className="text-muted-foreground">{t('orgInfo.willBeDeleted')}</p>
        </div>

        <FormField
          label={t('fields.confirmName.label', { name: organizationName })}
          required
          error={confirmError}
        >
          <input
            id="confirm-name"
            required
            type="text"
            autoComplete="off"
            className={cn(
              'w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition',
              'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30',
            )}
            placeholder={organizationName}
            value={confirmName}
            onChange={(event) => setConfirmName(event.target.value)}
            disabled={isPending}
          />
        </FormField>

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
          <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
            {t('buttons.cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={isPending || !isConfirmValid}
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
