'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getPathname } from '@/i18n/navigation';
import { createUploadLink, listUploadLinksForEdition, revokeUploadLink } from '@/lib/events/group-upload/actions';
import { PAYMENT_RESPONSIBILITIES } from '@/lib/events/constants';
import { siteUrl } from '@/config/url';
import { cn } from '@/lib/utils';
import { Copy, Link2, Loader2, Plus, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';

type UploadLinkStatus =
  | 'ACTIVE'
  | 'NOT_STARTED'
  | 'EXPIRED'
  | 'REVOKED'
  | 'DISABLED'
  | 'MAXED_OUT';

type UploadLinkItem = {
  id: string;
  name: string | null;
  tokenPrefix: string;
  status: UploadLinkStatus;
  startsAt: string | null;
  endsAt: string | null;
  maxBatches: number | null;
  maxInvites: number | null;
  createdAt: string;
  revokedAt: string | null;
  batchCount: number;
  inviteCount: number;
};

type UploadLinkPayload = Omit<UploadLinkItem, 'status' | 'startsAt' | 'endsAt' | 'createdAt' | 'revokedAt'> & {
  status: string;
  startsAt: string | Date | null;
  endsAt: string | Date | null;
  createdAt: string | Date;
  revokedAt: string | Date | null;
};

type GroupUploadLinksManagerProps = {
  editionId: string;
  seriesSlug: string;
  editionSlug: string;
  initialLinks: UploadLinkPayload[];
};

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-emerald-500/10 text-emerald-600',
  NOT_STARTED: 'bg-amber-500/10 text-amber-600',
  EXPIRED: 'bg-muted text-muted-foreground',
  REVOKED: 'bg-red-500/10 text-red-600',
  DISABLED: 'bg-muted text-muted-foreground',
  MAXED_OUT: 'bg-amber-500/10 text-amber-600',
};

