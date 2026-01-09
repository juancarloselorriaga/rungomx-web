'use client';

import { useLocaleSyncOnAuth } from '@/hooks/use-locale-sync-on-auth';
import type { ReactNode } from 'react';

/**
 * Client wrapper component that syncs user's DB locale preference with the browser.
 * This is a thin wrapper that allows server components to include locale sync without
 * needing to become client components themselves.
 */
export function LocaleSyncWrapper({ children }: { children: ReactNode }) {
  useLocaleSyncOnAuth();
  return <>{children}</>;
}
