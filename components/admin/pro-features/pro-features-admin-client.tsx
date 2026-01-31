'use client';

import { listProFeatureConfigsAdminAction, updateProFeatureConfigAdminAction, getProFeatureUsageReportAdminAction } from '@/app/actions/pro-features-admin';
import type { ProFeatureAdminSummary, ProFeatureUsageReport } from '@/app/actions/pro-features-admin';
import { Badge, type BadgeProps } from '@/components/common/badge';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { FormField } from '@/components/ui/form-field';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Form, FormError, useForm } from '@/lib/forms';
import type { ProFeatureKey } from '@/lib/pro-features/catalog';
import type { ProFeatureEnforcement, ProFeatureStatus, ProFeatureVisibility } from '@/lib/pro-features/types';
import { cn } from '@/lib/utils';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

type VisibilityOverrideValue = '' | 'locked' | 'hidden';
type FeatureLabelKey = `features.${ProFeatureKey}.${'label' | 'description'}`;
type FeatureStatusKey = `features.status.${ProFeatureStatus}`;
type FeatureVisibilityKey = `features.visibility.${ProFeatureVisibility | 'default'}`;
type FeatureEnforcementKey = `features.enforcement.${ProFeatureEnforcement}`;
type ProFeatureConfigFormValues = {
  enabled: boolean;
  visibilityOverride: VisibilityOverrideValue;
  notes: string;
  reason: string;
};

