'use client';

import { Button } from '@/components/ui/button';
import { resetPasswordWithToken } from '@/lib/auth/actions';
import { Loader2, Lock, KeyRound } from 'lucide-react';
import { FormEvent, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';

export function ResetPasswordForm() {
  const t = useTranslations('pages.resetPassword');
  const tAuth = useTranslations('auth');
  const searchParams = useSearchParams();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isPending, startTransition] = useTransition();

  const token = searchParams.get('token');
  const errorParam = searchParams.get('error');

  // Initialize error state from URL parameter
  const [error, setError] = useState<string | null>(
    errorParam === 'INVALID_TOKEN' ? t('invalidToken') : null
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError(t('passwordMismatch'));
      return;
    }

    if (!token) {
      setError(t('missingToken'));
      return;
    }

    startTransition(async () => {
      try {
        const { error: resetError } = await resetPasswordWithToken(
          password,
          token
        );

        if (resetError) {
          setError(resetError.message ?? t('genericError'));
          return;
        }

        // Password reset successful - redirect to sign-in with success message
        // Using window.location for query param support since next-intl router doesn't support query objects
        window.location.href = `${window.location.origin}/sign-in?reset=success`;
      } catch {
        setError(t('genericError'));
      }
    });
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium text-foreground/80"
               htmlFor="password">
          <Lock className="size-4 text-muted-foreground"/>
          {t('newPassword')}
        </label>
        <input
          id="password"
          name="password"
          required
          type="password"
          autoComplete="new-password"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
          placeholder="••••••••"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={isPending}
          minLength={8}
          maxLength={128}
        />
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium text-foreground/80"
               htmlFor="confirmPassword">
          <KeyRound className="size-4 text-muted-foreground"/>
          {t('confirmPassword')}
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          required
          type="password"
          autoComplete="new-password"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
          placeholder="••••••••"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          disabled={isPending}
          minLength={8}
          maxLength={128}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        {tAuth('passwordRequirements')}
      </p>

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : null}

      <Button className="w-full" disabled={isPending} type="submit">
        {isPending ? <Loader2 className="size-4 animate-spin"/> : <KeyRound className="size-4"/>}
        <span>{t('resetPassword')}</span>
      </Button>
    </form>
  );
}
