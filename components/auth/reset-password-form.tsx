'use client';

import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { resetPasswordWithToken } from '@/lib/auth/actions';
import { Form, FormError, useForm } from '@/lib/forms';
import { KeyRound, Loader2, Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';

export function ResetPasswordForm() {
  const t = useTranslations('pages.resetPassword');
  const tAuth = useTranslations('auth');
  const searchParams = useSearchParams();
  const [isPending, setIsPending] = useState(false);

  const token = searchParams.get('token');
  const errorParam = searchParams.get('error');

  // Initialize error state from URL parameter
  const [error, setError] = useState<string | null>(
    errorParam === 'INVALID_TOKEN' ? t('invalidToken') : null,
  );

  const form = useForm<{ password: string; confirmPassword: string }>({
    defaultValues: { password: '', confirmPassword: '' },
    onSubmit: async (values) => {
      setError(null);

      if (values.password !== values.confirmPassword) {
        return { ok: false, error: 'INVALID_INPUT', message: t('passwordMismatch') };
      }

      if (!token) {
        return { ok: false, error: 'INVALID_INPUT', message: t('missingToken') };
      }

      setIsPending(true);
      try {
        const { error: resetError } = await resetPasswordWithToken(values.password, token);

        if (resetError) {
          return {
            ok: false,
            error: 'SERVER_ERROR',
            message: resetError.message ?? t('genericError'),
          };
        }

        return { ok: true, data: null };
      } catch {
        return { ok: false, error: 'SERVER_ERROR', message: t('genericError') };
      } finally {
        setIsPending(false);
      }
    },
    onSuccess: () => {
      // Password reset successful - redirect to sign-in with success message
      // Using window.location for query param support since next-intl router doesn't support query objects
      window.location.href = `${window.location.origin}/sign-in?reset=success`;
    },
    onError: (message) => {
      setError(message);
    },
  });

  return (
    <Form form={form} className="space-y-4">
      <FormError />

      <FormField
        label={
          <span className="flex items-center gap-2 text-sm font-medium text-foreground/80">
            <Lock className="size-4 text-muted-foreground" />
            {t('newPassword')}
          </span>
        }
        required
        error={form.errors.password}
      >
        <input
          id="password"
          required
          type="password"
          autoComplete="new-password"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
          placeholder="••••••••"
          {...form.register('password')}
          disabled={isPending || form.isSubmitting}
          minLength={8}
          maxLength={128}
        />
      </FormField>

      <FormField
        label={
          <span className="flex items-center gap-2 text-sm font-medium text-foreground/80">
            <KeyRound className="size-4 text-muted-foreground" />
            {t('confirmPassword')}
          </span>
        }
        required
        error={form.errors.confirmPassword}
      >
        <input
          id="confirmPassword"
          required
          type="password"
          autoComplete="new-password"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
          placeholder="••••••••"
          {...form.register('confirmPassword')}
          disabled={isPending || form.isSubmitting}
          minLength={8}
          maxLength={128}
        />
      </FormField>

      <p className="text-xs text-muted-foreground">{tAuth('passwordRequirements')}</p>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button className="w-full" disabled={isPending || form.isSubmitting} type="submit">
        {isPending || form.isSubmitting ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <KeyRound className="size-4" />
        )}
        <span>{t('resetPassword')}</span>
      </Button>
    </Form>
  );
}
