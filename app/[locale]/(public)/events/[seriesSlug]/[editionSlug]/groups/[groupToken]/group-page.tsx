'use client';

import { Button } from '@/components/ui/button';
import { Link, useRouter } from '@/i18n/navigation';
import {
  joinRegistrationGroup,
  leaveRegistrationGroup,
  removeRegistrationGroupMember,
} from '@/lib/events/registration-groups/actions';
import { cn } from '@/lib/utils';
import { CheckCircle, Circle, Loader2, LogIn, Share2, Users, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';

type GroupLinkPageProps = {
  groupToken: string;
  status: string;
  isAuthenticated: boolean;
  signInUrl?: string;
  signUpUrl?: string;
  event: {
    editionId: string;
    editionSlug: string;
    editionLabel: string;
    seriesSlug: string;
    seriesName: string;
    startsAt: string | null;
    timezone: string;
    locationDisplay: string | null;
    city: string | null;
    state: string | null;
    isRegistrationOpen: boolean;
    isRegistrationPaused: boolean;
    registrationOpensAt: string | null;
    registrationClosesAt: string | null;
  };
  distance: {
    id: string;
    label: string;
    spotsRemaining: number | null;
  };
  group: {
    id: string;
    name: string | null;
    tokenPrefix: string;
    maxMembers: number;
    memberCount: number;
    createdByUserId: string;
  };
  viewer: {
    isAuthenticated: boolean;
    isCreator: boolean;
    isMember: boolean;
    hasJoinedOtherGroupInEdition: boolean;
  };
  members: Array<{
    userId: string;
    name: string;
    joinedAt: string;
    registration: { id: string; status: string; expiresAt: string | null; distanceId: string } | null;
  }>;
  memberSummary: Array<{
    userId: string;
    displayName: string;
    isRegistered: boolean;
  }>;
  discount: {
    tiers: Array<{ minParticipants: number; percentOff: number }>;
    joinedMemberCount: number;
    currentPercentOff: number | null;
    nextTier: { minParticipants: number; percentOff: number; membersNeeded: number } | null;
  };
};

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-emerald-500/10 text-emerald-600',
  DISABLED: 'bg-muted text-muted-foreground',
  NOT_FOUND: 'bg-muted text-muted-foreground',
};

function formatDateTime(value: string | null, locale: string, timezone?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone ?? undefined,
  }).format(date);
}

