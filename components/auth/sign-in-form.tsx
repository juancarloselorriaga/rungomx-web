'use client';

import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Link, useRouter } from '@/i18n/navigation';
import { StaticPathname } from '@/i18n/routing';
import { signIn } from '@/lib/auth/client';
import { Form, FormError, useForm } from '@/lib/forms';
import { cn } from '@/lib/utils';
import { Loader2, LogIn } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';

type SignInFormProps = {
  callbackPath?: string;
};

export function SignInForm({ callbackPath }: SignInFormProps) {
  const t = useTranslations('auth');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Static pathnames are routes without dynamic segments (e.g., no [eventId])
  // We only allow redirecting to static routes after auth
  // SECURITY: Reject protocol-relative URLs like //evil.com
  const isStaticPathname = (value: string): value is StaticPathname =>
    !value.includes('[') && (value === '/' || (value.startsWith('/') && !value.startsWith('//')));
  const targetPath: StaticPathname =
    callbackPath && isStaticPathname(callbackPath) ? callbackPath : '/dashboard';

  const form = useForm<
    { email: string; password: string },
    | { kind: 'signed-in' }
    | { kind: 'verify-email'; email: string; callbackPath: StaticPathname }
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
          disabled={form.isSubmitting}
        />
      </FormField>

      <FormField label={t('password')} required error={form.errors.password}>
        <input
          id="password"
          required
          type="password"
          autoComplete="current-password"
          className={cn(
            'w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition',
            'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30',
            form.errors.password && 'border-destructive focus-visible:border-destructive',
          )}
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
