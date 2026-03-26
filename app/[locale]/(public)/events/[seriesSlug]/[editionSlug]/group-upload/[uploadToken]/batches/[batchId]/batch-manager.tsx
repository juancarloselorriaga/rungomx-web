'use client';

import { upload } from '@vercel/blob/client';

import {
  publicFieldClassName,
  publicMutedPanelClassName,
  publicSurfaceBodyClassName,
  publicSurfaceClassName,
  publicSurfaceHeaderClassName,
  publicStatusPillClassName,
  publicSummaryItemClassName,
} from '@/components/common/public-form-styles';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { IconTooltipButton } from '@/components/ui/icon-tooltip-button';
import { useRouter } from '@/i18n/navigation';
import {
  cancelBatch,
  cancelInvite,
  extendInviteHold,
  reissueInviteForBatchRow,
  reserveInvitesForBatch,
  resendInvite,
  rotateInviteToken,
  sendInvitesForBatch,
  updateInviteEmail,
  uploadBatchViaLink,
} from '@/lib/events/group-upload/actions';
import { EVENT_MEDIA_BLOB_PREFIX } from '@/lib/events/media/constants';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  Check,
  FileUp,
  Loader2,
  Mail,
  Pencil,
  RefreshCw,
  RotateCw,
  Send,
  Trash2,
  X,
  Timer,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';

type InviteStatus = 'draft' | 'sent' | 'claimed' | 'cancelled' | 'expired' | 'superseded';

type BatchRowInvite = {
  id: string;
  status: InviteStatus;
  sendCount: number;
  lastSentAt: string | null;
  expiresAt: string | null;
  email: string;
};

type BatchRow = {
  id: string;
  rowIndex: number;
  firstName: string;
  lastName: string;
  email: string;
  dateOfBirth: string | null;
  validationErrors: string[];
  createdRegistrationId: string | null;
  invite: BatchRowInvite | null;
};

type BatchStatus = 'uploaded' | 'validated' | 'processed' | 'failed';

type BatchInfo = {
  id: string;
  status: BatchStatus;
  createdAt: string;
  processedAt: string | null;
  distanceLabel: string;
  paymentResponsibility: 'self_pay' | 'central_pay';
};

type BatchManagerProps = {
  uploadToken: string;
  event: {
    seriesSlug: string;
    editionSlug: string;
    seriesName: string;
    editionLabel: string;
  };
  batch: BatchInfo;
  rows: BatchRow[];
};

const STATUS_STYLES: Record<BatchStatus, string> = {
  uploaded: 'bg-muted text-muted-foreground',
  validated: 'bg-blue-500/10 text-blue-700',
  processed: 'bg-emerald-500/10 text-emerald-700',
  failed: 'bg-red-500/10 text-red-600',
};

