'use client';

import { useSession } from '@/lib/auth/client';
import { ProfileStatus } from '@/lib/profiles/types';
import { createContext, type ReactNode, useContext, useState } from 'react';

type OnboardingOverrides = {
  profileStatusOverride: ProfileStatus | null;
  setProfileStatusOverride: (status: ProfileStatus | null) => void;
  needsRoleAssignmentOverride: boolean | null;
  setNeedsRoleAssignmentOverride: (needsRoleAssignment: boolean | null) => void;
};

const OnboardingContext = createContext<OnboardingOverrides | null>(null);

function OnboardingOverridesProviderInner({ children }: { children: ReactNode }) {
  const [profileStatusOverride, setProfileStatusOverride] = useState<ProfileStatus | null>(null);
  const [needsRoleAssignmentOverride, setNeedsRoleAssignmentOverride] = useState<boolean | null>(
    null,
  );

  return (
    <OnboardingContext.Provider
      value={{
        profileStatusOverride,
        setProfileStatusOverride,
        needsRoleAssignmentOverride,
        setNeedsRoleAssignmentOverride,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
}

export function OnboardingOverridesProvider({ children }: { children: ReactNode }) {
  const { data } = useSession();
  const userId = data?.user?.id ?? null;

  return (
    <OnboardingOverridesProviderInner key={userId ?? 'anonymous'}>
      {children}
    </OnboardingOverridesProviderInner>
  );
}

export function useOnboardingOverrides() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    throw new Error('useOnboardingOverrides must be used within OnboardingOverridesProvider');
  }
  return ctx;
}
