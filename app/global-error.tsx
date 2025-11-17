'use client';

import { Home, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';
import './globals.css';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to console
    console.error('Global error boundary caught:', error);

    // TODO: Send error to error reporting service
    // Example: Sentry.captureException(error);
    // Example: LogRocket.captureException(error);
  }, [error]);

  return (
    <html lang="en">
    <body>
    <div
      className="w-full relative flex h-screen items-center justify-center overflow-hidden">
      {/* Background pattern overlay */}
      <div className="absolute inset-0 opacity-10">
        <svg className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern
              id="global-error-pattern"
              x="0"
              y="0"
              width="40"
              height="40"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="20" cy="20" r="1" fill="currentColor"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#global-error-pattern)"/>
        </svg>
      </div>

      {/* Content */}
      <div className="container relative z-10 mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-5xl">
          Application Error
        </h1>

        <p className="mb-8 text-lg text-foreground/80">
          A critical error has occurred. We&#39;re sorry for the inconvenience.
          Please try refreshing the page or return to the home page.
        </p>

        {/* Error details for development */}
        {process.env.NODE_ENV === 'development' && error.message && (
          <div className="mb-8 rounded-lg bg-background-surface p-4 text-left">
            <p className="font-mono text-sm text-foreground/90">
              <strong>Error:</strong> {error.message}
            </p>
            {error.digest && (
              <p className="mt-2 font-mono text-xs text-foreground/70">
                <strong>Digest:</strong> {error.digest}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
          <button
            onClick={reset}
          >
            <RefreshCw className="h-5 w-5"/>
            Try Again
          </button>

          <Link
            href="/"
          >
            <Home className="h-5 w-5"/>
            Go Home
          </Link>
        </div>
      </div>
    </div>
    </body>
    </html>
  )
    ;
}
