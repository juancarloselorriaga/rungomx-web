'use client';

import { assignExternalRoles } from '@/app/actions/roles';
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
import type { CanonicalRole, PermissionSet } from '@/lib/auth/roles';
import { cn } from '@/lib/utils';
import { CheckCircle2, LogOut, Shield } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useMemo, useState, useTransition } from 'react';
import { useOnboardingOverrides } from './onboarding-context';

const DEFAULT_PERMISSIONS: PermissionSet = {
  canAccessAdminArea: false,
  canAccessUserArea: false,
  canManageUsers: false,
  canManageEvents: false,
  canViewStaffTools: false,
  canViewOrganizersDashboard: false,
  canViewAthleteDashboard: false,
};

const PUBLIC_INVITE_PATH_PATTERNS = [
  /^\/events\/[^/]+\/[^/]+\/group-upload(\/|$)/,
  /^\/events\/[^/]+\/[^/]+\/claim\/[^/]+/,
  /^\/events\/[^/]+\/[^/]+\/register\/complete\/[^/]+/,
];

function stripLocalePrefix(pathname: string): string {
  const sanitized = pathname.split('?')[0]?.split('#')[0] ?? '';
  const segments = sanitized.split('/').filter(Boolean);

  if (segments.length) {
    const first = segments[0];
    if (routing.locales.includes(first as (typeof routing.locales)[number])) {
      segments.shift();
    }
  }

  return `/${segments.join('/')}`;
}

function isPublicInvitePath(pathname: string): boolean {
  const normalized = stripLocalePrefix(pathname);
  return PUBLIC_INVITE_PATH_PATTERNS.some((pattern) => pattern.test(normalized));
}

function toLocalizedPath(pathname: string, locale: string) {
  const mapping = (
    routing.pathnames as Record<string, string | Record<string, string> | undefined>
  )[pathname];
  if (!mapping) return pathname;
  if (typeof mapping === 'string') return mapping;
  return mapping[locale as keyof typeof mapping] ?? mapping[routing.defaultLocale] ?? pathname;
}

