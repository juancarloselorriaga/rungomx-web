'use client';

import { Button } from '@/components/ui/button';
import { uploadEventMediaFile } from '@/components/events/event-media-upload';
import { Link, useRouter } from '@/i18n/navigation';
import {
  createGroupDiscountRule,
  downloadGroupTemplate,
  downloadGroupTemplateXlsx,
  getGroupBatchStatus,
  processGroupBatch,
  uploadGroupBatch,
} from '@/lib/events/group-registrations/actions';
import { cn } from '@/lib/utils';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Loader2,
  Play,
  RefreshCw,
  Upload,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

type BatchListItem = {
  id: string;
  status: string;
  createdAt: string;
  processedAt: string | null;
  rowCount: number;
  errorCount: number;
  createdBy: { id: string; name: string; email: string };
};

type DiscountRuleItem = {
  id: string;
  minParticipants: number;
  percentOff: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type BatchDetail = {
  id: string;
  editionId: string;
  status: string;
  createdAt: string;
  processedAt: string | null;
  rows: Array<{
    id: string;
    rowIndex: number;
    rawJson: Record<string, unknown>;
    validationErrors: string[];
    createdRegistrationId: string | null;
  }>;
};

type GroupRegistrationsManagerProps = {
  editionId: string;
  organizationId: string;
  seriesSlug: string;
  editionSlug: string;
  batches: BatchListItem[];
  discountRules: DiscountRuleItem[];
};

function formatDateTime(iso: string | null, locale: string): string {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function downloadBase64File(base64: string, filename: string, mimeType: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

async function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Failed to read file'));
        return;
      }

      const commaIndex = result.indexOf(',');
      if (commaIndex === -1) {
        reject(new Error('Failed to read file'));
        return;
      }

      resolve(result.slice(commaIndex + 1));
    };

    reader.readAsDataURL(file);
  });
}

function statusBadge(status: string, t: ReturnType<typeof useTranslations>) {
  const styles: Record<string, string> = {
    uploaded: 'bg-muted text-foreground',
    validated: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    processed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    failed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        styles[status] ?? styles.uploaded,
      )}
    >
      {t(`status.${status}`)}
    </span>
  );
}