export function GroupUploadBatchManager({ uploadToken, event, batch, rows }: BatchManagerProps) {
  const t = useTranslations('pages.events.groupUpload');
  const locale = useLocale();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [isPending, startTransition] = useTransition();
  const [editingInviteId, setEditingInviteId] = useState<string | null>(null);
  const [editedEmail, setEditedEmail] = useState('');

  const hasRows = rows.length > 0;
  const pendingRows = rows.filter(
    (row) => row.validationErrors.length === 0 && !row.createdRegistrationId,
  );
  const draftInvites = rows.filter((row) => row.invite?.status === 'draft');
  const sentInvites = rows.filter((row) => row.invite?.status === 'sent');
  const claimedInvites = rows.filter((row) => row.invite?.status === 'claimed');

  const errorLabelMap = useMemo(
    () => ({
      MISSING_FIRST_NAME: t('errors.row.MISSING_FIRST_NAME'),
      MISSING_LAST_NAME: t('errors.row.MISSING_LAST_NAME'),
      MISSING_EMAIL: t('errors.row.MISSING_EMAIL'),
      INVALID_EMAIL: t('errors.row.INVALID_EMAIL'),
      INVALID_DOB: t('errors.row.INVALID_DOB'),
      DUPLICATE_EMAIL_IN_FILE: t('errors.row.DUPLICATE_EMAIL_IN_FILE'),
      DOB_MISMATCH: t('errors.row.DOB_MISMATCH'),
      INVALID_ROW: t('errors.row.INVALID_ROW'),
      INVITE_LIMIT_REACHED: t('errors.row.INVITE_LIMIT_REACHED'),
      EXISTING_ACTIVE_INVITE: t('errors.row.EXISTING_ACTIVE_INVITE'),
      ALREADY_REGISTERED: t('errors.row.ALREADY_REGISTERED'),
      SOLD_OUT: t('errors.row.SOLD_OUT'),
    }),
    [t],
  );

  const errorLabel = (code: string) => errorLabelMap[code as keyof typeof errorLabelMap] ?? code;

  const batchStatusLabelMap: Record<BatchStatus, string> = {
    uploaded: t('batch.status.uploaded'),
    validated: t('batch.status.validated'),
    processed: t('batch.status.processed'),
    failed: t('batch.status.failed'),
  };

  const inviteStatusLabelMap: Record<InviteStatus, string> = {
    draft: t('rows.status.draft'),
    sent: t('rows.status.sent'),
    claimed: t('rows.status.claimed'),
    cancelled: t('rows.status.cancelled'),
    expired: t('rows.status.expired'),
    superseded: t('rows.status.expired'),
  };

  const formatDateTime = (value: string | null) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
      date,
    );
  };

  const canUpload = !hasRows;
  const canReserve = pendingRows.length > 0;
  const canSendInvites = batch.status === 'processed' && draftInvites.length > 0;

  const handleUpload = () => {
    if (!file) {
      toast.error(t('errors.noFile'));
      return;
    }

    startTransition(async () => {
      try {
        const safeFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const pathname = `${EVENT_MEDIA_BLOB_PREFIX}/group-upload/${batch.id}/${Date.now()}-${safeFilename}`;

        const blob = await upload(pathname, file, {
          access: 'public',
          handleUploadUrl: '/api/events/media',
          clientPayload: JSON.stringify({
            purpose: 'group-upload-batch',
            uploadToken,
            batchId: batch.id,
          }),
        });

        const result = await uploadBatchViaLink({
          uploadToken,
          batchId: batch.id,
          mediaUrl: blob.url,
        });

        if (!result.ok) {
          toast.error(t('errors.upload'), { description: result.error });
          return;
        }

        toast.success(t('upload.success'), {
          description: t('upload.rowsLoaded', { count: result.data.rowCount }),
        });
        setFile(null);
        router.refresh();
      } catch (error) {
        toast.error(t('errors.upload'));
        throw error;
      }
    });
  };

  const handleReserveInvites = () => {
    startTransition(async () => {
      const result = await reserveInvitesForBatch({
        uploadToken,
        batchId: batch.id,
        locale,
      });

      if (!result.ok) {
        toast.error(t('errors.reserve'), { description: result.error });
        return;
      }

      toast.success(t('reserve.success'), {
        description: t('reserve.summary', {
          processed: result.data.processed,
          succeeded: result.data.succeeded,
          failed: result.data.failed,
          remaining: result.data.remaining,
        }),
      });

      if (result.data.groupDiscountPercentOff) {
        toast.success(
          t('reserve.discountApplied', { percentOff: result.data.groupDiscountPercentOff }),
        );
      }

      router.refresh();
    });
  };

  const handleSendInvites = () => {
    startTransition(async () => {
      const result = await sendInvitesForBatch({
        uploadToken,
        batchId: batch.id,
      });

      if (!result.ok) {
        toast.error(t('errors.sendInvites'), {
          description:
            result.code === 'BATCH_NOT_PROCESSED'
              ? t('sendInvites.errors.batchNotProcessed')
              : result.error,
        });
        return;
      }

      toast.success(t('sendInvites.success'), {
        description: t('sendInvites.summary', {
          sent: result.data.sent,
          skipped: result.data.skipped,
        }),
      });
      router.refresh();
    });
  };

  const handleResendInvite = (inviteId: string) => {
    startTransition(async () => {
      const result = await resendInvite({ uploadToken, inviteId });
      if (!result.ok) {
        toast.error(t('errors.resend'), { description: result.error });
        return;
      }
      toast.success(t('resend.success'));
      router.refresh();
    });
  };

  const handleRotateInvite = (inviteId: string) => {
    startTransition(async () => {
      const result = await rotateInviteToken({ uploadToken, inviteId });
      if (!result.ok) {
        toast.error(t('errors.rotate'), { description: result.error });
        return;
      }
      toast.success(t('rotate.success'));
      router.refresh();
    });
  };

  const handleUpdateEmail = (inviteId: string) => {
    if (!editedEmail.trim()) {
      toast.error(t('errors.emailRequired'));
      return;
    }

    startTransition(async () => {
      const result = await updateInviteEmail({ uploadToken, inviteId, email: editedEmail.trim() });
      if (!result.ok) {
        toast.error(t('errors.updateEmail'), { description: result.error });
        return;
      }
      toast.success(t('updateEmail.success'));
      setEditingInviteId(null);
      setEditedEmail('');
      router.refresh();
    });
  };

  const handleCancelInvite = (inviteId: string) => {
    if (!confirm(t('cancelInvite.confirm'))) return;

    startTransition(async () => {
      const result = await cancelInvite({ uploadToken, inviteId });
      if (!result.ok) {
        toast.error(t('errors.cancelInvite'), { description: result.error });
        return;
      }
      toast.success(t('cancelInvite.success'));
      router.refresh();
    });
  };

  const handleCancelBatch = () => {
    if (!confirm(t('cancelBatch.confirm'))) return;

    startTransition(async () => {
      const result = await cancelBatch({ uploadToken, batchId: batch.id });
      if (!result.ok) {
        toast.error(t('errors.cancelBatch'), { description: result.error });
        return;
      }
      toast.success(t('cancelBatch.success'));
      router.refresh();
    });
  };

  const handleReissueInvite = (batchRowId: string) => {
    startTransition(async () => {
      const result = await reissueInviteForBatchRow({ uploadToken, batchRowId, locale });

      if (!result.ok) {
        toast.error(t('errors.reissue'), { description: result.error });
        return;
      }

      toast.success(t('reissue.success'));
      router.refresh();
    });
  };

  const handleExtendHold = (inviteId: string) => {
    startTransition(async () => {
      const result = await extendInviteHold({ uploadToken, inviteId });

      if (!result.ok) {
        toast.error(t('errors.extendHold'), { description: result.error });
        return;
      }

      toast.success(t('extendHold.success'), {
        description: formatDateTime(result.data.expiresAt),
      });
      router.refresh();
    });
  };

  const summary = useMemo(() => {
    return {
      total: rows.length,
      errors: rows.filter((row) => row.validationErrors.length > 0).length,
      reserved: rows.filter((row) => row.createdRegistrationId).length,
      draft: draftInvites.length,
      sent: sentInvites.length,
      claimed: claimedInvites.length,
    };
  }, [rows, draftInvites.length, sentInvites.length, claimedInvites.length]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="grid gap-6 xl:grid-cols-[minmax(18rem,0.82fr)_minmax(0,1.18fr)] xl:items-start">
        <aside className="space-y-4 xl:sticky xl:top-24">
          <section className={publicSurfaceClassName}>
            <div className={publicSurfaceBodyClassName}>
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  RunGoMX
                </p>
                <span
                  className={cn(
                    publicStatusPillClassName,
                    STATUS_STYLES[batch.status] ?? STATUS_STYLES.uploaded,
                  )}
                >
                  {batchStatusLabelMap[batch.status] ?? batch.status}
                </span>
              </div>

              <div className="mt-6 space-y-3">
                <h1 className="font-display text-[clamp(2rem,4.8vw,3.15rem)] font-medium leading-[0.9] tracking-[-0.04em] text-foreground">
                  {t('batch.title')}
                </h1>
                <p className="text-sm leading-7 text-muted-foreground sm:text-[0.98rem]">
                  {event.seriesName} {event.editionLabel} · {batch.distanceLabel}
                </p>
              </div>

              <div className="mt-8 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                <div className={publicSummaryItemClassName}>
                  <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    {t('batch.summary.total')}
                  </p>
                  <p className="mt-2 font-display text-[1.9rem] font-medium tracking-[-0.03em] text-foreground">
                    {summary.total}
                  </p>
                </div>
                <div className={publicSummaryItemClassName}>
                  <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    {t('batch.summary.reserved')}
                  </p>
                  <p className="mt-2 font-display text-[1.9rem] font-medium tracking-[-0.03em] text-foreground">
                    {summary.reserved}
                  </p>
                </div>
                <div className={publicSummaryItemClassName}>
                  <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    {t('batch.summary.sent')}
                  </p>
                  <p className="mt-2 font-display text-[1.9rem] font-medium tracking-[-0.03em] text-foreground">
                    {summary.sent}
                  </p>
                </div>
              </div>
            </div>
          </section>

          <div className={cn(publicMutedPanelClassName, 'space-y-2 p-4 sm:p-5')}>
            <p className="text-sm font-medium text-foreground">
              {t('reserve.pending', { count: pendingRows.length })}
            </p>
            <p className="text-sm leading-7 text-muted-foreground">
              {t('sendInvites.pending', { count: draftInvites.length })}
            </p>
            {!canSendInvites && draftInvites.length > 0 && batch.status !== 'processed' ? (
              <p className="text-xs leading-6 text-muted-foreground">
                {t('sendInvites.requiresProcessed')}
              </p>
            ) : null}
          </div>
        </aside>

        <div className="space-y-5">
          <section className={publicSurfaceClassName}>
            <div className={publicSurfaceHeaderClassName}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="font-display text-[clamp(1.65rem,2.8vw,2.15rem)] font-medium leading-[0.96] tracking-[-0.03em] text-foreground">
                    {t('upload.title')}
                  </h2>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">
                    {t('upload.description')}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => router.refresh()} disabled={isPending}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    {t('actions.refresh')}
                  </Button>
                  <Button variant="outline" onClick={handleCancelBatch} disabled={isPending}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t('cancelBatch.action')}
                  </Button>
                </div>
              </div>
            </div>

            <div className={cn(publicSurfaceBodyClassName, 'space-y-4')}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <input
                  type="file"
                  accept=".csv,.xlsx"
                  className={cn(
                    publicFieldClassName,
                    'h-auto py-3 file:mr-4 file:rounded-full file:border-0 file:bg-foreground file:px-3.5 file:py-1.5 file:text-xs file:font-semibold file:text-background hover:file:bg-foreground/90',
                  )}
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  disabled={isPending || !canUpload}
                />
                <Button
                  onClick={handleUpload}
                  disabled={isPending || !canUpload}
                  className="lg:min-w-[12rem]"
                >
                  {isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <FileUp className="mr-2 h-4 w-4" />
                  )}
                  {t('upload.action')}
                </Button>
              </div>

              {!canUpload ? (
                <div className={cn(publicMutedPanelClassName, 'p-4 sm:p-5')}>
                  <p className="text-sm leading-7 text-muted-foreground">
                    {t('upload.alreadyUploaded')}
                  </p>
                </div>
              ) : null}
            </div>
          </section>

          <section className={publicSurfaceClassName}>
            <div className={publicSurfaceHeaderClassName}>
              <h2 className="font-display text-[clamp(1.65rem,2.8vw,2.15rem)] font-medium leading-[0.96] tracking-[-0.03em] text-foreground">
                {t('reserve.title')}
              </h2>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">
                {t('reserve.description')}
              </p>
            </div>

            <div className={cn(publicSurfaceBodyClassName, 'space-y-4')}>
              <div className="flex flex-wrap gap-3">
                <Button onClick={handleReserveInvites} disabled={isPending || !canReserve}>
                  {isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <AlertTriangle className="mr-2 h-4 w-4" />
                  )}
                  {t('reserve.action')}
                </Button>
                <Button onClick={handleSendInvites} disabled={isPending || !canSendInvites}>
                  {isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  {t('sendInvites.action')}
                </Button>
              </div>

              <div className={cn(publicMutedPanelClassName, 'space-y-1 p-4 sm:p-5')}>
                <p className="text-sm font-medium text-foreground">
                  {t('reserve.pending', { count: pendingRows.length })}
                </p>
                <p className="text-sm leading-7 text-muted-foreground">
                  {t('sendInvites.pending', { count: draftInvites.length })}
                </p>
              </div>
            </div>
          </section>

          <section className={publicSurfaceClassName}>
            <div className={publicSurfaceHeaderClassName}>
              <h2 className="font-display text-[clamp(1.65rem,2.8vw,2.15rem)] font-medium leading-[0.96] tracking-[-0.03em] text-foreground">
                {t('rows.title')}
              </h2>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">
                {t('rows.description')}
              </p>
            </div>

            <div className={cn(publicSurfaceBodyClassName, 'space-y-4')}>
              <div className="overflow-hidden rounded-[1.5rem] border border-border/45">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-[color-mix(in_oklch,var(--background)_86%,var(--background-surface)_14%)] text-xs uppercase tracking-[0.14em] text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 text-left">#</th>
                        <th className="px-4 py-3 text-left">{t('rows.headers.name')}</th>
                        <th className="px-4 py-3 text-left">{t('rows.headers.email')}</th>
                        <th className="px-4 py-3 text-left">{t('rows.headers.status')}</th>
                        <th className="px-4 py-3 text-left">{t('rows.headers.actions')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/55">
                      {rows.map((row) => {
                        const isEditing = editingInviteId === row.invite?.id;
                        const statusLabel = row.validationErrors.length
                          ? t('rows.status.invalid')
                          : row.invite
                            ? (inviteStatusLabelMap[row.invite.status] ?? row.invite.status)
                            : row.createdRegistrationId
                              ? t('rows.status.reserved')
                              : t('rows.status.pending');

                        return (
                          <tr
                            key={row.id}
                            className={cn(
                              'align-top',
                              row.validationErrors.length && 'bg-destructive/5',
                            )}
                          >
                            <td className="px-4 py-4 text-muted-foreground">{row.rowIndex}</td>
                            <td className="px-4 py-4">
                              <div className="font-medium text-foreground">
                                {row.firstName} {row.lastName}
                              </div>
                              {row.dateOfBirth ? (
                                <div className="mt-1 text-xs text-muted-foreground">
                                  {row.dateOfBirth}
                                </div>
                              ) : null}
                            </td>
                            <td className="px-4 py-4">
                              <div className="text-foreground">{row.email}</div>
                              {row.invite ? (
                                <div className="mt-1 text-xs leading-6 text-muted-foreground">
                                  {t('rows.inviteDetails', {
                                    count: row.invite.sendCount,
                                    lastSent: formatDateTime(row.invite.lastSentAt),
                                  })}
                                </div>
                              ) : null}
                            </td>
                            <td className="px-4 py-4">
                              <div
                                className={cn(
                                  'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium',
                                  row.validationErrors.length
                                    ? 'bg-destructive/10 text-destructive'
                                    : row.invite?.status === 'claimed'
                                      ? 'bg-emerald-500/10 text-emerald-700'
                                      : row.invite?.status === 'sent'
                                        ? 'bg-blue-500/10 text-blue-700'
                                        : row.createdRegistrationId
                                          ? 'bg-primary/10 text-primary'
                                          : 'bg-muted text-muted-foreground',
                                )}
                              >
                                {statusLabel}
                              </div>
                              {row.validationErrors.length ? (
                                <div className="mt-2 text-xs leading-6 text-destructive">
                                  {row.validationErrors
                                    .map((error) => errorLabel(error))
                                    .join(', ')}
                                </div>
                              ) : null}
                            </td>
                            <td className="px-4 py-4">
                              {row.invite ? (
                                <div className="flex flex-col gap-2">
                                  {isEditing ? (
                                    <div className="flex flex-col gap-2">
                                      <FormField label={t('rows.headers.email')} error={null}>
                                        <input
                                          type="email"
                                          className={cn(publicFieldClassName, 'h-10 text-xs')}
                                          value={editedEmail}
                                          onChange={(event) => setEditedEmail(event.target.value)}
                                        />
                                      </FormField>
                                      <div className="flex items-center gap-1">
                                        <IconTooltipButton
                                          size="icon"
                                          variant="ghost"
                                          label={t('updateEmail.action')}
                                          onClick={() => handleUpdateEmail(row.invite!.id)}
                                          disabled={isPending}
                                        >
                                          <Check className="h-4 w-4" />
                                        </IconTooltipButton>
                                        <IconTooltipButton
                                          size="icon"
                                          variant="ghost"
                                          label={t('actions.cancel')}
                                          onClick={() => setEditingInviteId(null)}
                                        >
                                          <X className="h-4 w-4" />
                                        </IconTooltipButton>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="flex flex-wrap gap-2">
                                      {row.invite.status === 'sent' ? (
                                        <IconTooltipButton
                                          variant="ghost"
                                          size="icon"
                                          label={t('resend.action')}
                                          onClick={() => handleResendInvite(row.invite!.id)}
                                          disabled={isPending}
                                        >
                                          <Mail className="h-4 w-4" />
                                        </IconTooltipButton>
                                      ) : null}
                                      {row.invite.status === 'claimed' ? (
                                        <IconTooltipButton
                                          variant="ghost"
                                          size="icon"
                                          label={t('extendHold.action')}
                                          onClick={() => handleExtendHold(row.invite!.id)}
                                          disabled={isPending}
                                        >
                                          <Timer className="h-4 w-4" />
                                        </IconTooltipButton>
                                      ) : null}
                                      {['draft', 'sent'].includes(row.invite.status) ? (
                                        <IconTooltipButton
                                          variant="ghost"
                                          size="icon"
                                          label={t('rotate.action')}
                                          onClick={() => handleRotateInvite(row.invite!.id)}
                                          disabled={isPending}
                                        >
                                          <RotateCw className="h-4 w-4" />
                                        </IconTooltipButton>
                                      ) : null}
                                      {['draft', 'sent'].includes(row.invite.status) ? (
                                        <IconTooltipButton
                                          variant="ghost"
                                          size="icon"
                                          label={t('updateEmail.action')}
                                          onClick={() => {
                                            setEditingInviteId(row.invite!.id);
                                            setEditedEmail(row.invite!.email);
                                          }}
                                          disabled={isPending}
                                        >
                                          <Pencil className="h-4 w-4" />
                                        </IconTooltipButton>
                                      ) : null}
                                      {['draft', 'sent'].includes(row.invite.status) ? (
                                        <IconTooltipButton
                                          variant="ghost"
                                          size="icon"
                                          label={t('cancelInvite.action')}
                                          onClick={() => handleCancelInvite(row.invite!.id)}
                                          disabled={isPending}
                                          className="text-destructive hover:text-destructive"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </IconTooltipButton>
                                      ) : null}
                                    </div>
                                  )}
                                </div>
                              ) : row.createdRegistrationId ? (
                                <IconTooltipButton
                                  variant="ghost"
                                  size="icon"
                                  label={t('reissue.action')}
                                  onClick={() => handleReissueInvite(row.id)}
                                  disabled={isPending}
                                >
                                  <RefreshCw className="h-4 w-4" />
                                </IconTooltipButton>
                              ) : (
                                <span className="text-xs text-muted-foreground">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