export default function RoleEnforcementBoundary({ children }: { children: ReactNode }) {
  const { data } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations('components.profile');
  const [isSubmitting, startTransition] = useTransition();
  const user = data?.user ?? null;
  const isPublicInviteRoute = isPublicInvitePath(pathname);
  const permissions: PermissionSet = (data?.permissions ??
    (user as { permissions?: PermissionSet } | null)?.permissions ??
    DEFAULT_PERMISSIONS) as PermissionSet;

  const canonicalRoles: CanonicalRole[] = useMemo(() => {
    return (
      data?.canonicalRoles ??
      (user as { canonicalRoles?: CanonicalRole[] } | null)?.canonicalRoles ??
      []
    );
  }, [data?.canonicalRoles, user]);

  const availableExternalRoles: CanonicalRole[] = useMemo(() => {
    return (
      data?.availableExternalRoles ??
      (user as { availableExternalRoles?: CanonicalRole[] } | null)?.availableExternalRoles ??
      []
    );
  }, [data?.availableExternalRoles, user]);

  const [error, setError] = useState<string | null>(null);
  const [needsRoleAssignment, setNeedsRoleAssignment] = useState(
    (data as { needsRoleAssignment?: boolean } | undefined)?.needsRoleAssignment ??
      (user as { needsRoleAssignment?: boolean } | null)?.needsRoleAssignment ??
      false,
  );
  const isInternal =
    user?.isInternal ?? (data as { isInternal?: boolean } | undefined)?.isInternal ?? false;

  const externalRolesFromSession = useMemo(
    () => canonicalRoles.filter((role) => role.startsWith('external.')),
    [canonicalRoles],
  );

  const [selectedRoles, setSelectedRoles] = useState<CanonicalRole[]>(externalRolesFromSession);

  const roleOptions = useMemo(
    () => availableExternalRoles.filter((role) => role.startsWith('external.')),
    [availableExternalRoles],
  );
  const hasOptions = roleOptions.length > 0;
  const { setProfileStatusOverride, setNeedsRoleAssignmentOverride } = useOnboardingOverrides();

  useEffect(() => {
    const incomingNeedsRoleAssignment =
      (data as { needsRoleAssignment?: boolean } | undefined)?.needsRoleAssignment ??
      (user as { needsRoleAssignment?: boolean } | null)?.needsRoleAssignment ??
      false;

    setNeedsRoleAssignment(incomingNeedsRoleAssignment);
    setNeedsRoleAssignmentOverride(incomingNeedsRoleAssignment);
  }, [data, setNeedsRoleAssignmentOverride, user]);

  useEffect(() => {
    setSelectedRoles(externalRolesFromSession);
  }, [externalRolesFromSession]);

  useEffect(() => {
    if (!isInternal) return;
    if (!permissions.canAccessAdminArea) return;
    if (isPublicInviteRoute) return;

    const adminPath = toLocalizedPath('/admin', locale);
    if (!pathname.startsWith(adminPath)) {
      router.replace({ pathname: '/admin' }, { locale });
    }
  }, [isInternal, permissions.canAccessAdminArea, isPublicInviteRoute, pathname, router, locale]);

  const toggleRole = (role: CanonicalRole) => {
    setSelectedRoles((prev) =>
      prev.includes(role) ? prev.filter((value) => value !== role) : [...prev, role],
    );
  };

  const handleSubmit = () => {
    if (!hasOptions) {
      setError(t('roleAssignment.errors.server'));
      return;
    }

    if (selectedRoles.length === 0) {
      setError(t('roleAssignment.errors.selection'));
      return;
    }

    startTransition(async () => {
      setError(null);
      const result = await assignExternalRoles({ roles: selectedRoles });

      if (!result.ok) {
        if (result.error === 'INVALID_INPUT') {
          setError(t('roleAssignment.errors.selection'));
          return;
        }
        if (result.error === 'UNAUTHENTICATED') {
          router.refresh();
          return;
        }
        setError(t('roleAssignment.errors.server'));
        return;
      }

      setNeedsRoleAssignment(result.needsRoleAssignment);
      setNeedsRoleAssignmentOverride(result.needsRoleAssignment);
      setSelectedRoles(result.canonicalRoles.filter((role) => role.startsWith('external.')));
      setProfileStatusOverride(result.profileStatus);
      router.refresh();
    });
  };

  const handleSignOut = () => {
    startTransition(async () => {
      await signOut();
      router.refresh();
    });
  };

  const shouldEnforce = !isPublicInviteRoute && !isInternal && needsRoleAssignment;

  return (
    <>
      {children}
      <Dialog open={shouldEnforce} onOpenChange={() => undefined}>
        <DialogContent className="md:min-w-2xl sm:min-w-auto" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              {t('roleAssignment.title')}
            </DialogTitle>
            <DialogDescription>{t('roleAssignment.description')}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            {error ? (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            <div className="grid gap-3 md:grid-cols-3">
              {hasOptions ? (
                roleOptions.map((role) => {
                  const roleKind = role.split('.')[1] as 'organizer' | 'athlete' | 'volunteer';
                  const selected = selectedRoles.includes(role);
                  return (
                    <button
                      key={role}
                      type="button"
                      onClick={() => toggleRole(role)}
                      className={cn(
                        'flex h-full flex-col rounded-lg border p-3 text-left transition hover:border-primary/60 hover:shadow-sm',
                        selected ? 'border-primary bg-primary/5' : 'border-border bg-background',
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">
                          {t(`roleAssignment.roles.${roleKind}.title`)}
                        </span>
                        {selected ? <CheckCircle2 className="h-4 w-4 text-primary" /> : null}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t(`roleAssignment.roles.${roleKind}.description`)}
                      </p>
                    </button>
                  );
                })
              ) : (
                <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                  {t('roleAssignment.errors.server')}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <Button
                type="button"
                variant="ghost"
                className="w-full justify-center gap-2 text-sm text-muted-foreground sm:w-auto"
                onClick={handleSignOut}
              >
                <LogOut className="h-4 w-4" />
                {t('roleAssignment.actions.signOut')}
              </Button>

              <Button
                type="button"
                className="w-full sm:w-auto"
                onClick={handleSubmit}
                disabled={isSubmitting || !hasOptions}
              >
                {isSubmitting ? <Spinner className="mr-2 h-4 w-4" /> : null}
                {t('roleAssignment.actions.save')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
