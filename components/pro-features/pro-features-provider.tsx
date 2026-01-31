'use client';

import { getProFeaturesSnapshotAction } from '@/app/actions/pro-features';
import type { ProFeaturesSnapshot } from '@/app/actions/pro-features';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

type ProFeaturesContextValue = {
  snapshot: ProFeaturesSnapshot | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const ProFeaturesContext = createContext<ProFeaturesContextValue | null>(null);

export function ProFeaturesProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<ProFeaturesSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSnapshot = useCallback(async () => {
    setLoading(true);
    setError(null);

    const result = await getProFeaturesSnapshotAction();

    if (!result.ok) {
      setError(result.error);
      setSnapshot(null);
      setLoading(false);
      return;
    }

    setSnapshot(result.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial snapshot load updates local UI state.
    void loadSnapshot();
  }, [loadSnapshot]);

  return (
    <ProFeaturesContext.Provider
      value={{
        snapshot,
        loading,
        error,
        refresh: loadSnapshot,
      }}
    >
      {children}
    </ProFeaturesContext.Provider>
  );
}

export function useProFeaturesContext() {
  const ctx = useContext(ProFeaturesContext);
  if (!ctx) {
    throw new Error('useProFeaturesContext must be used within ProFeaturesProvider');
  }
  return ctx;
}
