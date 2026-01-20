'use client';

import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { useRouter } from '@/i18n/navigation';
import {
  addOrgMember,
  lookupUserByEmail,
  removeOrgMember,
  updateOrgMember,
} from '@/lib/organizations/actions';
import { Form, FormError, useForm } from '@/lib/forms';
import { ORG_MEMBERSHIP_ROLES, type OrgMembershipRole } from '@/lib/events/constants';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';

type OrganizationMember = {
  userId: string;
  name: string;
  email: string;
  role: OrgMembershipRole;
};

type OrganizationMembersManagerProps = {
  organizationId: string;
  members: OrganizationMember[];
  canManageMembers: boolean;
  currentUserId: string;
  isSupportUser: boolean;
};

const sortMembers = (list: OrganizationMember[]) =>
  [...list].sort((a, b) => {
    const nameCompare = a.name.localeCompare(b.name);
    if (nameCompare !== 0) return nameCompare;
    return a.email.localeCompare(b.email);
  });

export function OrganizationMembersManager({
  organizationId,
  members: initialMembers,
  canManageMembers,
  currentUserId,
  isSupportUser,
}: OrganizationMembersManagerProps) {
  const t = useTranslations('pages.dashboard.organizations');
  const router = useRouter();
  const [members, setMembers] = useState(() => sortMembers(initialMembers));
  const [actionError, setActionError] = useState<string | null>(null);
  const [savingMemberId, setSavingMemberId] = useState<string | null>(null);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const resetFormRef = useRef<() => void>(() => undefined);

  const roleOptions = useMemo(() => ORG_MEMBERSHIP_ROLES, []);

  const resolveErrorMessage = (code?: string, fallback?: string) => {
    switch (code) {
      case 'UNAUTHENTICATED':
        return t('errors.unauthenticated');
      case 'FORBIDDEN':
        return t('errors.forbidden');
      case 'VALIDATION_ERROR':
        return t('errors.validation');
      case 'NOT_FOUND':
        return t('errors.notFound');
      case 'ALREADY_MEMBER':
        return t('errors.alreadyMember');
      case 'LAST_OWNER':
        return t('errors.lastOwner');
      default:
        return fallback ?? t('errors.generic');
    }
  };

  const addMemberForm = useForm<{ email: string; role: OrgMembershipRole }, OrganizationMember>({
    defaultValues: {
      email: '',
      role: 'viewer',
    },
    onSubmit: async (values) => {
      setActionError(null);
      if (!canManageMembers) {
        return { ok: false, error: 'SERVER_ERROR', message: t('errors.forbidden') };
      }

      const lookupResult = await lookupUserByEmail({
        organizationId,
        email: values.email.trim(),
      });

      if (!lookupResult.ok) {
        return {
          ok: false,
          error: 'SERVER_ERROR',
          message: resolveErrorMessage(lookupResult.code, lookupResult.error),
        };
      }

      const addResult = await addOrgMember({
        organizationId,
        userId: lookupResult.data.userId,
        role: values.role,
      });

      if (!addResult.ok) {
        return {
          ok: false,
          error: 'SERVER_ERROR',
          message: resolveErrorMessage(addResult.code, addResult.error),
        };
      }

      return {
        ok: true,
        data: {
          userId: lookupResult.data.userId,
          name: lookupResult.data.name,
          email: lookupResult.data.email,
          role: values.role,
        },
      };
    },
    onSuccess: (newMember) => {
      if (newMember) {
        setMembers((prev) => sortMembers([...prev, newMember]));
      }
      resetFormRef.current();
      router.refresh();
    },
  });
  useEffect(() => {
    resetFormRef.current = addMemberForm.reset;
  }, [addMemberForm]);

  async function handleRoleChange(userId: string, role: OrgMembershipRole) {
    if (!canManageMembers) {
      setActionError(t('errors.forbidden'));
      return;
    }

    setActionError(null);
    const previous = members.find((member) => member.userId === userId);
    setMembers((prev) =>
      prev.map((member) => (member.userId === userId ? { ...member, role } : member)),
    );
    setSavingMemberId(userId);

    const result = await updateOrgMember({
      organizationId,
      userId,
      role,
    });

    if (!result.ok) {
      setMembers((prev) =>
        prev.map((member) =>
          member.userId === userId && previous ? { ...member, role: previous.role } : member,
        ),
      );
      setActionError(resolveErrorMessage(result.code, result.error));
    } else {
      router.refresh();
    }

    setSavingMemberId(null);
  }

  async function handleRemoveMember(userId: string) {
    if (!canManageMembers) {
      setActionError(t('errors.forbidden'));
      return;
    }

    setActionError(null);
    setRemovingMemberId(userId);
    const result = await removeOrgMember({ organizationId, userId });

    if (!result.ok) {
      setActionError(resolveErrorMessage(result.code, result.error));
    } else {
      setMembers((prev) => prev.filter((member) => member.userId !== userId));
      router.refresh();
    }

    setRemovingMemberId(null);
  }

  return (
    <div className="space-y-6">
      {actionError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {actionError}
        </div>
      )}

      <section className="rounded-lg border bg-card p-6 shadow-sm space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">{t('detail.membersTitle')}</h2>
          <p className="text-sm text-muted-foreground">{t('detail.membersDescription')}</p>
          {!canManageMembers && (
            <p className="text-sm text-muted-foreground">{t('detail.membersReadOnly')}</p>
          )}
          {isSupportUser && (
            <p className="text-sm text-muted-foreground">{t('detail.supportAccess')}</p>
          )}
        </div>

        {members.length === 0 ? (
          <div className="rounded-lg border bg-muted/40 p-6 text-sm text-muted-foreground">
            {t('detail.membersEmpty')}
          </div>
        ) : (
          <div className="-mx-6 overflow-x-auto px-6 pb-1">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b text-muted-foreground bg-muted/30">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">{t('table.member')}</th>
                  <th className="px-4 py-2 text-left font-medium">{t('table.email')}</th>
                  <th className="px-4 py-2 text-left font-medium">{t('table.role')}</th>
                  <th className="px-4 py-2 text-right font-medium">{t('table.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.userId} className="border-b last:border-b-0">
                    <td className="px-4 py-3">
                      <div className="font-medium">
                        {member.name}
                        {member.userId === currentUserId && (
                          <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            {t('labels.you')}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{member.email}</td>
                    <td className="px-4 py-3">
                      <select
                        value={member.role}
                        onChange={(event) =>
                          handleRoleChange(member.userId, event.target.value as OrgMembershipRole)
                        }
                        className="w-full rounded-md border bg-background px-2 py-1 text-sm shadow-sm outline-none transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
                        disabled={!canManageMembers || savingMemberId === member.userId}
                      >
                        {roleOptions.map((role) => (
                          <option key={role} value={role}>
                            {t(`roles.${role}`)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveMember(member.userId)}
                        disabled={!canManageMembers || removingMemberId === member.userId}
                      >
                        {removingMemberId === member.userId ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-1" />
                        ) : (
                          <Trash2 className="h-4 w-4 mr-1" />
                        )}
                        {t('actions.remove')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-lg border bg-card p-6 shadow-sm space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">{t('detail.addMemberTitle')}</h2>
          <p className="text-sm text-muted-foreground">{t('detail.addMemberDescription')}</p>
        </div>

        <Form form={addMemberForm} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-[2fr_1fr_auto] md:items-end">
            <FormField label={t('detail.emailLabel')} required>
              <input
                type="email"
                placeholder={t('detail.emailPlaceholder')}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
                disabled={addMemberForm.isSubmitting || !canManageMembers}
                {...addMemberForm.register('email')}
              />
            </FormField>
            <FormField label={t('detail.roleLabel')} required>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
                disabled={addMemberForm.isSubmitting || !canManageMembers}
                {...addMemberForm.register('role')}
              >
                {roleOptions.map((role) => (
                  <option key={role} value={role}>
                    {t(`roles.${role}`)}
                  </option>
                ))}
              </select>
            </FormField>
            <Button
              type="submit"
              disabled={addMemberForm.isSubmitting || !canManageMembers}
              className="w-full md:w-auto"
            >
              {addMemberForm.isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Plus className="h-4 w-4 mr-1" />
              )}
              {t('actions.add')}
            </Button>
          </div>
          <FormError />
        </Form>
      </section>
    </div>
  );
}
