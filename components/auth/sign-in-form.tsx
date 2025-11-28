'use client';

import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { useRouter } from '@/i18n/navigation';
import { signIn } from '@/lib/auth/client';
import { Loader2, Lock, LogIn, Mail } from 'lucide-react';
import { FormEvent, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';

export function SignInForm() {
  const t = useTranslations('auth');
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        const { error: signInError } = await signIn.email({
          email,
          password,
        });

        if (signInError) {
          setError(signInError.message ?? t('genericError'));
          return;
        }

        router.refresh();
        router.push('/dashboard');
      } catch {
        setError(t('genericError'));
      }
    });
  };

  const handleGoogleSignIn = () => {
    setError(null);
    startTransition(async () => {
      try {
        const { error: signInError } = await signIn.social({
          provider: 'google',
        });

        if (signInError) {
          setError(signInError.message ?? t('genericError'));
          return;
        }

        router.refresh();
        router.push('/dashboard');
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
        />
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium text-foreground/80" htmlFor="password">
          <Lock className="size-4 text-muted-foreground"/>
          {t('password')}
        </label>
        <input
          id="password"
          name="password"
          required
          type="password"
          autoComplete="current-password"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
          placeholder="••••••••"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>

      <div className="text-right">
        <Link
          href="/forgot-password"
          className="text-sm text-primary hover:underline"
        >
          {t('forgotPassword')}
        </Link>
      </div>

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : null}

      <Button className="w-full" disabled={isPending} type="submit">
        {isPending ? <Loader2 className="size-4 animate-spin"/> : <LogIn className="size-4"/>}
        <span>{t('signIn')}</span>
      </Button>

      <Button
        className="w-full"
        disabled={isPending}
        type="button"
        variant="outline"
        onClick={handleGoogleSignIn}
      >
        <span className="font-medium">G</span>
        <span>{t('continueWithGoogle')}</span>
      </Button>
    </form>
  );
}
