'use client';

import { Badge } from '@/components/common/badge';
import { Button } from '@/components/ui/button';
import { Link, useRouter } from '@/i18n/navigation';
import { ArrowLeft, Calendar, HelpCircle, Home, Info } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

export default function NotFound() {
  const router = useRouter();
  const t = useTranslations('components.errorBoundary.notFound');
  const tCommon = useTranslations('common');
  const tNav = useTranslations('navigation');
  const [hasHistory, setHasHistory] = useState(false);

  useEffect(() => {
    // Check if browser has history for back button
    setHasHistory(typeof window !== 'undefined' && window.history.length > 1);
  }, []);

  return (
    <div className="w-full relative flex h-screen items-center justify-center overflow-hidden">
      {/* Background pattern overlay */}
      <div className="absolute inset-0 opacity-10">
        <svg className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern
              id="notfound-pattern"
              x="0"
              y="0"
              width="40"
              height="40"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="20" cy="20" r="1" fill="currentColor" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#notfound-pattern)" />
        </svg>
      </div>

      {/* Content */}
      <div className="container relative z-10 mx-auto max-w-2xl px-4 py-16 text-center">
        {/* 404 Badge */}
        <Badge variant="indigo" className="mb-6">
          {t('code')}
        </Badge>

        {/* Title */}
        <h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-5xl">{t('title')}</h1>

        {/* Description */}
        <p className="mb-8 text-lg text-foreground/80">{t('description')}</p>

        {/* Primary Action Buttons */}
        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row mb-12">
          {hasHistory && (
            <Button onClick={() => router.back()} size="lg" variant="default">
              <ArrowLeft className="mr-2 h-5 w-5" />
              {tCommon('goBack')}
            </Button>
          )}

          <Button
            asChild
            size="lg"
            variant={hasHistory ? 'outline' : 'default'}
            className={
              hasHistory
                ? 'border-primary-foreground/20 bg-white/10 text-foreground hover:bg-white/20'
                : ''
            }
          >
            <Link href="/">
              <Home className="mr-2 h-5 w-5" />
              {tCommon('goHome')}
            </Link>
          </Button>
        </div>

        {/* Helpful Links Section */}
        <div className="mb-12">
          <h2 className="mb-6 text-xl font-semibold">{t('helpfulLinks')}</h2>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="default" variant="ghost">
              <Link href="/events">
                <Calendar className="mr-2 h-4 w-4" />
                {tNav('events')}
              </Link>
            </Button>

            <Button asChild size="default" variant="ghost">
              <Link href="/about">
                <Info className="mr-2 h-4 w-4" />
                {t('learnAboutUs')}
              </Link>
            </Button>

            <Button asChild size="default" variant="ghost">
              <Link href="/help">
                <HelpCircle className="mr-2 h-4 w-4" />
                {tNav('help')}
              </Link>
            </Button>
          </div>
        </div>

        {/* Helpful Tips */}
        <div className="mx-auto max-w-md rounded-lg bg-background-surface/50 p-6 text-left">
          <ul className="space-y-3">
            {[0, 1, 2].map((index) => (
              <li key={index} className="flex items-start gap-3">
                <span className="mt-1 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs text-primary">
                  {index + 1}
                </span>
                <span className="text-sm text-foreground/80">{t(`tips.${index}`)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
