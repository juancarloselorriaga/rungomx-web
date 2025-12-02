'use client';

import { upsertProfileAction } from '@/app/actions/profile';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { usePathname, useRouter } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { signOut, useSession } from '@/lib/auth/client';
import { EMPTY_PROFILE_STATUS } from '@/lib/auth/constants';
import type { ProfileRecord, ProfileStatus, ProfileUpsertInput } from '@/lib/profiles/types';
import { buildProfileRequirementSummary } from '@/lib/profiles/requirements';
import { buildProfileMetadata, ProfileMetadata } from '@/lib/profiles/metadata';
import { DatePicker } from '@/components/ui/date-picker';
import { CheckCircle2, LogOut, ShieldAlert } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState, useTransition } from 'react';

type ProfileFormState = {
  phone: string;
  city: string;
  state: string;
  dateOfBirth: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  gender: string;
  shirtSize: string;
  bloodType: string;
  bio: string;
};

const DEFAULT_FORM_STATE: ProfileFormState = {
  phone: '',
  city: '',
  state: '',
  dateOfBirth: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  gender: '',
  shirtSize: '',
  bloodType: '',
  bio: '',
};

const DEFAULT_STATUS: ProfileStatus = EMPTY_PROFILE_STATUS;
const FALLBACK_METADATA = buildProfileMetadata(buildProfileRequirementSummary([]));

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <span className="font-medium text-foreground">
      {children}
      {required ? <span className="text-destructive"> *</span> : null}
    </span>
  );
}

function toInternalPath(pathname: string) {
  const withoutQuery = pathname.split('?')[0]?.split('#')[0] ?? '';
  const segments = withoutQuery
    .split('/')
    .filter(Boolean);

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
      (value) => localized === value || localized.startsWith(`${value}/`)
    );
    if (match) return internal;
  }

  return localized;
}

