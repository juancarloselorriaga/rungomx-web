'use client';

import { Button } from '@/components/ui/button';
import { Form, FormError, useForm } from '@/lib/forms';
import { FormField } from '@/components/ui/form-field';
import { useRouter } from '@/i18n/navigation';
import { signIn, signUp } from '@/lib/auth/client';
import { routing } from '@/i18n/routing';
import { Loader2, Lock, Mail, UserRoundPlus } from 'lucide-react';
import { useTransition } from 'react';
import { useTranslations } from 'next-intl';

type SignUpFormProps = {
  callbackPath?: string;
};

export function SignUpForm({ callbackPath }: SignUpFormProps) {
  const t = useTranslations('auth');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const isAppPathname = (value: string): value is keyof typeof routing.pathnames =>
    Object.prototype.hasOwnProperty.call(routing.pathnames, value);
  const targetPath: keyof typeof routing.pathnames =
    callbackPath && isAppPathname(callbackPath) ? callbackPath : '/dashboard';

  const form = useForm<{ name: string; email: string; password: string }, { email: string; callbackPath: string }>({
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
        return { ok: false, error: 'SERVER_ERROR', message: signUpError.message ?? t('genericError') };
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
        router.push(targetPath);
      } catch {
        form.setError('password', t('genericError'));
      }
    });
  };

  return (
    <Form form={form} className="space-y-4">
      <FormError />

      <FormField
        label={
          <span className="flex items-center gap-2 text-sm font-medium text-foreground/80">
            <UserRoundPlus className="size-4 text-muted-foreground" />
            {t('name')}
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
          className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
          placeholder={t('namePlaceholder')}
          {...form.register('name')}
          disabled={form.isSubmitting}
        />
      </FormField>

      <FormField
        label={
          <span className="flex items-center gap-2 text-sm font-medium text-foreground/80">
            <Mail className="size-4 text-muted-foreground" />
            {t('email')}
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
          className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
          placeholder="you@example.com"
          {...form.register('email')}
          disabled={form.isSubmitting}
        />
      </FormField>

      <FormField
        label={
          <span className="flex items-center gap-2 text-sm font-medium text-foreground/80">
            <Lock className="size-4 text-muted-foreground" />
            {t('password')}
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
          minLength={8}
          maxLength={128}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
          placeholder="••••••••"
          {...form.register('password')}
          disabled={form.isSubmitting}
        />
        <p className="text-xs text-muted-foreground">
          {t('passwordRequirements')}
        </p>
      </FormField>

      <Button className="w-full" disabled={form.isSubmitting || isPending} type="submit">
        {form.isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <UserRoundPlus className="size-4" />}
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
