'use client';

import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Form, FormError, useForm } from '@/lib/forms';
import { requestEmailVerification } from '@/lib/auth/actions';
import { Loader2, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

type VerifyEmailResendProps = {
  email?: string;
  callbackPath?: string;
};

export function VerifyEmailResend({ email, callbackPath }: VerifyEmailResendProps) {
  const t = useTranslations('pages.verifyEmail');
  const authT = useTranslations('auth');

  const form = useForm<{ email: string }, null>({
    defaultValues: { email: email ?? '' },
    onSubmit: async (values) => {
      const targetEmail = values.email.trim();
      if (!targetEmail) {
        return { ok: false, error: 'INVALID_INPUT', message: t('missingEmail') };
      }

      const { error: resendError } = await requestEmailVerification(targetEmail, callbackPath);
      if (resendError) {
        return { ok: false, error: 'SERVER_ERROR', message: resendError.message ?? t('genericError') };
      }

      return { ok: true, data: null };
    },
    onSuccess: () => {
      toast.success(t('resendSuccess'));
    },
  });

  return (
    <Form form={form} className="space-y-4">
      <FormError />

      {!email && (
        <FormField label={authT('email')} required error={form.errors.email}>
          <input
            id="email"
            required
            type="email"
            autoComplete="email"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
            placeholder="you@example.com"
            {...form.register('email')}
            disabled={form.isSubmitting}
          />
        </FormField>
      )}

      <Button className="w-full" disabled={form.isSubmitting} type="submit">
        {form.isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
        <span>{t('resendButton')}</span>
      </Button>
    </Form>
  );
}
