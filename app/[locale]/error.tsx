'use client';

import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { Home, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('components.errorBoundary.error');
  const tCommon = useTranslations('common');

  useEffect(() => {
    // Log the error to console
    console.error('Error boundary caught:', error);

    // TODO: Send error to error reporting service
    // Example: Sentry.captureException(error);
    // Example: LogRocket.captureException(error);
  }, [error]);

  return (
    <div
      className="w-full relative flex h-screen items-center justify-center overflow-hidden">
      {/* Background pattern overlay */}
      <div className="absolute inset-0 opacity-10">
        <svg className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern
              id="error-pattern"
              x="0"
              y="0"
              width="40"
              height="40"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="20" cy="20" r="1" fill="currentColor"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#error-pattern)"/>
        </svg>
      </div>

      {/* Content */}
      <div className="container relative z-10 mx-auto max-w-2xl px-4 py-16 text-center">


        <h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-5xl">
          {t('title')}
        </h1>

        <p className="mb-8 text-lg text-foreground/80">
          {t('description')}
        </p>

        {/* Error details for development */}
        {process.env.NODE_ENV === 'development' && error.message && (
          <div className="mb-8 rounded-lg bg-background-surface p-4 text-left">
            <p className="font-mono text-sm text-foreground/90">
              <strong>{t('errorLabel')}</strong> {error.message}
            </p>
            {error.digest && (
              <p className="mt-2 font-mono text-xs text-foreground/70">
                <strong>{t('digestLabel')}</strong> {error.digest}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Button
            onClick={reset}
            size="lg"
            variant="default"
          >
            <RefreshCw className="mr-2 h-5 w-5"/>
            {tCommon('tryAgain')}
          </Button>

          <Button
            asChild
            size="lg"
            variant="outline"
            className="border-primary-foreground/20 bg-white/10 text-foreground hover:bg-white/20"
          >
            <Link href="/">
              <Home className="mr-2 h-5 w-5"/>
              {tCommon('goHome')}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