function formatDateInput(value?: string | Date | null) {
  if (!value) return '';
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

function normalizeShirtSize(value?: string | null) {
  if (!value) return '';
  return value.trim().toLowerCase();
}

function toFormState(profile: ProfileRecord | null): ProfileFormState {
  if (!profile) return DEFAULT_FORM_STATE;

  return {
    phone: profile.phone ?? '',
    city: profile.city ?? '',
    state: profile.state ?? '',
    dateOfBirth: formatDateInput(profile.dateOfBirth),
    emergencyContactName: profile.emergencyContactName ?? '',
    emergencyContactPhone: profile.emergencyContactPhone ?? '',
    gender: profile.gender ?? '',
    shirtSize: normalizeShirtSize(profile.shirtSize),
    bloodType: profile.bloodType ?? '',
    bio: profile.bio ?? '',
  };
}

function buildPayload(form: ProfileFormState): ProfileUpsertInput {
  const entries = Object.entries(form) as [keyof ProfileFormState, string][];
  const payload: Record<string, string> = {};

  entries.forEach(([key, value]) => {
    const trimmed = value?.trim?.() ?? '';
    if (!trimmed) return;

    payload[key] = key === 'shirtSize' ? trimmed.toLowerCase() : trimmed;
  });

  return payload;
}

function toLocalizedPath(pathname: string, locale: string) {
  const mapping = (routing.pathnames as Record<string, string | Record<string, string> | undefined>)[pathname];
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
  const router = useRouter();
  const t = useTranslations('components.profile');
  const locale = useLocale();
  const [formState, setFormState] = useState<ProfileFormState>(toFormState(profile));
  const [remoteStatus, setRemoteStatus] = useState<ProfileStatus>(profileStatus);
  const [metadata, setMetadata] = useState<ProfileMetadata>(profileMetadata);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, startTransition] = useTransition();
  const requiredFieldKeys = useMemo(
    () => new Set(metadata.requiredFieldKeys ?? []),
    [metadata]
  );
  const shirtSizeOptions = metadata.shirtSizes ?? [];
  const isRequiredField = (field: keyof ProfileRecord) => requiredFieldKeys.has(field);

  useEffect(() => {
    setRemoteStatus(profileStatus);
  }, [profileStatus]);

  useEffect(() => {
    setMetadata(profileMetadata);
  }, [profileMetadata]);

  useEffect(() => {
    if (!open) return;
    setFormState(toFormState(profile));
    setMetadata(profileMetadata);
  }, [open, profile, profileMetadata]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const payload = buildPayload(formState);
      const result = await upsertProfileAction(payload);

      if (!result.ok) {
        if (result.error === 'INVALID_INPUT') {
          setError(t('errors.invalidInput'));
          return;
        }
        setError(t('errors.saveProfile'));
        return;
      }

      setRemoteStatus(result.profileStatus);
      onStatusUpdate(result.profileStatus);
      setMetadata(result.profileMetadata);
      onProfileUpdate(result.profile);
      setFormState(toFormState(result.profile));
      router.refresh();
    });
  };

  const handleSignOut = () => {
    startTransition(async () => {
      await signOut();
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={() => undefined}>
      <DialogContent className="max-w-3xl" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-500"/>
            {t('title')}
          </DialogTitle>
          <DialogDescription>
            {t('description')}
          </DialogDescription>
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
          {error ? (
            <div
              className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-2 text-muted-foreground">
              <CheckCircle2 className="h-4 w-4"/>
              {t('status.label')}{' '}
              {remoteStatus.isComplete ? t('status.complete') : t('status.incomplete')}
            </div>
          </div>

          <form className="space-y-3" onSubmit={handleSubmit}>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <FieldLabel required={isRequiredField('phone')}>
                  {t('fields.phone')}
                </FieldLabel>
                <input
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
                  name="phone"
                  value={formState.phone}
                  onChange={(event) => setFormState((prev) => ({
                    ...prev,
                    phone: event.target.value
                  }))}
                />
              </label>

              <label className="space-y-1 text-sm">
                <FieldLabel required={isRequiredField('dateOfBirth')}>
                  {t('fields.dateOfBirth')}
                </FieldLabel>
                <DatePicker
                  locale={locale}
                  value={formState.dateOfBirth}
                  onChange={(value) => setFormState((prev) => ({
                    ...prev,
                    dateOfBirth: value
                  }))}
                  clearLabel={t('actions.clear')}
                  name="dateOfBirth"
                />
              </label>

              <label className="space-y-1 text-sm">
                <FieldLabel required={isRequiredField('city')}>
                  {t('fields.city')}
                </FieldLabel>
                <input
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
                  name="city"
                  value={formState.city}
                  onChange={(event) => setFormState((prev) => ({
                    ...prev,
                    city: event.target.value
                  }))}
                />
              </label>

              <label className="space-y-1 text-sm">
                <FieldLabel required={isRequiredField('state')}>
                  {t('fields.state')}
                </FieldLabel>
                <input
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
                  name="state"
                  value={formState.state}
                  onChange={(event) => setFormState((prev) => ({
                    ...prev,
                    state: event.target.value
                  }))}
                />
              </label>

              <label className="space-y-1 text-sm">
                <FieldLabel required={isRequiredField('emergencyContactName')}>
                  {t('fields.emergencyContactName')}
                </FieldLabel>
                <input
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
                  name="emergencyContactName"
                  value={formState.emergencyContactName}
                  onChange={(event) =>
                    setFormState((prev) => ({
                      ...prev,
                      emergencyContactName: event.target.value
                    }))
                  }
                />
              </label>

              <label className="space-y-1 text-sm">
                <FieldLabel required={isRequiredField('emergencyContactPhone')}>
                  {t('fields.emergencyContactPhone')}
                </FieldLabel>
                <input
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
                  name="emergencyContactPhone"
                  value={formState.emergencyContactPhone}
                  onChange={(event) =>
                    setFormState((prev) => ({
                      ...prev,
                      emergencyContactPhone: event.target.value
                    }))
                  }
                />
              </label>

              <label className="space-y-1 text-sm">
                <FieldLabel required={isRequiredField('gender')}>
                  {t('fields.gender')}
                </FieldLabel>
                <input
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
                  name="gender"
                  value={formState.gender}
                  onChange={(event) => setFormState((prev) => ({
                    ...prev,
                    gender: event.target.value
                  }))}
                />
              </label>

              <label className="space-y-1 text-sm">
                <FieldLabel required={isRequiredField('shirtSize')}>
                  {t('fields.shirtSize')}
                </FieldLabel>
                <div className="relative">
                  <select
                    className="w-full appearance-none rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
                    name="shirtSize"
                    value={formState.shirtSize}
                    onChange={(event) =>
                      setFormState((prev) => ({
                        ...prev,
                        shirtSize: event.target.value
                      }))
                    }
                  >
                    <option value="">{t('selectOption')}</option>
                    {shirtSizeOptions.map((size) => (
                      <option key={size} value={size}>
                        {t(`shirtSizes.${size}` as const, { defaultValue: size.toUpperCase() })}
                      </option>
                    ))}
                  </select>
                </div>
              </label>

              <label className="space-y-1 text-sm">
                <FieldLabel required={isRequiredField('bloodType')}>
                  {t('fields.bloodType')}
                </FieldLabel>
                <input
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
                  name="bloodType"
                  value={formState.bloodType}
                  onChange={(event) => setFormState((prev) => ({
                    ...prev,
                    bloodType: event.target.value
                  }))}
                />
              </label>
            </div>

            <label className="space-y-1 text-sm">
              <FieldLabel required={isRequiredField('bio')}>
                {t('fields.bio')}
              </FieldLabel>
              <textarea
                className="min-h-[80px] w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
                name="bio"
                value={formState.bio}
                onChange={(event) => setFormState((prev) => ({
                  ...prev,
                  bio: event.target.value
                }))}
              />
            </label>

            <div
              className="flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
              <Button
                type="button"
                variant="ghost"
                className="justify-start gap-2 text-sm text-muted-foreground"
                onClick={handleSignOut}
              >
                <LogOut className="h-4 w-4"/>
                {t('actions.signOut')}
              </Button>

              <div className="flex items-center gap-2">
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? <Spinner className="mr-2 h-4 w-4"/> : null}
                  {t('actions.submit')}
                </Button>
              </div>
            </div>
          </form>
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
  const isInternal = user?.isInternal ??
    (data as { isInternal?: boolean } | undefined)?.isInternal ?? false;
  const profileStatus = overrideStatus ?? user?.profileStatus ?? DEFAULT_STATUS;
  const profile = profileOverride ?? profileFromSession;
  const shouldEnforce = !isInternal && !needsRoleAssignment && profileStatus.mustCompleteProfile;
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
