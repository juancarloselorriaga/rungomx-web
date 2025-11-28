'use client';

import { Button } from '@/components/ui/button';
import { useRouter } from '@/i18n/navigation';
import { requestPasswordReset } from '@/lib/auth/actions';
import { Loader2, Mail, Send } from 'lucide-react';
import { FormEvent, useState, useTransition } from 'react';
import { useTranslations, useLocale } from 'next-intl';

export function ForgotPasswordForm() {
  const t = useTranslations('pages.forgotPassword');
  const locale = useLocale();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        const resetPasswordURL = locale === 'es'
          ? `${window.location.origin}/restablecer-contrasena`
          : `${window.location.origin}/en/reset-password`;

        const { error: resetError } = await requestPasswordReset(
          email,
          resetPasswordURL
        );

        if (resetError) {
          setError(resetError.message ?? t('genericError'));
          return;
        }

        // Redirect to success page
        router.push('/forgot-password/success');
      } catch {
        setError(t('genericError'));
      }
    });
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium text-foreground/80" htmlFor="email">
          <Mail className="size-4 text-muted-foreground"/>
          {t('email')}
        </label>
        <input
          id="email"
          name="email"
          required
          type="email"
          autoComplete="email"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={isPending}
        />
      </div>

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : null}

      <Button className="w-full" disabled={isPending} type="submit">
        {isPending ? <Loader2 className="size-4 animate-spin"/> : <Send className="size-4"/>}
        <span>{t('sendResetLink')}</span>
      </Button>
    </form>
  );
}