function toIsoString(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function normalizeLink(link: UploadLinkPayload): UploadLinkItem {
  const toIso = (value: string | Date | null) => {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  };

  return {
    ...link,
    status: link.status as UploadLinkStatus,
    startsAt: toIso(link.startsAt),
    endsAt: toIso(link.endsAt),
    createdAt: toIso(link.createdAt) ?? new Date().toISOString(),
    revokedAt: toIso(link.revokedAt),
  };
}

export function GroupUploadLinksManager({
  editionId,
  seriesSlug,
  editionSlug,
  initialLinks,
}: GroupUploadLinksManagerProps) {
  const t = useTranslations('pages.dashboardEvents.groupRegistrations.uploadLinks');
  const locale = useLocale();
  const [links, setLinks] = useState<UploadLinkItem[]>(initialLinks.map(normalizeLink));
  const [isPending, startTransition] = useTransition();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [createdLink, setCreatedLink] = useState<{ token: string; tokenPrefix: string } | null>(null);

  const [name, setName] = useState('');
  const [paymentResponsibility, setPaymentResponsibility] = useState<typeof PAYMENT_RESPONSIBILITIES[number]>('self_pay');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [maxBatches, setMaxBatches] = useState('');
  const [maxInvites, setMaxInvites] = useState('');

  const refreshLinks = async () => {
    const result = await listUploadLinksForEdition({ editionId });
    if (result.ok) {
      setLinks(result.data.map(normalizeLink));
    }
  };

  const linkUrl = useMemo(() => {
    if (!createdLink) return null;
    const path = getPathname({
      href: {
        pathname: '/events/[seriesSlug]/[editionSlug]/group-upload/[uploadToken]',
        params: { seriesSlug, editionSlug, uploadToken: createdLink.token },
      },
      locale,
    });
    return `${siteUrl}${path === '/' ? '' : path}`;
  }, [createdLink, editionSlug, locale, seriesSlug]);

  const handleCreate = () => {
    startTransition(async () => {
      const result = await createUploadLink({
        editionId,
        name: name.trim() || undefined,
        paymentResponsibility,
        startsAt: toIsoString(startsAt),
        endsAt: toIsoString(endsAt),
        maxBatches: maxBatches ? Number.parseInt(maxBatches, 10) : undefined,
        maxInvites: maxInvites ? Number.parseInt(maxInvites, 10) : undefined,
      });

      if (!result.ok) {
        toast.error(t('errors.create'), { description: result.error });
        return;
      }

      setCreatedLink({ token: result.data.token, tokenPrefix: result.data.tokenPrefix });
      setIsDialogOpen(true);
      setName('');
      setStartsAt('');
      setEndsAt('');
      setMaxBatches('');
      setMaxInvites('');
      await refreshLinks();
    });
  };

  const handleRevoke = (linkId: string) => {
    if (!confirm(t('confirmRevoke'))) return;

    startTransition(async () => {
      const result = await revokeUploadLink({ uploadLinkId: linkId });
      if (!result.ok) {
        toast.error(t('errors.revoke'), { description: result.error });
        return;
      }
      toast.success(t('revokeSuccess'));
      await refreshLinks();
    });
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t('copied'));
    } catch {
      toast.error(t('copyFailed'));
    }
  };

  const statusLabelMap: Record<UploadLinkStatus, string> = {
    ACTIVE: t('status.ACTIVE'),
    NOT_STARTED: t('status.NOT_STARTED'),
    EXPIRED: t('status.EXPIRED'),
    REVOKED: t('status.REVOKED'),
    DISABLED: t('status.DISABLED'),
    MAXED_OUT: t('status.MAXED_OUT'),
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">{t('title')}</h2>
        <p className="text-sm text-muted-foreground">{t('description')}</p>
      </div>

      <div className="rounded-lg border bg-card p-4 shadow-sm space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm">
            <span className="font-medium">{t('fields.name')}</span>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              placeholder={t('fields.namePlaceholder')}
            />
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-medium">{t('fields.paymentResponsibility')}</span>
            <select
              value={paymentResponsibility}
              onChange={(event) => setPaymentResponsibility(event.target.value as typeof PAYMENT_RESPONSIBILITIES[number])}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="self_pay">{t('payment.selfPay')}</option>
              <option value="central_pay">{t('payment.centralPay')}</option>
            </select>
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-medium">{t('fields.startsAt')}</span>
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-medium">{t('fields.endsAt')}</span>
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(event) => setEndsAt(event.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-medium">{t('fields.maxBatches')}</span>
            <input
              type="number"
              min={1}
              value={maxBatches}
              onChange={(event) => setMaxBatches(event.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-medium">{t('fields.maxInvites')}</span>
            <input
              type="number"
              min={1}
              value={maxInvites}
              onChange={(event) => setMaxInvites(event.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </label>
        </div>

        <Button onClick={handleCreate} disabled={isPending}>
          {isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
          {t('create')}
        </Button>
      </div>

      <div className="rounded-lg border bg-card p-4 shadow-sm overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="border-b text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">{t('table.name')}</th>
              <th className="px-3 py-2 text-left">{t('table.status')}</th>
              <th className="px-3 py-2 text-left">{t('table.usage')}</th>
              <th className="px-3 py-2 text-left">{t('table.token')}</th>
              <th className="px-3 py-2 text-left">{t('table.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {links.map((link) => (
              <tr key={link.id}>
                <td className="px-3 py-2">
                  <div className="font-medium">{link.name || t('table.unnamed')}</div>
                  <div className="text-xs text-muted-foreground">{new Date(link.createdAt).toLocaleString()}</div>
                </td>
                <td className="px-3 py-2">
                  <span className={cn('rounded-full px-2 py-1 text-xs font-semibold uppercase tracking-wide', STATUS_STYLES[link.status] ?? 'bg-muted text-muted-foreground')}>
                    {statusLabelMap[link.status] ?? link.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {t('table.usageCounts', { batches: link.batchCount, invites: link.inviteCount })}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{link.tokenPrefix}…</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-2">
                    {link.status === 'ACTIVE' ? (
                      <Button size="sm" variant="outline" onClick={() => handleRevoke(link.id)} disabled={isPending}>
                        <Trash2 className="h-3 w-3 mr-1" />
                        {t('revoke')}
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('createdTitle')}</DialogTitle>
            <DialogDescription>{t('createdDescription')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <div className="rounded-md border bg-muted/40 p-3">
              <div className="text-xs text-muted-foreground">{t('tokenLabel')}</div>
              <div className="font-mono break-all">{createdLink?.token}</div>
            </div>
            {linkUrl ? (
              <div className="rounded-md border bg-muted/40 p-3">
                <div className="text-xs text-muted-foreground">{t('linkLabel')}</div>
                <div className="break-all">{linkUrl}</div>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            {createdLink?.token ? (
              <Button variant="outline" onClick={() => handleCopy(createdLink.token)}>
                <Copy className="h-4 w-4 mr-2" />
                {t('copyToken')}
              </Button>
            ) : null}
            {linkUrl ? (
              <Button variant="outline" onClick={() => handleCopy(linkUrl)}>
                <Link2 className="h-4 w-4 mr-2" />
                {t('copyLink')}
              </Button>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