export function GroupLinkPage({
  groupToken,
  status,
  isAuthenticated,
  signInUrl,
  signUpUrl,
  event,
  distance,
  group,
  viewer,
  members,
  memberSummary,
  discount,
}: GroupLinkPageProps) {
  const t = useTranslations('pages.groupLink');
  const activeLocale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [removingUserId, setRemovingUserId] = useState<string | null>(null);

  const statusLabelMap: Record<string, string> = {
    ACTIVE: t('status.ACTIVE'),
    DISABLED: t('status.DISABLED'),
    NOT_FOUND: t('status.NOT_FOUND'),
  };
  const statusLabel = statusLabelMap[status] ?? status;

  const groupFull = group.memberCount >= group.maxMembers;

  const eventDate = useMemo(
    () => formatDateTime(event.startsAt, activeLocale, event.timezone),
    [event.startsAt, event.timezone, activeLocale],
  );

  const registrationOpensAt = useMemo(
    () => formatDateTime(event.registrationOpensAt, activeLocale, event.timezone),
    [event.registrationOpensAt, event.timezone, activeLocale],
  );

  const registrationClosesAt = useMemo(
    () => formatDateTime(event.registrationClosesAt, activeLocale, event.timezone),
    [event.registrationClosesAt, event.timezone, activeLocale],
  );

  const locationLabel = event.locationDisplay || [event.city, event.state].filter(Boolean).join(', ');
  const shareTitle = t('share.shareLink');
  const shareText = t('share.shareText', {
    eventName: `${event.seriesName} ${event.editionLabel}`,
  });
  const showDiscountCard = discount.tiers.length > 0;

  const handleCopyLink = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t('share.copied'));
    } catch {
      toast.error(t('share.failed'));
    }
  };

  const handleShare = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    if (!url) return;

    if (navigator.share) {
      try {
        await navigator.share({ title: shareTitle, text: shareText, url });
        return;
      } catch {
        await handleCopyLink();
        return;
      }
    }

    await handleCopyLink();
  };

  const handleJoin = () => {
    if (!isAuthenticated) {
      if (signInUrl) {
        window.location.href = signInUrl;
        return;
      }
      toast.error(t('loginRequired.description'));
      return;
    }

    if (viewer.hasJoinedOtherGroupInEdition && !viewer.isMember) {
      toast.error(t('errors.alreadyInAnotherGroup'));
      return;
    }

    if (groupFull && !viewer.isMember) {
      toast.error(t('errors.groupFull'));
      return;
    }

    startTransition(async () => {
      const result = await joinRegistrationGroup({ token: groupToken });
      if (!result.ok) {
        toast.error(t('errors.join'), { description: result.error });
        return;
      }

      toast.success(t('join.success'));
      router.refresh();
    });
  };

  const handleLeave = () => {
    startTransition(async () => {
      const result = await leaveRegistrationGroup({ token: groupToken });
      if (!result.ok) {
        toast.error(t('errors.leave'), { description: result.error });
        return;
      }
      toast.success(t('leave.success'));
      router.refresh();
    });
  };

  const handleRemoveMember = (userId: string) => {
    setRemovingUserId(userId);
    startTransition(async () => {
      const result = await removeRegistrationGroupMember({ token: groupToken, userId });
      if (!result.ok) {
        toast.error(t('errors.removeMember'), { description: result.error });
        setRemovingUserId(null);
        return;
      }
      toast.success(t('members.removed'));
      setRemovingUserId(null);
      router.refresh();
    });
  };

  const canJoin = status === 'ACTIVE' && !viewer.hasJoinedOtherGroupInEdition && (!groupFull || viewer.isMember);

  const showRegistrationCta = status === 'ACTIVE' && event.isRegistrationOpen && viewer.isMember;

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <span className={cn('rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide', STATUS_STYLES[status])}>
            {statusLabel}
          </span>
        </div>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>

      <div className="rounded-lg border bg-card p-5 shadow-sm space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-lg font-semibold">
              {event.seriesName} {event.editionLabel}
            </div>
            <div className="text-sm text-muted-foreground">
              {[eventDate, locationLabel].filter(Boolean).join(' · ')}
            </div>
            <div className="mt-2 text-sm">
              <span className="font-medium">{t('group.nameLabel')}:</span>{' '}
              {group.name ? group.name : <span className="text-muted-foreground italic">{t('group.unnamed')}</span>}
            </div>
            <div className="text-sm">
              <span className="font-medium">{t('group.distanceLabel')}:</span> {distance.label}
            </div>
          </div>

          <div className="text-right">
            <div className="text-sm font-medium">
              {t('group.memberCount', { count: group.memberCount, max: group.maxMembers })}
            </div>
            {distance.spotsRemaining !== null ? (
              <div className="text-xs text-muted-foreground">
                {t('group.spotsRemaining', { count: distance.spotsRemaining })}
              </div>
            ) : null}
            <div className="mt-2 text-xs text-muted-foreground">
              {t('group.code', { prefix: group.tokenPrefix })}
            </div>
          </div>
        </div>

        {!event.isRegistrationOpen ? (
          <div className="rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">
            {event.isRegistrationPaused
              ? t('registration.paused')
              : registrationOpensAt
                ? t('registration.opensAt', { date: registrationOpensAt })
                : registrationClosesAt
                  ? t('registration.closedAt', { date: registrationClosesAt })
                  : t('registration.closed')}
          </div>
        ) : null}

        <div className="rounded-md bg-muted/40 p-3 text-sm text-muted-foreground space-y-1">
          <div>{t('howItWorks.noReservation')}</div>
          <div>{t('howItWorks.selfPay')}</div>
        </div>
      </div>

      {showDiscountCard ? (
        <div className="rounded-lg border bg-card p-5 shadow-sm space-y-4">
          <div>
            <h2 className="text-base font-semibold">{t('discount.title')}</h2>
            <p className="text-sm text-muted-foreground">
              {discount.currentPercentOff !== null
                ? t('discount.currentDiscount', { percent: discount.currentPercentOff })
                : t('discount.noDiscountYet')}
            </p>
          </div>

          <div className="space-y-2">
            {discount.tiers.map((tier) => {
              const isMet = discount.joinedMemberCount >= tier.minParticipants;
              return (
                <div
                  key={tier.minParticipants}
                  className={cn(
                    'flex items-center justify-between rounded-md border px-3 py-2 text-sm',
                    isMet
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-muted bg-muted/30 text-muted-foreground',
                  )}
                >
                  <div className="flex items-center gap-2">
                    {isMet ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : (
                      <Circle className="h-4 w-4" />
                    )}
                    <span>
                      {isMet
                        ? t('discount.tierMet', {
                            min: tier.minParticipants,
                            percent: tier.percentOff,
                          })
                        : t('discount.tierPending', {
                            min: tier.minParticipants,
                            percent: tier.percentOff,
                          })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {discount.nextTier ? (
            <div className="text-sm text-muted-foreground space-y-1">
              <div className="font-medium text-foreground">
                {t('discount.nextTier', {
                  count: discount.nextTier.membersNeeded,
                  percent: discount.nextTier.percentOff,
                })}
              </div>
              <div>
                {t('discount.progress', {
                  count: discount.joinedMemberCount,
                  total: discount.nextTier.minParticipants,
                })}
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              {t('discount.registeredCount', { count: discount.joinedMemberCount })}
            </div>
          )}
        </div>
      ) : null}

      {!isAuthenticated && signInUrl && signUpUrl ? (
        <div className="rounded-lg border bg-card p-5 shadow-sm space-y-3">
          <div>
            <h2 className="text-base font-semibold">{t('loginRequired.title')}</h2>
            <p className="text-sm text-muted-foreground">{t('loginRequired.description')}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <a href={signInUrl}>
                <LogIn className="h-4 w-4 mr-2" />
                {t('loginRequired.signIn')}
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a href={signUpUrl}>{t('loginRequired.signUp')}</a>
            </Button>
          </div>
        </div>
      ) : null}

      <div className="rounded-lg border bg-card p-5 shadow-sm space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h2 className="text-base font-semibold">{t('actions.title')}</h2>
            <p className="text-sm text-muted-foreground">
              {viewer.isMember ? t('actions.joined') : groupFull ? t('actions.groupFull') : t('actions.notJoined')}
            </p>
            {viewer.hasJoinedOtherGroupInEdition && !viewer.isMember ? (
              <p className="text-sm text-destructive">{t('errors.alreadyInAnotherGroup')}</p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-3">
            {viewer.isCreator || viewer.isMember ? (
              <Button variant="outline" onClick={handleShare} disabled={isPending}>
                <Share2 className="h-4 w-4 mr-2" />
                {t('share.shareLink')}
              </Button>
            ) : null}

            {viewer.isMember ? (
              <Button variant="outline" onClick={handleLeave} disabled={isPending}>
                <X className="h-4 w-4 mr-2" />
                {t('leave.action')}
              </Button>
            ) : (
              <Button onClick={handleJoin} disabled={!canJoin || isPending}>
                {isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Users className="h-4 w-4 mr-2" />}
                {t('join.action')}
              </Button>
            )}

            {showRegistrationCta ? (
              <Button asChild disabled={isPending}>
                <Link
                  href={{
                    pathname: '/events/[seriesSlug]/[editionSlug]/register',
                    params: { seriesSlug: event.seriesSlug, editionSlug: event.editionSlug },
                    query: { distanceId: distance.id, groupToken },
                  }}
                >
                  {t('registration.start')}
                </Link>
              </Button>
            ) : null}
          </div>
        </div>

        {viewer.isMember && status === 'ACTIVE' && !event.isRegistrationOpen ? (
          <p className="text-sm text-muted-foreground">{t('registration.ctaDisabled')}</p>
        ) : null}
      </div>

      {viewer.isCreator ? (
        <div className="rounded-lg border bg-card p-5 shadow-sm space-y-4">
          <div>
            <h2 className="text-base font-semibold">{t('members.title')}</h2>
            <p className="text-sm text-muted-foreground">{t('members.description')}</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">{t('members.headers.name')}</th>
                  <th className="py-2 pr-4 font-medium">{t('members.headers.joinedAt')}</th>
                  <th className="py-2 pr-4 font-medium">{t('members.headers.registration')}</th>
                  <th className="py-2 text-right font-medium">{t('members.headers.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {members.map((member) => {
                  const reg = member.registration;
                  const regStatusLabel = reg
                    ? reg.status === 'confirmed'
                      ? t('members.registrationStatus.confirmed')
                      : reg.status === 'payment_pending'
                        ? t('members.registrationStatus.paymentPending')
                        : t('members.registrationStatus.inProgress')
                    : t('members.registrationStatus.notStarted');

                  const joinedAtLabel = formatDateTime(member.joinedAt, activeLocale, event.timezone);
                  const expiresAtLabel = reg?.expiresAt ? formatDateTime(reg.expiresAt, activeLocale, event.timezone) : null;

                  return (
                    <tr key={member.userId}>
                      <td className="py-3 pr-4">
                        <div className="font-medium">{member.name}</div>
                        {reg && reg.distanceId !== distance.id ? (
                          <div className="text-xs text-amber-600">{t('members.registrationStatus.differentDistance')}</div>
                        ) : null}
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground whitespace-nowrap">
                        {joinedAtLabel ?? '—'}
                      </td>
                      <td className="py-3 pr-4">
                        <div className="font-medium">{regStatusLabel}</div>
                        {expiresAtLabel ? (
                          <div className="text-xs text-muted-foreground">
                            {t('members.registrationStatus.expiresAt', { date: expiresAtLabel })}
                          </div>
                        ) : null}
                      </td>
                      <td className="py-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveMember(member.userId)}
                          disabled={isPending && removingUserId === member.userId}
                        >
                          {isPending && removingUserId === member.userId ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            t('members.actions.remove')
                          )}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {viewer.isMember && !viewer.isCreator ? (
        <div className="rounded-lg border bg-card p-5 shadow-sm space-y-4">
          <div>
            <h2 className="text-base font-semibold">{t('members.title')}</h2>
            <p className="text-sm text-muted-foreground">{t('members.description')}</p>
          </div>

          <div className="space-y-2">
            {memberSummary.map((member) => (
              <div
                key={member.userId}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
              >
                <span>{member.displayName}</span>
                <span
                  className={cn(
                    'text-xs font-medium',
                    member.isRegistered ? 'text-emerald-600' : 'text-muted-foreground',
                  )}
                >
                  {member.isRegistered
                    ? t('members.memberView.registered')
                    : t('members.memberView.notRegistered')}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
