'use client';

import { OnboardingOverridesProvider } from '@/components/auth/onboarding-context';
import { ProFeaturesProvider } from '@/components/pro-features/pro-features-provider';
import RoleEnforcementBoundary from '@/components/auth/role-enforcement-boundary';
import ProfileEnforcementBoundary from '@/components/profile/profile-enforcement-boundary';
import type { ProFeaturesSnapshot } from '@/app/actions/pro-features';
import { useLocaleSyncOnAuth } from '@/hooks/use-locale-sync-on-auth';

export default function ProtectedLayoutWrapper({
  children,
  initialProFeaturesSnapshot,
  initialPreferredLocale,
}: {
  children: React.ReactNode;
  initialProFeaturesSnapshot?: ProFeaturesSnapshot;
  initialPreferredLocale?: string | null;
}) {
  const { isLocaleRedirectPending } = useLocaleSyncOnAuth(initialPreferredLocale);

  if (isLocaleRedirectPending) {
    return <div aria-hidden="true" className="min-h-screen bg-background" data-testid="protected-layout-locale-redirect" />;
  }

  return (
    <OnboardingOverridesProvider>
      <div className="contents" data-testid="protected-layout-subtree">
        <ProFeaturesProvider initialSnapshot={initialProFeaturesSnapshot}>
          <RoleEnforcementBoundary>
            <ProfileEnforcementBoundary>{children}</ProfileEnforcementBoundary>
          </RoleEnforcementBoundary>
        </ProFeaturesProvider>
      </div>
    </OnboardingOverridesProvider>
  );
}
