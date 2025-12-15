'use client';

import { createAdminUser, createStaffUser } from '@/app/actions/admin-users';
import { adminUsersTextInputClassName } from '@/components/admin/users/styles';
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
import { Form, FormError, useForm } from '@/lib/forms';
import { cn } from '@/lib/utils';
import { Shield, ShieldCheck, UserPlus2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';

type FieldErrors = Partial<Record<'name' | 'email' | 'password', string[]>>;

type UserCreateDialogProps = {
  open?: boolean;
  onOpenChangeAction?: (open: boolean) => void;
  onSuccessAction?: () => void;
  initialRole?: 'internal.admin' | 'internal.staff';
};

function extractValidationMessages(details: unknown): string[] {
  const messages: string[] = [];

  const walk = (value: unknown) => {
    if (!value) return;
    if (typeof value === 'string') {
      messages.push(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (typeof value === 'object') {
      Object.values(value as Record<string, unknown>).forEach(walk);
    }
  };

  walk(details);
  return Array.from(new Set(messages));
}

function extractFieldErrors(details: unknown): FieldErrors {
  if (!details || typeof details !== 'object') return {};
  const output: FieldErrors = {};
  const targetKeys: Array<keyof FieldErrors> = ['name', 'email', 'password'];

  targetKeys.forEach((key) => {
    const value = (details as Record<string, unknown>)[key as string];
    if (!value) return;
    const collected: string[] = [];

    const walk = (node: unknown) => {
      if (!node) return;
      if (typeof node === 'string') {
        collected.push(node);
        return;
      }
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      if (typeof node === 'object') {
        Object.values(node as Record<string, unknown>).forEach(walk);
      }
    };

    walk(value);
    if (collected.length) {
      output[key] = Array.from(new Set(collected));
    }
  });

  return output;
}

type CreateUserFormValues = {
  name: string;
  email: string;
  password: string;
};

export function UserCreateDialog({
  open,
  onOpenChangeAction,
  onSuccessAction,
  initialRole = 'internal.admin',
}: UserCreateDialogProps) {
  const t = useTranslations('pages.adminUsers.createDialog');
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const resolvedOpen = open ?? internalOpen;

  const [role, setRole] = useState<'internal.admin' | 'internal.staff'>(initialRole);
  const [isPending] = useTransition();

  const form = useForm<CreateUserFormValues, { email: string; canonicalRoles: string[] }>({
    defaultValues: { name: '', email: '', password: '' },
    onSubmit: async (values) => {
      const action = role === 'internal.admin' ? createAdminUser : createStaffUser;
      const result = await action(values);

      if (!result.ok) {
        if (result.error === 'UNAUTHENTICATED') {
          return { ok: false, error: 'UNAUTHENTICATED', message: t('errors.unauthenticated') };
        }

        if (result.error === 'FORBIDDEN') {
          return { ok: false, error: 'FORBIDDEN', message: t('errors.forbidden') };
        }

        if (result.error === 'INVALID_INPUT') {
          const messages = extractValidationMessages(result.details);
          const byField = extractFieldErrors(result.details);
          return {
            ok: false,
            error: 'INVALID_INPUT',
            fieldErrors: byField,
            message: messages[0] ?? t('errors.invalidInput'),
          };
        }

        return { ok: false, error: 'SERVER_ERROR', message: t('errors.genericError') };
      }

      return { ok: true, data: result };
    },
    onSuccess: (result) => {
      toast.success(t('success.toast', { email: result.email }), {
        description: t('success.toastDescription', { roles: result.canonicalRoles.join(', ') }),
      });
      handleOpenChange(false);
      onSuccessAction?.();
      router.refresh();
    },
  });

  const handleOpenChange = (value: boolean) => {
    setInternalOpen(value);
    onOpenChangeAction?.(value);
    if (value) {
      setRole(initialRole);
    }
    if (!value) {
      form.reset();
    }
  };

  const roleSummary = useMemo(
    () => (role === 'internal.admin' ? t('roles.admin.summary') : t('roles.staff.summary')),
    [role, t],
  );

  return (
    <Dialog open={resolvedOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg" onOpenAutoFocus={(event) => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <Form form={form} className="space-y-4">
          <FormError />
          <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
            <Shield className="size-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-semibold">{t('bannerTitle')}</p>
              <p className="text-xs text-muted-foreground">{t('bannerDescription')}</p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant={role === 'internal.admin' ? 'default' : 'outline'}
              className="flex-1"
              onClick={() => setRole('internal.admin')}
            >
              <ShieldCheck className="size-4" />
              {t('roles.admin.label')}
            </Button>
            <Button
              type="button"
              variant={role === 'internal.staff' ? 'default' : 'outline'}
              className="flex-1"
              onClick={() => setRole('internal.staff')}
            >
              <Shield className="size-4" />
              {t('roles.staff.label')}
            </Button>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div
              className={cn(
                'rounded-md border px-3 py-2 text-xs',
                role === 'internal.admin'
                  ? 'border-primary/40 bg-primary/5'
                  : 'border-border/60 bg-muted/20',
              )}
            >
              <p className="font-semibold text-foreground">{t('roles.admin.title')}</p>
              <p className="text-muted-foreground">{t('roles.admin.description')}</p>
            </div>
            <div
              className={cn(
                'rounded-md border px-3 py-2 text-xs',
                role === 'internal.staff'
                  ? 'border-primary/40 bg-primary/5'
                  : 'border-border/60 bg-muted/20',
              )}
            >
              <p className="font-semibold text-foreground">{t('roles.staff.title')}</p>
              <p className="text-muted-foreground">{t('roles.staff.description')}</p>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">{roleSummary}</p>

          <FormField
            label={
              <span className="text-sm font-medium text-foreground/80">
                {t('fields.name.label')}
              </span>
            }
            required
            error={form.errors.name}
          >
            <input
              id="name"
              required
              type="text"
              autoComplete="name"
              className={adminUsersTextInputClassName}
              placeholder={t('fields.name.placeholder')}
              {...form.register('name')}
              disabled={isPending || form.isSubmitting}
            />
          </FormField>

          <FormField
            label={
              <span className="text-sm font-medium text-foreground/80">
                {t('fields.email.label')}
              </span>
            }
            required
            error={form.errors.email}
          >
            <input
              id="email"
              required
              type="email"
              autoComplete="email"
              className={adminUsersTextInputClassName}
              placeholder={t('fields.email.placeholder')}
              {...form.register('email')}
              disabled={isPending || form.isSubmitting}
            />
          </FormField>

          <FormField
            label={
              <span className="text-sm font-medium text-foreground/80">
                {t('fields.password.label')}
              </span>
            }
            required
            error={form.errors.password}
          >
            <input
              id="password"
              required
              type="password"
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              className={adminUsersTextInputClassName}
              placeholder={t('fields.password.placeholder')}
              {...form.register('password')}
              disabled={isPending || form.isSubmitting}
            />
            <p className="text-xs text-muted-foreground">{t('fields.password.hint')}</p>
          </FormField>

          {'errors' in form && form.error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {form.error}
            </div>
          ) : null}

          <DialogFooter className="flex justify-end gap-2 sm:justify-end">
            <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
              {t('buttons.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={isPending || form.isSubmitting}
              isLoading={isPending || form.isSubmitting}
              loadingPlacement="replace"
              loadingLabel={t('buttons.creating')}
              className="justify-center min-w-[120px]"
            >
              <UserPlus2 className="size-4" />
              <span>
                {role === 'internal.admin' ? t('buttons.createAdmin') : t('buttons.createStaff')}
              </span>
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
