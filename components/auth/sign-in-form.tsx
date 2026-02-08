'use client';

import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Link, useRouter } from '@/i18n/navigation';
import { signIn } from '@/lib/auth/client';
import { Form, FormError, useForm } from '@/lib/forms';
import { isSafeRedirectPath } from '@/lib/utils/redirect';
import { Loader2, LogIn } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';

type SignInFormProps = {
  callbackPath?: string;
};

type Router = ReturnType<typeof useRouter>;
type RouterPushHref = Parameters<Router['push']>[0];

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function SignInForm({ callbackPath }: SignInFormProps) {
  const t = useTranslations('auth');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const targetPath =
    callbackPath && isSafeRedirectPath(callbackPath) ? callbackPath : '/dashboard';

  const form = useForm<
    { email: string; password: string },
    | { kind: 'signed-in' }
    | { kind: 'verify-email'; email: string; callbackPath: string }
  >({
    defaultValues: { email: '', password: '' },
    onSubmit: async (values) => {
      const normalizedEmail = normalizeEmail(values.email);
      if (!normalizedEmail || !values.password) {
        return {
          ok: false,
          error: 'INVALID_INPUT',
          message: t('missingFields'),
          fieldErrors: {
            email: normalizedEmail ? undefined : [t('email')],
            password: values.password ? undefined : [t('password')],
          },
        };
      }

      const { error: signInError } = await signIn.email({
        email: normalizedEmail,
        password: values.password,
        callbackURL: targetPath,
      });

      if (signInError) {
        const status = (signInError as { status?: number } | null)?.status;
        if (status === 403) {
          return {
            ok: true,
            data: { kind: 'verify-email', email: normalizedEmail, callbackPath: targetPath },
          };
        }

        return {
          ok: false,
          error: 'SERVER_ERROR',
          message: signInError.message ?? t('genericError'),
        };
      }

      return { ok: true, data: { kind: 'signed-in' } };
    },
    onSuccess: (result) => {
      router.refresh();
      if (result?.kind === 'verify-email') {
        router.push({
          pathname: '/verify-email',
          query: {
            email: result.email,
            callbackURL: result.callbackPath,
          },
        });
        return;
      }

      router.push(targetPath as unknown as RouterPushHref);
    },
  });

  const handleGoogleSignIn = () => {
    form.reset();
    startTransition(async () => {
      try {
        const { error: signInError } = await signIn.social({
          provider: 'google',
          callbackURL: targetPath,
        });

        if (signInError) {
          form.setError('password', signInError.message ?? t('genericError'));
          return;
        }

        router.refresh();
        router.push(targetPath as unknown as RouterPushHref);
      } catch {
        form.setError('password', t('genericError'));
      }
    });
  };

  return (
    <Form
      form={form}
      className="space-y-4"
      onSubmit={(event) => {
        const formData = new FormData(event.currentTarget);
        form.handleSubmit(event, {
          email: String(formData.get('email') ?? ''),
          password: String(formData.get('password') ?? ''),
        });
      }}
    >
      <FormError />

      <FormField label={t('email')} required error={form.errors.email}>
        <Input
          id="email"
          required
          type="email"
          autoComplete="email"
          aria-invalid={form.errors.email ? true : undefined}
          placeholder="you@example.com"
          {...form.register('email')}
          disabled={form.isSubmitting}
        />
      </FormField>

      <FormField label={t('password')} required error={form.errors.password}>
        <Input
          id="password"
          required
          type="password"
          autoComplete="current-password"
          aria-invalid={form.errors.password ? true : undefined}
          placeholder="••••••••"
          {...form.register('password')}
          disabled={form.isSubmitting}
        />
      </FormField>

      <div className="text-right">
        <Link href="/forgot-password" className="text-sm text-primary hover:underline">
          {t('forgotPassword')}
        </Link>
      </div>

      <Button className="w-full" disabled={form.isSubmitting || isPending} type="submit">
        {form.isSubmitting ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <LogIn className="size-4" />
        )}
        <span>{t('signIn')}</span>
      </Button>

      <Button
        className="w-full"
        disabled={form.isSubmitting || isPending}
        type="button"
        variant="outline"
        onClick={handleGoogleSignIn}
      >
        <span className="font-medium">G</span>
        <span>{t('continueWithGoogle')}</span>
      </Button>
    </Form>
  );
}
