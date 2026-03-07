'use client';

import { useSession } from '@/lib/auth/client';
import { ProfileStatus } from '@/lib/profiles/types';
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';

type OnboardingOverrides = {
  profileStatusOverride: ProfileStatus | null;
  setProfileStatusOverride: (status: ProfileStatus | null) => void;
  needsRoleAssignmentOverride: boolean | null;
  setNeedsRoleAssignmentOverride: (needsRoleAssignment: boolean | null) => void;
};

const OnboardingContext = createContext<OnboardingOverrides | null>(null);

function OnboardingOverridesProviderInner({
  children,
  resetKey,
}: {
  children: ReactNode;
  resetKey: string | null;
}) {
  const [overrideState, setOverrideState] = useState<{
    resetKey: string | null;
    profileStatusOverride: ProfileStatus | null;
    needsRoleAssignmentOverride: boolean | null;
  }>({
    resetKey,
    profileStatusOverride: null,
    needsRoleAssignmentOverride: null,
  });

  const effectiveState = useMemo(
    () =>
      overrideState.resetKey === resetKey
        ? overrideState
        : {
            resetKey,
            profileStatusOverride: null,
            needsRoleAssignmentOverride: null,
          },
    [overrideState, resetKey],
  );

  const setProfileStatusOverride = useCallback(
    (status: ProfileStatus | null) => {
      setOverrideState((current) => ({
        resetKey,
        profileStatusOverride: status,
        needsRoleAssignmentOverride:
          current.resetKey === resetKey ? current.needsRoleAssignmentOverride : null,
      }));
    },
    [resetKey],
  );

  const setNeedsRoleAssignmentOverride = useCallback(
    (needsRoleAssignment: boolean | null) => {
      setOverrideState((current) => ({
        resetKey,
        profileStatusOverride: current.resetKey === resetKey ? current.profileStatusOverride : null,
        needsRoleAssignmentOverride: needsRoleAssignment,
      }));
    },
    [resetKey],
  );

  const value = useMemo(
    () => ({
      profileStatusOverride: effectiveState.profileStatusOverride,
      setProfileStatusOverride,
      needsRoleAssignmentOverride: effectiveState.needsRoleAssignmentOverride,
      setNeedsRoleAssignmentOverride,
    }),
    [effectiveState, setNeedsRoleAssignmentOverride, setProfileStatusOverride],
  );

  return (
    <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>
  );
}

export function OnboardingOverridesProvider({ children }: { children: ReactNode }) {
  const { data } = useSession();
  const userId = data?.user?.id ?? null;

  return (
    <OnboardingOverridesProviderInner resetKey={userId}>
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
