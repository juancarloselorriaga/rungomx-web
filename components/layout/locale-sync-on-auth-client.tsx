'use client';

import { useLocaleSyncOnAuth } from '@/hooks/use-locale-sync-on-auth';

export default function LocaleSyncOnAuthClient() {
  useLocaleSyncOnAuth();
  return null;
}