export function GroupRegistrationsManager({
  editionId,
  organizationId,
  seriesSlug,
  editionSlug,
  batches,
  discountRules,
}: GroupRegistrationsManagerProps) {
  const t = useTranslations('pages.dashboardEvents.groupRegistrations');
  const locale = useLocale();
  const router = useRouter();

  const latestBatchId = batches[0]?.id ?? null;
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(latestBatchId);
  const [selectedBatch, setSelectedBatch] = useState<BatchDetail | null>(null);

  const selectedBatchListItem = useMemo(
    () => batches.find((b) => b.id === selectedBatchId) ?? null,
    [batches, selectedBatchId],
  );

  const canProcessSelectedBatch =
    selectedBatchListItem?.status === 'validated' ||
    (selectedBatchListItem?.status === 'failed' && selectedBatchListItem.errorCount === 0);

  const [isDownloadingCsv, setIsDownloadingCsv] = useState(false);
  const [isDownloadingXlsx, setIsDownloadingXlsx] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const [minParticipants, setMinParticipants] = useState('');
  const [percentOff, setPercentOff] = useState('');
  const [isSavingRule, setIsSavingRule] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [editingPercentOff, setEditingPercentOff] = useState('');
  const [isUpdatingRuleId, setIsUpdatingRuleId] = useState<string | null>(null);

  async function refreshSelectedBatch(batchId: string) {
    setIsRefreshing(true);
    try {
      const result = await getGroupBatchStatus({ batchId });
      if (!result.ok) {
        toast.error(t('batch.error'), { description: result.error });
        return;
      }
      setSelectedBatch(result.data);
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleDownloadTemplateCsv() {
    setIsDownloadingCsv(true);
    try {
      const result = await downloadGroupTemplate({ editionId });
      if (!result.ok) {
        toast.error(t('template.error'), { description: result.error });
        return;
      }
      downloadCsv(result.data.csv, result.data.filename);
      toast.success(t('template.success'));
    } catch {
      toast.error(t('template.error'));
    } finally {
      setIsDownloadingCsv(false);
    }
  }

  async function handleDownloadTemplateXlsx() {
    setIsDownloadingXlsx(true);
    try {
      const result = await downloadGroupTemplateXlsx({ editionId });
      if (!result.ok) {
        toast.error(t('template.error'), { description: result.error });
        return;
      }
      downloadBase64File(result.data.xlsxBase64, result.data.filename, result.data.mimeType);
      toast.success(t('template.success'));
    } catch {
      toast.error(t('template.error'));
    } finally {
      setIsDownloadingXlsx(false);
    }
  }

  async function handleUpload() {
    if (!file) {
      toast.error(t('upload.error'), { description: t('upload.errors.noFile') });
      return;
    }

    setIsUploading(true);
    try {
      const { mediaId } = await uploadEventMediaFile({
        organizationId,
        file,
        kind: 'document',
        purpose: 'group-registration-batch',
      });

      const lowerName = file.name.toLowerCase();
      const isXlsx =
        lowerName.endsWith('.xlsx') ||
        file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

      const result = isXlsx
        ? await uploadGroupBatch({
            editionId,
            xlsxBase64: await readFileAsBase64(file),
            filename: file.name,
            sourceFileMediaId: mediaId,
          })
        : await uploadGroupBatch({
            editionId,
            csvText: await file.text(),
            filename: file.name,
            sourceFileMediaId: mediaId,
          });
      if (!result.ok) {
        toast.error(t('upload.error'), { description: result.error });
        return;
      }

      toast.success(
        result.data.errorCount > 0 ? t('upload.completedWithErrors') : t('upload.success'),
      );

      setFile(null);
      setSelectedBatchId(result.data.batchId);
      router.refresh();
      await refreshSelectedBatch(result.data.batchId);
    } catch {
      toast.error(t('upload.error'));
    } finally {
      setIsUploading(false);
    }
  }

  async function handleProcess() {
    if (!selectedBatchId) return;

    setIsProcessing(true);
    try {
      const result = await processGroupBatch({ batchId: selectedBatchId });
      if (!result.ok) {
        toast.error(t('process.error'), { description: result.error });
        router.refresh();
        await refreshSelectedBatch(selectedBatchId);
        return;
      }

      toast.success(
        result.data.groupDiscountPercentOff
          ? t('process.successWithDiscount', { percentOff: result.data.groupDiscountPercentOff })
          : t('process.success'),
      );
      router.refresh();
      await refreshSelectedBatch(selectedBatchId);
    } catch {
      toast.error(t('process.error'));
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleSaveRule() {
    const min = Number.parseInt(minParticipants, 10);
    const pct = Number.parseInt(percentOff, 10);

    if (!Number.isFinite(min) || min <= 0) {
      toast.error(t('discountRule.error'), { description: t('discountRule.errors.minParticipants') });
      return;
    }
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
      toast.error(t('discountRule.error'), { description: t('discountRule.errors.percentOff') });
      return;
    }

    setIsSavingRule(true);
    try {
      const result = await createGroupDiscountRule({
        editionId,
        minParticipants: min,
        percentOff: pct,
        isActive: true,
      });
      if (!result.ok) {
        toast.error(t('discountRule.error'), { description: result.error });
        return;
      }

      toast.success(t('discountRule.success'));
      setMinParticipants('');
      setPercentOff('');
      router.refresh();
    } catch {
      toast.error(t('discountRule.error'));
    } finally {
      setIsSavingRule(false);
    }
  }

  async function handleToggleRule(rule: DiscountRuleItem) {
    setIsUpdatingRuleId(rule.id);
    try {
      const result = await createGroupDiscountRule({
        editionId,
        minParticipants: rule.minParticipants,
        percentOff: rule.percentOff,
        isActive: !rule.isActive,
      });

      if (!result.ok) {
        toast.error(t('discountRule.error'), { description: result.error });
        return;
      }

      toast.success(t('discountRule.success'));
      router.refresh();
    } catch {
      toast.error(t('discountRule.error'));
    } finally {
      setIsUpdatingRuleId(null);
    }
  }

  async function handleSaveEditedRule(rule: DiscountRuleItem) {
    const pct = Number.parseInt(editingPercentOff, 10);
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
      toast.error(t('discountRule.error'), { description: t('discountRule.errors.percentOff') });
      return;
    }

    setIsUpdatingRuleId(rule.id);
    try {
      const result = await createGroupDiscountRule({
        editionId,
        minParticipants: rule.minParticipants,
        percentOff: pct,
        isActive: rule.isActive,
      });

      if (!result.ok) {
        toast.error(t('discountRule.error'), { description: result.error });
        return;
      }

      toast.success(t('discountRule.success'));
      setEditingRuleId(null);
      setEditingPercentOff('');
      router.refresh();
    } catch {
      toast.error(t('discountRule.error'));
    } finally {
      setIsUpdatingRuleId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card/50">
        <div className="border-b border-border px-6 py-3">
          <h2 className="text-base font-semibold">{t('template.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('template.description')}</p>
        </div>
        <div className="px-6 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              type="button"
              onClick={handleDownloadTemplateXlsx}
              disabled={isDownloadingXlsx || isDownloadingCsv}
            >
              {isDownloadingXlsx ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('template.downloading')}
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  {t('template.downloadXlsx')}
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleDownloadTemplateCsv}
              disabled={isDownloadingXlsx || isDownloadingCsv}
            >
              {isDownloadingCsv ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('template.downloading')}
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  {t('template.downloadCsv')}
                </>
              )}
            </Button>
          </div>
          <Button asChild variant="outline">
            <Link
              href={{
                pathname: '/events/[seriesSlug]/[editionSlug]/register',
                params: { seriesSlug, editionSlug },
              }}
              target="_blank"
            >
              <ExternalLink className="h-4 w-4" />
              {t('template.viewPublic')}
            </Link>
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card/50">
        <div className="border-b border-border px-6 py-3">
          <h2 className="text-base font-semibold">{t('discountRule.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('discountRule.description')}</p>
        </div>
        <div className="px-6 py-4 space-y-4">
          {discountRules.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('discountRule.empty')}</p>
          ) : (
            <div className="overflow-x-auto -mx-6 px-6">
              <div className="rounded-md border bg-background/30 min-w-[520px]">
                <div className="grid grid-cols-4 gap-3 px-4 py-2 text-xs font-semibold text-muted-foreground border-b">
                  <div>{t('discountRule.table.minParticipants')}</div>
                  <div>{t('discountRule.table.percentOff')}</div>
                  <div>{t('discountRule.table.status')}</div>
                  <div>{t('discountRule.table.actions')}</div>
                </div>
                <div className="divide-y">
                  {discountRules.map((rule) => (
                    <div key={rule.id} className="grid grid-cols-4 gap-3 px-4 py-3 text-sm">
                      <div>{rule.minParticipants}</div>
                      <div>
                        {editingRuleId === rule.id ? (
                          <input
                            value={editingPercentOff}
                            onChange={(e) => setEditingPercentOff(e.target.value)}
                            className="w-20 rounded-md border bg-background px-2 py-1 text-sm"
                            inputMode="numeric"
                            disabled={isUpdatingRuleId === rule.id}
                          />
                        ) : (
                          <span>{rule.percentOff}%</span>
                        )}
                      </div>
                      <div>
                        {rule.isActive ? (
                          <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-300">
                            <CheckCircle2 className="h-4 w-4" />
                            {t('discountRule.active')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <AlertCircle className="h-4 w-4" />
                            {t('discountRule.inactive')}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {editingRuleId === rule.id ? (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => handleSaveEditedRule(rule)}
                              disabled={isUpdatingRuleId === rule.id}
                            >
                              {t('discountRule.actions.save')}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditingRuleId(null);
                                setEditingPercentOff('');
                              }}
                              disabled={isUpdatingRuleId === rule.id}
                            >
                              {t('discountRule.actions.cancel')}
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditingRuleId(rule.id);
                                setEditingPercentOff(String(rule.percentOff));
                              }}
                              disabled={isUpdatingRuleId === rule.id}
                            >
                              {t('discountRule.actions.edit')}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => handleToggleRule(rule)}
                              disabled={isUpdatingRuleId === rule.id}
                            >
                              {rule.isActive
                                ? t('discountRule.actions.deactivate')
                                : t('discountRule.actions.activate')}
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block space-y-2 text-sm">
              <span className="font-medium">{t('discountRule.form.minParticipants')}</span>
              <input
                value={minParticipants}
                onChange={(e) => setMinParticipants(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                placeholder="10"
                inputMode="numeric"
                disabled={isSavingRule}
              />
            </label>
            <label className="block space-y-2 text-sm">
              <span className="font-medium">{t('discountRule.form.percentOff')}</span>
              <input
                value={percentOff}
                onChange={(e) => setPercentOff(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                placeholder="10"
                inputMode="numeric"
                disabled={isSavingRule}
              />
            </label>
            <div className="flex items-end">
              <Button type="button" onClick={handleSaveRule} disabled={isSavingRule}>
                {isSavingRule ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('discountRule.saving')}
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    {t('discountRule.save')}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card/50">
        <div className="border-b border-border px-6 py-3">
          <h2 className="text-base font-semibold">{t('upload.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('upload.description')}</p>
        </div>
        <div className="px-6 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <input
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm"
            disabled={isUploading}
          />
          <Button type="button" onClick={handleUpload} disabled={isUploading || !file}>
            {isUploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('upload.uploading')}
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                {t('upload.upload')}
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card/50">
        <div className="border-b border-border px-6 py-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold">{t('batches.title')}</h2>
              <p className="text-sm text-muted-foreground">{t('batches.description')}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => selectedBatchId && refreshSelectedBatch(selectedBatchId)}
              disabled={!selectedBatchId || isRefreshing}
            >
              {isRefreshing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('batches.refreshing')}
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  {t('batches.refresh')}
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="divide-y">
          {batches.length === 0 ? (
            <div className="px-6 py-8 text-center text-muted-foreground">{t('batches.empty')}</div>
          ) : (
            batches.map((batch) => (
              <button
                key={batch.id}
                type="button"
                className={cn(
                  'w-full px-6 py-4 text-left transition-colors hover:bg-muted/30',
                  selectedBatchId === batch.id ? 'bg-muted/30' : 'bg-transparent',
                )}
                onClick={async () => {
                  setSelectedBatchId(batch.id);
                  await refreshSelectedBatch(batch.id);
                }}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{t('batches.batch')}</span>
                      <span className="font-mono text-xs text-muted-foreground">{batch.id.slice(0, 8)}…</span>
                      {statusBadge(batch.status, t)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {t('batches.meta', {
                        createdAt: formatDateTime(batch.createdAt, locale),
                        processedAt: formatDateTime(batch.processedAt, locale),
                      })}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <FileSpreadsheet className="h-4 w-4" />
                      {t('batches.rows', { count: batch.rowCount })}
                    </span>
                    <span className={cn('inline-flex items-center gap-1', batch.errorCount ? 'text-red-700 dark:text-red-300' : 'text-muted-foreground')}>
                      <AlertCircle className="h-4 w-4" />
                      {t('batches.errors', { count: batch.errorCount })}
                    </span>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {selectedBatchListItem ? (
        <div className="rounded-lg border border-border bg-card/50">
          <div className="border-b border-border px-6 py-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold">{t('batch.title')}</h2>
                <p className="text-sm text-muted-foreground">
                  {t('batch.description', {
                    status: selectedBatchListItem.status,
                    createdAt: formatDateTime(selectedBatchListItem.createdAt, locale),
                  })}
                </p>
              </div>
              <Button
                type="button"
                onClick={handleProcess}
                disabled={
                  isProcessing ||
                  !canProcessSelectedBatch
                }
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('process.processing')}
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    {t('process.process')}
                  </>
                )}
              </Button>
            </div>
          </div>

          <div className="px-6 py-4 space-y-4">
            {!selectedBatch ? (
              <p className="text-sm text-muted-foreground">{t('batch.selectToView')}</p>
            ) : (
              <>
                {selectedBatch.rows.some((r) => r.validationErrors.length > 0) ? (
                  <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                    {t('batch.hasErrors')}
                  </div>
                ) : selectedBatch.status === 'failed' ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                    {t('batch.failedProcessing')}
                  </div>
                ) : (
                  <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200">
                    {t('batch.validated')}
                  </div>
                )}

                <div className="overflow-x-auto -mx-6 px-6">
                  <div className="rounded-md border overflow-hidden min-w-[600px]">
                    <div className="grid grid-cols-5 gap-3 px-4 py-2 text-xs font-semibold text-muted-foreground border-b bg-muted/20">
                      <div>{t('batch.table.row')}</div>
                      <div>{t('batch.table.name')}</div>
                      <div>{t('batch.table.email')}</div>
                      <div>{t('batch.table.distance')}</div>
                      <div>{t('batch.table.errors')}</div>
                    </div>
                    <div className="divide-y">
                      {selectedBatch.rows.slice(0, 50).map((row) => (
                        <div key={row.id} className="grid grid-cols-5 gap-3 px-4 py-3 text-sm">
                          <div className="font-mono text-xs text-muted-foreground">{row.rowIndex}</div>
                          <div className="min-w-0">
                            <p className="truncate">
                              {String(row.rawJson.firstName ?? '')} {String(row.rawJson.lastName ?? '')}
                            </p>
                          </div>
                          <div className="min-w-0">
                            <p className="truncate">{String(row.rawJson.email ?? '')}</p>
                          </div>
                          <div className="min-w-0">
                            <p className="truncate">
                              {String(row.rawJson.distanceLabel ?? row.rawJson.distanceId ?? '')}
                            </p>
                          </div>
                          <div className="min-w-0">
                            {row.validationErrors.length > 0 ? (
                              <ul className="list-disc pl-4 space-y-1 text-xs text-red-700 dark:text-red-300">
                                {row.validationErrors.slice(0, 3).map((e) => (
                                  <li key={e}>{e}</li>
                                ))}
                              </ul>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-300 text-xs">
                                <CheckCircle2 className="h-4 w-4" />
                                {t('batch.table.ok')}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {selectedBatch.rows.length > 50 ? (
                  <p className="text-xs text-muted-foreground">
                    {t('batch.table.showing', { count: 50, total: selectedBatch.rows.length })}
                  </p>
                ) : null}
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
