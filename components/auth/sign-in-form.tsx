'use client';

import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Link, useRouter } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { signIn } from '@/lib/auth/client';
import { Form, FormError, useForm } from '@/lib/forms';
import { Loader2, Lock, LogIn, Mail } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';

type SignInFormProps = {
  callbackPath?: string;
};

export function SignInForm({ callbackPath }: SignInFormProps) {
  const t = useTranslations('auth');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const isAppPathname = (value: string): value is keyof typeof routing.pathnames =>
    Object.prototype.hasOwnProperty.call(routing.pathnames, value);
  const targetPath: keyof typeof routing.pathnames =
    callbackPath && isAppPathname(callbackPath) ? callbackPath : '/dashboard';

  const form = useForm<
    { email: string; password: string },
    | { kind: 'signed-in' }
    | { kind: 'verify-email'; email: string; callbackPath: keyof typeof routing.pathnames }
  >({
    defaultValues: { email: '', password: '' },
    onSubmit: async (values) => {
      const { error: signInError } = await signIn.email({
        email: values.email,
        password: values.password,
        callbackURL: targetPath,
      });

      if (signInError) {
        const status = (signInError as { status?: number } | null)?.status;
        if (status === 403) {
          return {
            ok: true,
            data: { kind: 'verify-email', email: values.email, callbackPath: targetPath },
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

      router.push(targetPath);
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
          autoComplete="current-password"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
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
