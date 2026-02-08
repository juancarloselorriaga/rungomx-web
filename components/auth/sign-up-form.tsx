'use client';

import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { useRouter } from '@/i18n/navigation';
import { signIn, signUp } from '@/lib/auth/client';
import { Form, FormError, useForm } from '@/lib/forms';
import { isSafeRedirectPath } from '@/lib/utils/redirect';
import { Loader2, UserRoundPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';

type SignUpFormProps = {
  callbackPath?: string;
};

type Router = ReturnType<typeof useRouter>;
type RouterPushHref = Parameters<Router['push']>[0];

export function SignUpForm({ callbackPath }: SignUpFormProps) {
  const t = useTranslations('auth');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const targetPath =
    callbackPath && isSafeRedirectPath(callbackPath) ? callbackPath : '/dashboard';

  const form = useForm<
    { name: string; email: string; password: string },
    { email: string; callbackPath: string }
  >({
    defaultValues: { name: '', email: '', password: '' },
    onSubmit: async (values) => {
      if (!values.name || !values.email || !values.password) {
        return {
          ok: false,
          error: 'INVALID_INPUT',
          message: t('missingFields'),
          fieldErrors: {
            name: values.name ? undefined : [t('name')],
            email: values.email ? undefined : [t('email')],
            password: values.password ? undefined : [t('password')],
          },
        };
      }

      const { error: signUpError } = await signUp.email({
        name: values.name,
        email: values.email,
        password: values.password,
        callbackURL: targetPath,
      });

      if (signUpError) {
        const status = (signUpError as { status?: number } | null)?.status;
        const message = (signUpError as { message?: string } | null)?.message?.toLowerCase() ?? '';
        const isExistingAccount =
          status === 409 ||
          message.includes('already exists') ||
          message.includes('already registered');
        if (isExistingAccount) {
          return { ok: true, data: { email: values.email, callbackPath: targetPath } };
        }

        return {
          ok: false,
          error: 'SERVER_ERROR',
          message: signUpError.message ?? t('genericError'),
        };
      }

      return { ok: true, data: { email: values.email, callbackPath: targetPath } };
    },
    onSuccess: ({ email, callbackPath }) => {
      router.refresh();
      router.push({
        pathname: '/verify-email',
        query: {
          email,
          callbackURL: callbackPath,
        },
      });
    },
  });

  const handleGoogleSignUp = () => {
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
    <Form form={form} className="space-y-4">
      <FormError />

      <FormField label={t('name')} required error={form.errors.name}>
        <Input
          id="name"
          required
          type="text"
          autoComplete="name"
          aria-invalid={form.errors.name ? true : undefined}
          placeholder={t('namePlaceholder')}
          {...form.register('name')}
          disabled={form.isSubmitting}
        />
      </FormField>

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
          autoComplete="new-password"
          minLength={8}
          maxLength={128}
          aria-invalid={form.errors.password ? true : undefined}
          placeholder="••••••••"
          {...form.register('password')}
          disabled={form.isSubmitting}
        />
        <p className="text-xs text-muted-foreground">{t('passwordRequirements')}</p>
      </FormField>

      <Button className="w-full" disabled={form.isSubmitting || isPending} type="submit">
        {form.isSubmitting ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <UserRoundPlus className="size-4" />
        )}
        <span>{t('createAccount')}</span>
      </Button>

      <Button
        className="w-full"
        disabled={form.isSubmitting || isPending}
        type="button"
        variant="outline"
        onClick={handleGoogleSignUp}
      >
        <span className="font-medium">G</span>
        <span>{t('continueWithGoogle')}</span>
      </Button>
    </Form>
  );
}
