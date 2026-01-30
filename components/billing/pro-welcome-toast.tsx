'use client';

import { Crown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { toast } from 'sonner';

const STORAGE_KEY = 'pro-welcome-shown';

export function ProWelcomeToast({ isPro }: { isPro: boolean }) {
  const t = useTranslations('common.billing');

  useEffect(() => {
    if (!isPro) return;

    try {
      if (sessionStorage.getItem(STORAGE_KEY) === '1') return;
      sessionStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // If sessionStorage is unavailable, fall back to showing the toast.
    }

    toast.success(t('welcomeBackPro'), {
      icon: <Crown className="size-4 text-brand-gold" />,
      className: 'border-brand-gold/30 bg-brand-gold/10',
      duration: 5000,
    });
  }, [isPro, t]);

  return null;
}

