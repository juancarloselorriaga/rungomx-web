'use client';

import { OnboardingOverridesProvider } from '@/components/auth/onboarding-context';
import RoleEnforcementBoundary from '@/components/auth/role-enforcement-boundary';
import ProfileEnforcementBoundary from '@/components/profile/profile-enforcement-boundary';
import { useLocaleSyncOnAuth } from '@/hooks/use-locale-sync-on-auth';

export default function ProtectedLayoutWrapper({ children }: { children: React.ReactNode }) {
  // Sync the user's DB locale preference with the browser
  useLocaleSyncOnAuth();

  return (
    <OnboardingOverridesProvider>
      <RoleEnforcementBoundary>
        <ProfileEnforcementBoundary>{children}</ProfileEnforcementBoundary>
      </RoleEnforcementBoundary>
    </OnboardingOverridesProvider>
  );
}
