'use client';

import { OnboardingOverridesProvider } from '@/components/auth/onboarding-context';
import RoleEnforcementBoundary from '@/components/auth/role-enforcement-boundary';
import ProfileEnforcementBoundary from '@/components/profile/profile-enforcement-boundary';

export default function ProtectedLayoutWrapper({ children }: { children: React.ReactNode }) {
  return (
    <OnboardingOverridesProvider>
      <RoleEnforcementBoundary>
        <ProfileEnforcementBoundary>{children}</ProfileEnforcementBoundary>
      </RoleEnforcementBoundary>
    </OnboardingOverridesProvider>
  );
}
