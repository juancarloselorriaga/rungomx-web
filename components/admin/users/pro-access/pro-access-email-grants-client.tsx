'use client';

import {
  disablePendingGrantAction,
  enablePendingGrantAction,
  searchPendingGrantOptionsAction,
  searchUserEmailOptionsAction,
} from '@/app/actions/billing-admin';
import { EmailGrantCreateDialog } from '@/components/admin/users/pro-access/email-grant-create-dialog';
import { Badge } from '@/components/common/badge';
import { EntityListView } from '@/components/list-view/entity-list-view';
import type { ListViewColumn } from '@/components/list-view/types';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { IconTooltipButton } from '@/components/ui/icon-tooltip-button';
import { SearchablePicker } from '@/components/ui/searchable-picker';
import { Spinner } from '@/components/ui/spinner';
import { Form, FormError, useForm } from '@/lib/forms';
import { CheckCircle2, Copy, Pause, Play, Plus } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import type { FormEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

type PendingGrantManageFormValues = {
  email: string;
};

type PendingGrantSearchOption = {
  id: string;
  isActive: boolean;
  claimedAt: string | null;
  createdAt: string;
  grantDurationDays: number | null;
  grantFixedEndsAt: string | null;
};

function looksLikeEmail(value: string) {
  const trimmed = value.trim();
  const at = trimmed.indexOf('@');
  if (at <= 0) return false;
  const domain = trimmed.slice(at + 1);
  return domain.includes('.');
}

export function ProAccessEmailGrantsClient() {
  const tPage = useTranslations('pages.adminProAccess.page.emailGrants');
  const t = useTranslations('pages.adminProAccess.billing');
  const tCommon = useTranslations('common');
  const format = useFormatter();

  const [latestPendingGrantId, setLatestPendingGrantId] = useState<string | null>(null);
  const [manageResults, setManageResults] = useState<PendingGrantSearchOption[]>([]);
  const [togglingGrantId, setTogglingGrantId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const managePendingForm = useForm<PendingGrantManageFormValues, { options: PendingGrantSearchOption[] }>({
    defaultValues: { email: '' },
    onSubmit: async (values) => {
      const email = values.email.trim();

      if (!looksLikeEmail(email)) {
        return {
          ok: false,
          error: 'INVALID_INPUT',
          fieldErrors: { email: [t('pendingGrant.manage.errors.invalidEmail')] },
          message: t('pendingGrant.manage.errors.invalidEmail'),
        };
      }

      const result = await searchPendingGrantOptionsAction({ query: email, limit: 20 });
      if (!result.ok) {
        const message =
          result.error === 'UNAUTHENTICATED'
            ? t('pendingGrant.errors.unauthenticated')
            : result.error === 'FORBIDDEN'
              ? t('pendingGrant.errors.forbidden')
              : result.error === 'INVALID_INPUT'
                ? t('pendingGrant.errors.invalidInput')
                : t('pendingGrant.errors.generic');
        return { ok: false, error: result.error, message };
      }
      return result;
    },
    onSuccess: (data) => {
      setManageResults(data.options);
    },
  });

  const manageEmailField = managePendingForm.register('email');

  const lastSearchedEmail = useRef<string | null>(null);
  const manageEmailValue = managePendingForm.values.email;
  const manageIsSubmitting = managePendingForm.isSubmitting;
  const manageHandleSubmit = managePendingForm.handleSubmit;

  const loadUserEmailOptions = useCallback(async (query: string) => {
    const result = await searchUserEmailOptionsAction({ query });
    if (!result.ok) return [];

    return result.data.options.map((option) => ({
      value: option.email,
      label: option.email,
      description: option.name,
    }));
  }, []);

  const refreshManageResults = useCallback(
    async (overrideEmail?: string) => {
      const email = (overrideEmail ?? managePendingForm.values.email).trim();
      if (!looksLikeEmail(email)) return;

      const result = await searchPendingGrantOptionsAction({ query: email, limit: 20 });
      if (!result.ok) {
        toast.error(t('pendingGrant.errors.generic'));
        return;
      }

      setManageResults(result.data.options);
    },
    [managePendingForm.values.email, t],
  );

  useEffect(() => {
    const email = manageEmailValue.trim();
    if (!email) {
      lastSearchedEmail.current = null;
      return;
    }

    if (!looksLikeEmail(email)) {
      return;
    }

    if (manageIsSubmitting) return;
    if (lastSearchedEmail.current === email) return;

    const timeout = window.setTimeout(() => {
      if (manageIsSubmitting) return;
      lastSearchedEmail.current = email;
      manageHandleSubmit(
        { preventDefault: () => {} } as unknown as FormEvent<HTMLFormElement>,
        { email },
      );
    }, 400);

    return () => window.clearTimeout(timeout);
  }, [manageEmailValue, manageHandleSubmit, manageIsSubmitting]);

  const toggleGrant = useCallback(
    async (grant: PendingGrantSearchOption) => {
      if (grant.claimedAt) return;

      setTogglingGrantId(grant.id);

      const result = grant.isActive
        ? await disablePendingGrantAction({ pendingGrantId: grant.id })
        : await enablePendingGrantAction({ pendingGrantId: grant.id });

      if (!result.ok) {
        const message =
          result.error === 'UNAUTHENTICATED'
            ? t('pendingGrant.errors.unauthenticated')
            : result.error === 'FORBIDDEN'
              ? t('pendingGrant.errors.forbidden')
              : result.error === 'INVALID_INPUT'
                ? t('pendingGrant.errors.invalidInput')
                : t('pendingGrant.errors.generic');
        toast.error(message);
        setTogglingGrantId(null);
        return;
      }

      toast.success(
        grant.isActive ? t('pendingGrant.success.disabled') : t('pendingGrant.success.enabled'),
      );
      await refreshManageResults();
      setTogglingGrantId(null);
    },
    [refreshManageResults, t],
  );

  const copyPendingGrantId = useCallback(
    async (pendingGrantId: string) => {
      try {
        await navigator.clipboard.writeText(pendingGrantId);
        toast.success(t('pendingGrant.success.copiedId'));
      } catch {
        toast.error(t('pendingGrant.errors.copyFailed'));
      }
    },
    [t],
  );

  const manageColumns = useMemo(() => {
    const formatUtcLabel = (value: string) =>
      `${format.dateTime(new Date(value), {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'UTC',
      })} ${t('status.utc')}`;

    return [
      {
        key: 'grant',
        header: t('pendingGrant.manage.table.columns.grant'),
        cell: (grant) => {
          const summary = grant.grantDurationDays
            ? t('pendingGrant.search.summary.duration', { days: grant.grantDurationDays })
            : grant.grantFixedEndsAt
              ? t('pendingGrant.search.summary.fixedEnd', { endsAt: formatUtcLabel(grant.grantFixedEndsAt) })
              : grant.id;

          return (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{summary}</p>
              <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{grant.id}</p>
            </div>
          );
        },
      },
      {
        key: 'status',
        header: t('pendingGrant.manage.table.columns.status'),
        cell: (grant) => (
          <div className="flex flex-wrap items-center gap-1">
            {grant.isActive ? (
              <Badge variant="green" size="sm">
                {t('pendingGrant.search.badges.active')}
              </Badge>
            ) : (
              <Badge variant="outline" size="sm">
                {t('pendingGrant.search.badges.inactive')}
              </Badge>
            )}
            {grant.claimedAt ? (
              <Badge variant="outline" size="sm">
                {t('pendingGrant.search.badges.claimed')}
              </Badge>
            ) : null}
          </div>
        ),
      },
      {
        key: 'created',
        header: t('pendingGrant.manage.table.columns.created'),
        cell: (grant) => (
          <span className="text-sm text-muted-foreground" suppressHydrationWarning>
            {formatUtcLabel(grant.createdAt)}
          </span>
        ),
      },
      {
        key: 'actions',
        header: t('pendingGrant.manage.table.columns.actions'),
        align: 'right',
        cell: (grant) => (
          <div className="flex items-center justify-end gap-1">
            {grant.claimedAt ? (
              <IconTooltipButton
                type="button"
                variant="ghost"
                size="icon"
                label={t('pendingGrant.search.badges.claimed')}
                disabled
              >
                <CheckCircle2 className="size-4" />
              </IconTooltipButton>
            ) : (
              <IconTooltipButton
                type="button"
                variant="ghost"
                size="icon"
                label={
                  grant.isActive
                    ? t('pendingGrant.manage.actions.disable')
                    : t('pendingGrant.manage.actions.enable')
                }
                disabled={togglingGrantId === grant.id}
                onClick={() => toggleGrant(grant)}
              >
                {togglingGrantId === grant.id ? (
                  <Spinner className="size-4" />
                ) : grant.isActive ? (
                  <Pause className="size-4" />
                ) : (
                  <Play className="size-4" />
                )}
              </IconTooltipButton>
            )}

            <IconTooltipButton
              type="button"
              variant="ghost"
              size="icon"
              label={t('pendingGrant.manage.table.actions.copyId')}
              onClick={() => copyPendingGrantId(grant.id)}
              disabled={togglingGrantId === grant.id}
            >
              <Copy className="size-4" />
            </IconTooltipButton>
          </div>
        ),
      },
    ] satisfies Array<ListViewColumn<PendingGrantSearchOption, string>>;
  }, [copyPendingGrantId, format, t, toggleGrant, togglingGrantId]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary/80">
            {tPage('sectionLabel')}
          </p>
          <div className="space-y-1">
            <h1 className="text-3xl font-bold leading-tight">{tPage('title')}</h1>
            <p className="text-muted-foreground">{tPage('description')}</p>
          </div>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="shrink-0">
          <Plus className="size-4" />
          {t('pendingGrant.actions.create')}
        </Button>
      </div>

      {latestPendingGrantId ? (
        <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {t('pendingGrant.latestLabel')}
          </p>
          <p className="font-medium text-foreground">{latestPendingGrantId}</p>
        </div>
      ) : null}

      <section className="space-y-5 rounded-lg border bg-card p-5 shadow-sm">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('pendingGrant.sectionLabel')}
          </p>
          <h2 className="text-lg font-semibold">{t('pendingGrant.manage.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('pendingGrant.manage.description')}</p>
        </div>

        <Form form={managePendingForm} className="space-y-4">
          <FormError />
          <FormField
            label={t('pendingGrant.manage.fields.email')}
            required
            error={managePendingForm.errors.email}
          >
            <SearchablePicker
              value={manageEmailField.value}
              onChangeAction={(value) => {
                setManageResults([]);
                lastSearchedEmail.current = null;
                manageEmailField.onChange(value);
              }}
              onSelectOptionAction={(option) => {
                setManageResults([]);
                lastSearchedEmail.current = option.value;
                managePendingForm.handleSubmit(
                  { preventDefault: () => {} } as unknown as FormEvent<HTMLFormElement>,
                  { email: option.value },
                );
              }}
              loadOptionsAction={loadUserEmailOptions}
              inputType="email"
              placeholder={t('pendingGrant.manage.fields.emailPlaceholder')}
              emptyLabel={tCommon('searchPicker.noResults')}
              errorLabel={tCommon('searchPicker.loadFailed')}
              disabled={managePendingForm.isSubmitting}
              invalid={Boolean(managePendingForm.errors.email)}
              name={manageEmailField.name as string}
              loadingLabel={tCommon('loading')}
            />
          </FormField>

          <div className="space-y-3 border-t border-border/70 pt-4">
            {manageEmailField.value.trim() ? (
              managePendingForm.isSubmitting ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Spinner className="size-4" />
                  <span>{tCommon('loading')}</span>
                </div>
              ) : manageResults.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('pendingGrant.manage.emptyResults')}</p>
              ) : (
                <EntityListView
                  items={manageResults}
                  getRowIdAction={(grant) => grant.id}
                  columns={manageColumns}
                  rowPadding="py-2"
                  minWidthClassName="min-w-[560px]"
                />
              )
            ) : (
              <p className="text-sm text-muted-foreground">{t('pendingGrant.manage.emptyState')}</p>
            )}
          </div>
        </Form>
      </section>

      <EmailGrantCreateDialog
        open={createOpen}
        onOpenChangeAction={setCreateOpen}
        onSuccessAction={(pendingGrantId) => {
          setLatestPendingGrantId(pendingGrantId);
          refreshManageResults();
        }}
      />
    </div>
  );
}
