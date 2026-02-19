'use client';

import dynamic from 'next/dynamic';

import { OnboardingOverridesProvider } from '@/components/auth/onboarding-context';
import { ProFeaturesProvider } from '@/components/pro-features/pro-features-provider';
import RoleEnforcementBoundary from '@/components/auth/role-enforcement-boundary';
import ProfileEnforcementBoundary from '@/components/profile/profile-enforcement-boundary';
import type { ProFeaturesSnapshot } from '@/app/actions/pro-features';

const LocaleSyncOnAuthClient = dynamic(() => import('@/components/layout/locale-sync-on-auth-client'), {
  ssr: false,
});

export default function ProtectedLayoutWrapper({
  children,
  initialProFeaturesSnapshot,
}: {
  children: React.ReactNode;
  initialProFeaturesSnapshot?: ProFeaturesSnapshot;
}) {
  return (
    <OnboardingOverridesProvider>
      <LocaleSyncOnAuthClient />
      <ProFeaturesProvider initialSnapshot={initialProFeaturesSnapshot}>
        <RoleEnforcementBoundary>
          <ProfileEnforcementBoundary>{children}</ProfileEnforcementBoundary>
        </RoleEnforcementBoundary>
      </ProFeaturesProvider>
    </OnboardingOverridesProvider>
  );
}
