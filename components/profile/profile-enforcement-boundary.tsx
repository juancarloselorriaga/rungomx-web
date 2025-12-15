'use client';

import { useOnboardingOverrides } from '@/components/auth/onboarding-context';
import { ProfileCompletionForm } from '@/components/profile/profile-completion-form';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { usePathname } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { useSession } from '@/lib/auth/client';
import { EMPTY_PROFILE_STATUS } from '@/lib/auth/constants';
import { buildProfileMetadata, ProfileMetadata } from '@/lib/profiles/metadata';
import { buildProfileRequirementSummary } from '@/lib/profiles/requirements';
import type { ProfileRecord, ProfileStatus } from '@/lib/profiles/types';
import { ShieldAlert } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

const DEFAULT_STATUS: ProfileStatus = EMPTY_PROFILE_STATUS;
const FALLBACK_METADATA = buildProfileMetadata(buildProfileRequirementSummary([]));

function toInternalPath(pathname: string) {
  const withoutQuery = pathname.split('?')[0]?.split('#')[0] ?? '';
  const segments = withoutQuery.split('/').filter(Boolean);

  if (segments.length) {
    const first = segments[0];
    if (routing.locales.includes(first as (typeof routing.locales)[number])) {
      segments.shift();
    }
  }

  const localized = `/${segments.join('/')}`;
  if (localized === '/') return '/';

  const entries = Object.entries(routing.pathnames ?? {});
  for (const [internal, localizedPath] of entries) {
    if (typeof localizedPath === 'string') {
      if (localized === localizedPath || localized.startsWith(`${localizedPath}/`)) {
        return internal;
      }
      continue;
    }

    const match = Object.values(localizedPath).find(
      (value) => localized === value || localized.startsWith(`${value}/`),
    );
    if (match) return internal;
  }

  return localized;
}

function toLocalizedPath(pathname: string, locale: string) {
  const mapping = (
    routing.pathnames as Record<string, string | Record<string, string> | undefined>
  )[pathname];
  if (!mapping) return pathname;
  if (typeof mapping === 'string') return mapping;
  return mapping[locale as keyof typeof mapping] ?? mapping[routing.defaultLocale] ?? pathname;
}

type ProfileCompletionModalProps = {
  open: boolean;
  profileStatus: ProfileStatus;
  profile: ProfileRecord | null;
  profileMetadata: ProfileMetadata;
  intendedRoute?: string | null;
  onStatusUpdate: (status: ProfileStatus) => void;
  onProfileUpdate: (profile: ProfileRecord | null) => void;
};

function ProfileCompletionModal({
  open,
  profileStatus,
  profile,
  profileMetadata,
  intendedRoute,
  onStatusUpdate,
  onProfileUpdate,
}: ProfileCompletionModalProps) {
  const t = useTranslations('components.profile');
  const locale = useLocale();
  const [remoteStatus, setRemoteStatus] = useState<ProfileStatus>(profileStatus);
  const [metadata, setMetadata] = useState<ProfileMetadata>(profileMetadata);

  useEffect(() => {
    setRemoteStatus(profileStatus);
  }, [profileStatus]);

  useEffect(() => {
    setMetadata(profileMetadata);
  }, [profileMetadata]);

  useEffect(() => {
    if (!open) return;
    setMetadata(profileMetadata);
  }, [open, profile, profileMetadata]);

  const handleUpdate = (result: {
    profile: ProfileRecord | null;
    profileStatus: ProfileStatus;
    profileMetadata: ProfileMetadata;
  }) => {
    setRemoteStatus(result.profileStatus);
    onStatusUpdate(result.profileStatus);
    setMetadata(result.profileMetadata);
    onProfileUpdate(result.profile);
  };

  return (
    <Dialog open={open} onOpenChange={() => undefined}>
      <DialogContent className="max-w-3xl" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-500" />
            {t('title')}
          </DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
          {intendedRoute ? (
            <p className="text-xs text-muted-foreground">
              {t.rich('intendedRoute', {
                route: (chunks) => <span className="font-medium text-foreground">{chunks}</span>,
                routeName: toLocalizedPath(intendedRoute, locale),
              })}
            </p>
          ) : null}
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <ProfileCompletionForm
            profile={profile}
            profileStatus={remoteStatus}
            profileMetadata={metadata}
            onUpdateAction={handleUpdate}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

type ProfileEnforcementBoundaryProps = {
  children: React.ReactNode;
};

export default function ProfileEnforcementBoundary({ children }: ProfileEnforcementBoundaryProps) {
  const { data } = useSession();
  const pathname = usePathname();
  const [overrideStatus, setOverrideStatus] = useState<ProfileStatus | null>(null);
  const [profileOverride, setProfileOverride] = useState<ProfileRecord | null>(null);
  const [capturedRoute, setCapturedRoute] = useState<string | null>(null);
  const user = data?.user ?? null;
  const { profileStatusOverride, needsRoleAssignmentOverride } = useOnboardingOverrides();
  const profileMetadata = (data?.profileMetadata ??
    (user as { profileMetadata?: ProfileMetadata } | null)?.profileMetadata ??
    FALLBACK_METADATA) as ProfileMetadata;
  const profileFromSession = (data?.profile ??
    (user as { profile?: ProfileRecord | null } | null)?.profile ??
    null) as ProfileRecord | null;
  const needsRoleAssignment =
    (data as { needsRoleAssignment?: boolean } | undefined)?.needsRoleAssignment ??
    (user as { needsRoleAssignment?: boolean } | null)?.needsRoleAssignment ??
    false;
  const isInternal =
    user?.isInternal ?? (data as { isInternal?: boolean } | undefined)?.isInternal ?? false;
  const profileStatus =
    overrideStatus ?? profileStatusOverride ?? user?.profileStatus ?? DEFAULT_STATUS;
  const profile = profileOverride ?? profileFromSession;
  const effectiveNeedsRoleAssignment = needsRoleAssignmentOverride ?? needsRoleAssignment;
  const shouldEnforce =
    !isInternal && !effectiveNeedsRoleAssignment && profileStatus.mustCompleteProfile;
  const intendedRoute = capturedRoute ?? (shouldEnforce ? toInternalPath(pathname) : null);

  // Capture the first intended route when enforcement activates and keep it stable for the session.
  useEffect(() => {
    if (shouldEnforce && !capturedRoute) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time capture per plan; avoids recomputing on every render
      setCapturedRoute(toInternalPath(pathname));
    }
  }, [capturedRoute, pathname, shouldEnforce]);

  return (
    <>
      {children}
      <ProfileCompletionModal
        open={shouldEnforce}
        profileStatus={profileStatus}
        profile={profile}
        profileMetadata={profileMetadata}
        intendedRoute={intendedRoute}
        onStatusUpdate={setOverrideStatus}
        onProfileUpdate={setProfileOverride}
      />
    </>
  );
}
