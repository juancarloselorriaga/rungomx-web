'use client';

import { OnboardingOverridesProvider } from '@/components/auth/onboarding-context';
import { ProFeaturesProvider } from '@/components/pro-features/pro-features-provider';
import RoleEnforcementBoundary from '@/components/auth/role-enforcement-boundary';
import ProfileEnforcementBoundary from '@/components/profile/profile-enforcement-boundary';
import { useLocaleSyncOnAuth } from '@/hooks/use-locale-sync-on-auth';
import type { ProFeaturesSnapshot } from '@/app/actions/pro-features';

export default function ProtectedLayoutWrapper({
  children,
  initialProFeaturesSnapshot,
}: {
  children: React.ReactNode;
  initialProFeaturesSnapshot?: ProFeaturesSnapshot;
}) {
  // Sync the user's DB locale preference with the browser
  useLocaleSyncOnAuth();

  return (
    <OnboardingOverridesProvider>
      <ProFeaturesProvider initialSnapshot={initialProFeaturesSnapshot}>
        <RoleEnforcementBoundary>
          <ProfileEnforcementBoundary>{children}</ProfileEnforcementBoundary>
        </RoleEnforcementBoundary>
      </ProFeaturesProvider>
    </OnboardingOverridesProvider>
  );
}
