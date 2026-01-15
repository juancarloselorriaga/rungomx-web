'use client';

import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { useRouter } from '@/i18n/navigation';
import { requestPasswordReset } from '@/lib/auth/actions';
import { Form, FormError, useForm } from '@/lib/forms';
import { cn } from '@/lib/utils';
import { Loader2, Send } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';

export function ForgotPasswordForm() {
  const t = useTranslations('pages.forgotPassword');
  const locale = useLocale();
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  const form = useForm<{ email: string }>({
    defaultValues: { email: '' },
    onSubmit: async (values) => {
      const resetPasswordURL =
        locale === 'es'
          ? `${window.location.origin}/restablecer-contrasena`
          : `${window.location.origin}/en/reset-password`;

      setIsPending(true);
      try {
        const { error: resetError } = await requestPasswordReset(values.email, resetPasswordURL);

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
      router.push('/forgot-password/success');
    },
  });

  return (
    <Form form={form} className="space-y-4">
      <FormError />

      <FormField label={t('email')} required error={form.errors.email}>
        <input
          id="email"
          required
          type="email"
          autoComplete="email"
          className={cn(
            'w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition',
            'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30',
            form.errors.email && 'border-destructive focus-visible:border-destructive',
          )}
          placeholder="you@example.com"
          {...form.register('email')}
          disabled={isPending || form.isSubmitting}
        />
      </FormField>

      <Button className="w-full" disabled={isPending || form.isSubmitting} type="submit">
        {isPending || form.isSubmitting ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Send className="size-4" />
        )}
        <span>{t('sendResetLink')}</span>
      </Button>
    </Form>
  );
}
