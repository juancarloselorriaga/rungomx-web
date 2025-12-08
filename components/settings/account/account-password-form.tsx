'use client';

import { useState } from 'react';
import { changePasswordAction } from '@/app/actions/account';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Spinner } from '@/components/ui/spinner';
import { Form, FormError, useForm } from '@/lib/forms';
import { cn } from '@/lib/utils';
import { Eye, EyeOff } from 'lucide-react';
import { useTranslations } from 'next-intl';

type AccountPasswordFormProps = {
  variant?: 'default' | 'admin';
};

type PasswordFormValues = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

export function AccountPasswordForm({ variant = 'default' }: AccountPasswordFormProps) {
  const t = useTranslations('components.settings.accountPasswordForm');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState({
    current: false,
    new: false,
    confirm: false,
  });

  const toggleVisibility = (field: keyof typeof showPassword) => {
    setShowPassword((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  const form = useForm<PasswordFormValues, null>({
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
    onSubmit: async (values) => {
      setSuccessMessage(null);

      if (values.newPassword !== values.confirmPassword) {
        return {
          ok: false,
          error: 'INVALID_INPUT',
          fieldErrors: { confirmPassword: [t('errors.passwordsDontMatch')] },
          message: t('errors.passwordsDontMatch'),
        };
      }

      const result = await changePasswordAction({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
        revokeOtherSessions: true,
      });

      if (!result.ok) {
        const fieldErrors =
          result.error === 'INVALID_INPUT' && 'fieldErrors' in result
            ? result.fieldErrors ?? {}
            : {};
        const mapped: Record<string, string[]> = {};

        if (fieldErrors.currentPassword?.some((msg: string) => msg.toUpperCase().includes('INVALID_PASSWORD'))) {
          mapped.currentPassword = [t('errors.invalidCurrentPassword')];
        }

        if (fieldErrors.newPassword?.some((msg: string) => msg.toUpperCase().includes('PASSWORD_TOO_SHORT'))) {
          mapped.newPassword = [t('errors.requirements')];
        }

        if (fieldErrors.newPassword?.some((msg: string) => msg.toUpperCase().includes('PASSWORD_TOO_LONG'))) {
          mapped.newPassword = [t('errors.requirements')];
        }

        if (fieldErrors.newPassword?.some((msg: string) => msg.toUpperCase().includes('PWNED'))) {
          mapped.newPassword = [t('errors.pwned')];
        }

        if (fieldErrors.currentPassword?.length && !mapped.currentPassword) {
          mapped.currentPassword = [t('errors.invalidCurrentPassword')];
        }

        if (fieldErrors.newPassword?.length && !mapped.newPassword) {
          mapped.newPassword = [t('errors.requirements')];
        }

        const message =
          result.error === 'INVALID_INPUT'
            ? t('errors.invalidInput')
            : t('errors.changePassword');

        return {
          ok: false,
          error: result.error,
          fieldErrors: Object.keys(mapped).length ? mapped : fieldErrors,
          message,
        };
      }

      return { ok: true, data: null };
    },
    onSuccess: () => {
      form.setFieldValue('currentPassword', '');
      form.setFieldValue('newPassword', '');
      form.setFieldValue('confirmPassword', '');
      form.clearError('currentPassword');
      form.clearError('newPassword');
      form.clearError('confirmPassword');
      setSuccessMessage(t('success'));
    },
  });

  const isSubmitting = form.isSubmitting;

  return (
    <section className="space-y-5 rounded-lg border bg-card p-5 shadow-sm">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('sectionLabel')}
        </p>
        <h2 className="text-lg font-semibold">{t(`title.${variant}`)}</h2>
        <p className="text-sm text-muted-foreground">
          {t(`description.${variant}`)}
        </p>
      </div>

      <Form form={form} className="space-y-5 border-t border-border/70 pt-5">
        <FormError />
        {successMessage ? (
          <div className="rounded-md border border-green-400/40 bg-green-500/5 px-3 py-2 text-sm text-green-900 shadow-sm dark:border-green-400/50 dark:bg-green-500/10 dark:text-green-50">
            {successMessage}
          </div>
        ) : null}

        <div className="space-y-4">
          <FormField
            label={t('fields.currentPassword')}
            required
            error={form.errors.currentPassword}
          >
            <div className="relative">
              <input
                className={cn(
                  'h-11 w-full rounded-lg border bg-background px-3 pr-11 text-sm shadow-sm outline-none ring-0 transition',
                  'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30',
                  form.errors.currentPassword && 'border-destructive focus-visible:border-destructive'
                )}
                {...form.register('currentPassword')}
                type={showPassword.current ? 'text' : 'password'}
                autoComplete="current-password"
                disabled={isSubmitting}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => toggleVisibility('current')}
                aria-label={showPassword.current ? t('actions.hidePassword') : t('actions.showPassword')}
                disabled={isSubmitting}
              >
                {showPassword.current ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </FormField>

          <FormField
            label={t('fields.newPassword')}
            required
            error={form.errors.newPassword}
          >
            <div className="relative">
              <input
                className={cn(
                  'h-11 w-full rounded-lg border bg-background px-3 pr-11 text-sm shadow-sm outline-none ring-0 transition',
                  'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30',
                  form.errors.newPassword && 'border-destructive focus-visible:border-destructive'
                )}
                {...form.register('newPassword')}
                type={showPassword.new ? 'text' : 'password'}
                autoComplete="new-password"
                disabled={isSubmitting}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => toggleVisibility('new')}
                aria-label={showPassword.new ? t('actions.hidePassword') : t('actions.showPassword')}
                disabled={isSubmitting}
              >
                {showPassword.new ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('hints.password')}
            </p>
          </FormField>

          <FormField
            label={t('fields.confirmPassword')}
            required
            error={form.errors.confirmPassword}
          >
            <div className="relative">
              <input
                className={cn(
                  'h-11 w-full rounded-lg border bg-background px-3 pr-11 text-sm shadow-sm outline-none ring-0 transition',
                  'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30',
                  form.errors.confirmPassword && 'border-destructive focus-visible:border-destructive'
                )}
                {...form.register('confirmPassword')}
                type={showPassword.confirm ? 'text' : 'password'}
                autoComplete="new-password"
                disabled={isSubmitting}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => toggleVisibility('confirm')}
                aria-label={showPassword.confirm ? t('actions.hidePassword') : t('actions.showPassword')}
                disabled={isSubmitting}
              >
                {showPassword.confirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </FormField>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-border/70 pt-4">
          <Button type="reset" variant="outline" onClick={form.reset} disabled={isSubmitting}>
            {t('actions.cancel')}
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Spinner className="mr-2 h-4 w-4" /> : null}
            {t('actions.save')}
          </Button>
        </div>
      </Form>
    </section>
  );
}
