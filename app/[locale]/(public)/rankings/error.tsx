'use client';

import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

// Rankings load failures surface here instead of masquerading as an empty leaderboard
// (RES-20). A transient DB error shows a real error state with a retry, and is never cached.
export default function RankingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('pages.rankings.error');

  useEffect(() => {
    console.error('[rankings] failed to load leaderboard', error);
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-16 text-center">
      <h1 className="text-xl font-semibold text-foreground">{t('title')}</h1>
      <p className="mt-3 text-sm leading-7 text-muted-foreground">{t('description')}</p>
      <div className="mt-6">
        <Button type="button" onClick={reset}>
          {t('retry')}
        </Button>
      </div>
    </div>
  );
}
