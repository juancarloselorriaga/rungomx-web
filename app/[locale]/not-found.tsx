import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { Home } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Components.ErrorBoundary.notFound');

  return {
    title: `${t('code')} - ${t('title')}`,
    description: t('description'),
  };
}

export default async function NotFound() {
  const t = await getTranslations('Components.ErrorBoundary.notFound');
  const tCommon = await getTranslations('Common');

  return (
    <div
      className="w-full relative flex h-screen items-center justify-center overflow-hidden">
      {/* Background pattern overlay */}
      <div className="absolute inset-0 opacity-10">
        <svg className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern
              id="not-found-pattern"
              x="0"
              y="0"
              width="40"
              height="40"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="20" cy="20" r="1" fill="currentColor"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#not-found-pattern)"/>
        </svg>
      </div>

      {/* Content */}
      <div className="container relative z-10 mx-auto max-w-2xl px-4 py-16 text-center">


        <div className="mb-4">
          <p className="text-6xl font-bold tracking-tight sm:text-7xl">{t('code')}</p>
        </div>

        <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
          {t('title')}
        </h1>

        <p className="mb-8 text-lg text-foreground/80">
          {t('description')}
        </p>

        <div className="mb-8 rounded-lg bg-white/10 p-6 backdrop-blur-sm">
          <p className="text-sm text-foreground/90">
            <strong>{t('helpfulLinks')}</strong>
          </p>
          <ul className="mt-3 space-y-2 text-sm text-foreground/80">
            <li>• {t('tips.0')}</li>
            <li>• {t('tips.1')}</li>
            <li>• {t('tips.2')}</li>
          </ul>
        </div>

        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Button
            asChild
            size="lg"
            variant="default"
          >
            <Link href="/">
              <Home className="mr-2 h-5 w-5"/>
              {tCommon('goHome')}
            </Link>
          </Button>

          <Button
            asChild
            size="lg"
            variant="outline"
          >
            <Link href="/about">
              {t('learnAboutUs')}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