export function ProFeaturesAdminClient() {
  const tPage = useTranslations('pages.adminProFeatures');
  const tCommon = useTranslations('common');
  const locale = useLocale();

  const [features, setFeatures] = useState<ProFeatureAdminSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [report, setReport] = useState<ProFeatureUsageReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportRange, setReportRange] = useState<{ from: string; to: string }>({ from: '', to: '' });

  const loadFeatures = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    const result = await listProFeatureConfigsAdminAction();

    if (!result.ok) {
      setLoadError(result.error);
      setLoading(false);
      return;
    }

    setFeatures(result.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load on mount updates local UI state.
    void loadFeatures();
  }, [loadFeatures]);

  const runReport = useCallback(async () => {
    setReportLoading(true);
    const result = await getProFeatureUsageReportAdminAction({
      from: reportRange.from || null,
      to: reportRange.to || null,
    });

    if (!result.ok) {
      toast.error(tPage('report.errors.load'));
      setReportLoading(false);
      return;
    }

    setReport(result.data);
    setReportLoading(false);
  }, [reportRange.from, reportRange.to, tPage]);

  const statusLabel = useCallback(
    (status: ProFeatureStatus) => tPage(`features.status.${status}` as FeatureStatusKey),
    [tPage],
  );

  const visibilityLabel = useCallback(
    (value: VisibilityOverrideValue) => {
      const key: FeatureVisibilityKey = value
        ? `features.visibility.${value}`
        : 'features.visibility.default';
      return tPage(key);
    },
    [tPage],
  );

  const enforcementLabel = useCallback(
    (value: ProFeatureEnforcement) =>
      tPage(`features.enforcement.${value}` as FeatureEnforcementKey),
    [tPage],
  );

  const reportItems = useMemo(() => {
    if (!report) return { blocked: [], used: [] };
    return report;
  }, [report]);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary/80">
          {tPage('page.sectionLabel')}
        </p>
        <div className="space-y-1">
          <h1 className="text-3xl font-bold leading-tight">{tPage('page.title')}</h1>
          <p className="text-muted-foreground">{tPage('page.description')}</p>
        </div>
      </div>

      <section className="space-y-4 rounded-lg border bg-card p-5 shadow-sm">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {tPage('features.sectionLabel')}
          </p>
          <h2 className="text-lg font-semibold">{tPage('features.title')}</h2>
          <p className="text-sm text-muted-foreground">{tPage('features.description')}</p>
        </div>

        <div className="border-t border-border/70 pt-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner className="h-4 w-4" />
              {tCommon('loading')}
            </div>
          ) : loadError ? (
            <p className="text-sm text-destructive">{tPage('features.errors.load')}</p>
          ) : (
            <div className="space-y-4">
              {features.map((feature) => (
                <ProFeatureConfigCard
                  key={feature.featureKey}
                  feature={feature}
                  onUpdated={loadFeatures}
                  statusLabel={statusLabel}
                  visibilityLabel={visibilityLabel}
                  enforcementLabel={enforcementLabel}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="space-y-4 rounded-lg border bg-card p-5 shadow-sm">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {tPage('report.sectionLabel')}
          </p>
          <h2 className="text-lg font-semibold">{tPage('report.title')}</h2>
          <p className="text-sm text-muted-foreground">{tPage('report.description')}</p>
        </div>

        <div className="rounded-lg border border-border/70 bg-background/60 p-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <FormField label={tPage('report.fields.from')}>
              <DatePicker
                value={reportRange.from}
                onChangeAction={(value) => setReportRange((prev) => ({ ...prev, from: value }))}
                locale={locale}
                placeholder={tPage('report.fields.fromPlaceholder')}
                clearLabel={tCommon('clear')}
              />
            </FormField>
            <FormField label={tPage('report.fields.to')}>
              <DatePicker
                value={reportRange.to}
                onChangeAction={(value) => setReportRange((prev) => ({ ...prev, to: value }))}
                locale={locale}
                placeholder={tPage('report.fields.toPlaceholder')}
                clearLabel={tCommon('clear')}
              />
            </FormField>
            <Button type="button" onClick={runReport} disabled={reportLoading}>
              {reportLoading ? <Spinner className="mr-2 h-4 w-4" /> : null}
              {tPage('report.actions.run')}
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border bg-background/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {tPage('report.blockedTitle')}
            </p>
            {reportItems.blocked.length ? (
              <ul className="mt-3 space-y-2 text-sm">
                {reportItems.blocked.map((item) => (
                  <li key={`blocked-${item.featureKey}`} className="flex items-center justify-between">
                    <span>{tPage(`features.${item.featureKey}.label` as FeatureLabelKey)}</span>
                    <span className="text-muted-foreground">
                      {tPage('report.count', { count: item.count })}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">{tPage('report.empty')}</p>
            )}
          </div>

          <div className="rounded-lg border bg-background/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {tPage('report.usedTitle')}
            </p>
            {reportItems.used.length ? (
              <ul className="mt-3 space-y-2 text-sm">
                {reportItems.used.map((item) => (
                  <li key={`used-${item.featureKey}`} className="flex items-center justify-between">
                    <span>{tPage(`features.${item.featureKey}.label` as FeatureLabelKey)}</span>
                    <span className="text-muted-foreground">
                      {tPage('report.count', { count: item.count })}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">{tPage('report.empty')}</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

type ProFeatureConfigCardProps = {
  feature: ProFeatureAdminSummary;
  onUpdated: () => void;
  statusLabel: (status: ProFeatureStatus) => string;
  visibilityLabel: (value: VisibilityOverrideValue) => string;
  enforcementLabel: (value: ProFeatureEnforcement) => string;
};

function ProFeatureConfigCard({
  feature,
  onUpdated,
  statusLabel,
  visibilityLabel,
  enforcementLabel,
}: ProFeatureConfigCardProps) {
  const tPage = useTranslations('pages.adminProFeatures');
  const form = useForm<ProFeatureConfigFormValues, { featureKey: ProFeatureKey }>({
    defaultValues: {
      enabled: feature.config.enabled,
      visibilityOverride: feature.config.visibilityOverride ?? '',
      notes: feature.config.notes ?? '',
      reason: '',
    },
    onSubmit: async (values) => {
      const trimmedReason = values.reason.trim();
      if (!trimmedReason) {
        return {
          ok: false,
          error: 'INVALID_INPUT',
          fieldErrors: { reason: [tPage('features.errors.reasonRequired')] },
          message: tPage('features.errors.reasonRequired'),
        };
      }

      const patch: {
        enabled?: boolean;
        visibilityOverride?: 'locked' | 'hidden' | null;
        notes?: string | null;
      } = {};

      if (values.enabled !== feature.config.enabled) patch.enabled = values.enabled;
      if (values.visibilityOverride !== (feature.config.visibilityOverride ?? '')) {
        patch.visibilityOverride = values.visibilityOverride ? values.visibilityOverride : null;
      }
      if (values.notes !== (feature.config.notes ?? '')) {
        const trimmedNotes = values.notes.trim();
        patch.notes = trimmedNotes ? trimmedNotes : null;
      }

      const result = await updateProFeatureConfigAdminAction({
        featureKey: feature.featureKey,
        patch,
        reason: trimmedReason,
      });

      if (!result.ok) {
        return { ok: false, error: result.error, message: tPage('features.errors.update') };
      }

      return result;
    },
    onSuccess: () => {
      toast.success(tPage('features.success.updated'));
      form.setFieldValue('reason', '');
      onUpdated();
    },
  });

  const { clearError, setFieldValue } = form;

  useEffect(() => {
    setFieldValue('enabled', feature.config.enabled);
    setFieldValue('visibilityOverride', feature.config.visibilityOverride ?? '');
    setFieldValue('notes', feature.config.notes ?? '');
    clearError('enabled');
    clearError('visibilityOverride');
    clearError('notes');
    clearError('reason');
  }, [feature, clearError, setFieldValue]);

  const hasChanges =
    form.values.enabled !== feature.config.enabled ||
    form.values.visibilityOverride !== (feature.config.visibilityOverride ?? '') ||
    form.values.notes !== (feature.config.notes ?? '');

  const isSubmitting = form.isSubmitting;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!hasChanges) {
      toast.info(tPage('features.errors.noChanges'));
      return;
    }
    form.handleSubmit(event);
  };

  const proDecision = feature.decisions.pro;
  const nonProDecision = feature.decisions.nonPro;

  const statusVariant = (status: ProFeatureStatus): BadgeProps['variant'] => {
    switch (status) {
      case 'enabled':
        return 'green';
      case 'locked':
        return 'outline';
      case 'hidden':
        return 'ghost';
      case 'disabled':
        return 'default';
      default:
        return 'default';
    }
  };

  return (
    <div className="space-y-4 rounded-lg border border-border/70 bg-background/60 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <h3 className="text-base font-semibold">{tPage(feature.labelKey)}</h3>
          <p className="text-sm text-muted-foreground">{tPage(feature.descriptionKey)}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="font-mono">{feature.featureKey}</span>
            <span>
              {tPage('features.labels.defaultVisibility')}: {visibilityLabel(feature.defaultVisibility)}
            </span>
            <span>
              {tPage('features.labels.enforcement')}: {enforcementLabel(feature.enforcement)}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={statusVariant(proDecision.status)} size="sm">
            {tPage('features.labels.proLabel')}: {statusLabel(proDecision.status)}
          </Badge>
          <Badge variant={statusVariant(nonProDecision.status)} size="sm">
            {tPage('features.labels.nonProLabel')}: {statusLabel(nonProDecision.status)}
          </Badge>
        </div>
      </div>

      <Form form={form} onSubmit={handleSubmit} className="space-y-4">
        <FormError />
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3 rounded-lg border border-border/70 bg-background/70 p-4">
            <FormField label={tPage('features.labels.enabled')}>
              <div className="flex items-center gap-3">
                <Switch
                  checked={form.values.enabled}
                  onCheckedChange={(value) => form.setFieldValue('enabled', value)}
                  disabled={isSubmitting}
                />
                <span className="text-sm text-muted-foreground">
                  {form.values.enabled
                    ? tPage('features.enabledStates.on')
                    : tPage('features.enabledStates.off')}
                </span>
              </div>
            </FormField>

            <FormField label={tPage('features.labels.visibilityOverride')}>
              <select
                className={cn(
                  'h-11 w-full rounded-lg border bg-background px-3 text-sm shadow-sm outline-none ring-0 transition',
                  'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30',
                  'disabled:cursor-not-allowed disabled:opacity-60',
                )}
                value={form.values.visibilityOverride}
                onChange={(event) =>
                  form.setFieldValue('visibilityOverride', event.target.value as VisibilityOverrideValue)
                }
                disabled={isSubmitting}
              >
                <option value="">{tPage('features.visibility.default')}</option>
                <option value="locked">{tPage('features.visibility.locked')}</option>
                <option value="hidden">{tPage('features.visibility.hidden')}</option>
              </select>
            </FormField>

            <FormField label={tPage('features.labels.notes')}>
              <textarea
                className={cn(
                  'min-h-[110px] w-full rounded-lg border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition',
                  'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30',
                  'disabled:cursor-not-allowed disabled:opacity-60',
                )}
                {...form.register('notes')}
                disabled={isSubmitting}
              />
            </FormField>
          </div>

          <div className="space-y-3 rounded-lg border border-border/70 bg-background/70 p-4">
            <FormField label={tPage('features.labels.reason')} required error={form.errors.reason}>
              <textarea
                className={cn(
                  'min-h-[110px] w-full rounded-lg border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition',
                  'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30',
                  'disabled:cursor-not-allowed disabled:opacity-60',
                  form.errors.reason && 'border-destructive focus-visible:border-destructive',
                )}
                placeholder={tPage('features.labels.reasonPlaceholder')}
                {...form.register('reason')}
                disabled={isSubmitting}
              />
            </FormField>
          </div>
        </div>

        <div className="flex justify-end border-t border-border/70 pt-4">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Spinner className="mr-2 h-4 w-4" /> : null}
            {isSubmitting ? tPage('features.actions.saving') : tPage('features.actions.save')}
          </Button>
        </div>
      </Form>
    </div>
  );
}
