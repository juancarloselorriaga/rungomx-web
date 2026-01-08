'use client';

import { deleteOwnAccount } from '@/app/actions/account-delete';
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
import { cn } from '@/lib/utils';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

type AccountDeleteSectionProps = {
  userEmail: string;
};

export function AccountDeleteSection({ userEmail }: AccountDeleteSectionProps) {
  const t = useTranslations('components.settings.accountDeleteSection');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleOpenChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setError(null);
      setPassword('');
      setPasswordError(null);
    }
  };

  const handleDelete = () => {
    setError(null);
    setPasswordError(null);

    if (!password.trim()) {
      setPasswordError(t('dialog.fields.password.required'));
      return;
    }

    startTransition(async () => {
      try {
        const result = await deleteOwnAccount({ password });

        if (!result.ok) {
          if (result.error === 'UNAUTHENTICATED') {
            const message = t('dialog.errors.unauthenticated');
            setError(message);
            toast.error(message);
            return;
          }

          if (result.error === 'NO_PASSWORD') {
            const message = t('dialog.errors.noPassword');
            setError(message);
            toast.error(message);
            return;
          }

          if (result.error === 'INVALID_PASSWORD') {
            const message = t('dialog.errors.invalidPassword');
            setError(message);
            setPasswordError(message);
            toast.error(message);
            return;
          }

          const message = t('dialog.errors.genericError');
          setError(message);
          toast.error(message);
          return;
        }

        toast.success(t('dialog.success.toast'));
        handleOpenChange(false);
        // User is signed out - page will redirect automatically
      } catch {
        const message = t('dialog.errors.genericError');
        setError(message);
        toast.error(message);
      }
    });
  };

  return (
    <>
      <section className="space-y-5 rounded-lg border border-destructive/30 bg-card p-5 shadow-sm">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-destructive">
            {t('sectionLabel')}
          </p>
          <h2 className="text-lg font-semibold">{t('title')}</h2>
          <p className="text-sm text-muted-foreground">{t('description')}</p>
        </div>

        <div className="border-t border-border/70 pt-4">
          <Button variant="destructive" onClick={() => handleOpenChange(true)}>
            <Trash2 className="size-4" />
            {t('actions.delete')}
          </Button>
        </div>
      </section>

      <Dialog open={dialogOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('dialog.title')}</DialogTitle>
            <DialogDescription>{t('dialog.description')}</DialogDescription>
          </DialogHeader>

          <div className="flex gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-foreground">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
            <div className="space-y-1">
              <p className="font-semibold text-destructive">{t('dialog.warning.title')}</p>
              <p className="text-muted-foreground">{t('dialog.warning.description')}</p>
            </div>
          </div>

          <div className="space-y-1 rounded-md border border-border/60 bg-muted/30 p-3 text-sm">
            <p className="font-semibold text-foreground">{t('dialog.accountInfo.label')}</p>
            <p className="text-muted-foreground">{userEmail}</p>
          </div>

          <FormField label={t('dialog.fields.password.label')} required error={passwordError}>
            <input
              id="delete-account-password"
              required
              type="password"
              autoComplete="current-password"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
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
              {t('dialog.buttons.cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isPending}
              isLoading={isPending}
              loadingPlacement="replace"
              loadingLabel={t('dialog.buttons.deleting')}
              onClick={handleDelete}
              className="min-w-[140px]"
            >
              <Trash2 className="size-4" />
              {t('dialog.buttons.confirmDelete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
