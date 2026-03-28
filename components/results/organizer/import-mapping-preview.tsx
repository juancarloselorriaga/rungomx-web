'use client';

import { Button } from '@/components/ui/button';
import { InsetSurface, Surface } from '@/components/ui/surface';
import {
  parseResultImportFile,
  type ParsedResultImportFile,
  type ResultImportParseErrorCode,
} from '@/lib/events/results/ingestion/csv-parser';
import {
  applyResultImportTemplateMapping,
  coerceResultImportMappingTemplates,
  createEmptyResultImportFieldMapping,
  inferResultImportFieldMapping,
  isResultImportMappingComplete,
  RESULT_IMPORT_CANONICAL_FIELDS,
  type ResultImportCanonicalFieldKey,
  type ResultImportFieldMapping,
  type ResultImportMappingTemplate,
} from '@/lib/events/results/ingestion/mapping-templates';
import {
  validateResultImportRows,
  type ResultImportValidationIssue,
} from '@/lib/events/results/ingestion/validation';
import { useMemo, useState, type ChangeEvent } from 'react';

const MAX_STORED_TEMPLATES = 25;

type ImportMappingPreviewLabels = {
  title: string;
  description: string;
  uploadLabel: string;
  uploadHint: string;
  parseSummary: string;
  columnsLabel: string;
  sampleRowsLabel: string;
  totalRowsLabel: string;
  savedTemplatesLabel: string;
  savedTemplatesEmpty: string;
  saveTemplateNameLabel: string;
  saveTemplateNamePlaceholder: string;
  saveTemplateAction: string;
  templateAppliedMessage: string;
  templateSavedMessage: string;
  requiredMappingMessage: string;
  parsingMessage: string;
  mapFieldLabel: string;
  unmappedOption: string;
  requiredTag: string;
  optionalTag: string;
  mappingTableFieldLabel: string;
  mappingTableSourceLabel: string;
  mappingPreviewTitle: string;
  mappingPreviewDescription: string;
  samplePreviewTitle: string;
  samplePreviewDescription: string;
  validationTitle: string;
  validationDescription: string;
  blockersLabel: string;
  warningsLabel: string;
  issuesTableSeverityLabel: string;
  issuesTableRowLabel: string;
  issuesTableFieldLabel: string;
  issuesTableSourceLabel: string;
  issuesTableIssueLabel: string;
  issuesTableGuidanceLabel: string;
  derivedPreviewTitle: string;
  derivedPreviewDescription: string;
  derivedPreviewBlocked: string;
  derivedPreviewEmpty: string;
  derivedPreviewHeaders: {
    runner: string;
    bib: string;
    status: string;
    finishTime: string;
    derivedOverall: string;
  };
  parseErrors: Record<ResultImportParseErrorCode, string>;
  canonicalFieldLabels: Record<ResultImportCanonicalFieldKey, string>;
};

type ImportMappingPreviewProps = {
  storageKey: string;
  labels: ImportMappingPreviewLabels;
};

function createTemplateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `template-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function toStoredTemplates(storageKey: string): ResultImportMappingTemplate[] {
  if (typeof window === 'undefined') return [];

  try {
    const rawValue = window.localStorage.getItem(storageKey);
    if (!rawValue) return [];
    const parsed = JSON.parse(rawValue) as unknown;
    return coerceResultImportMappingTemplates(parsed);
  } catch {
    return [];
  }
}

function persistTemplates(storageKey: string, templates: ResultImportMappingTemplate[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(storageKey, JSON.stringify(templates));
}

function getParseErrorMessage(error: unknown, labels: ImportMappingPreviewLabels): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = error.code as ResultImportParseErrorCode;
    if (labels.parseErrors[code]) {
      return labels.parseErrors[code];
    }
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return labels.parseErrors.malformed_file;
}

function buildDeterministicMapping(
  mapping: ResultImportFieldMapping,
): Record<ResultImportCanonicalFieldKey, string | null> {
  return RESULT_IMPORT_CANONICAL_FIELDS.reduce(
    (accumulator, field) => ({
      ...accumulator,
      [field.key]: mapping[field.key] ?? null,
    }),
    {} as Record<ResultImportCanonicalFieldKey, string | null>,
  );
}

function getIssueToneClass(issue: ResultImportValidationIssue): string {
  if (issue.severity === 'blocker') {
    return 'border-destructive/30 bg-destructive/10';
  }
  return 'border-amber-300/50 bg-amber-50/40 dark:border-amber-900/50 dark:bg-amber-950/20';
}

export function ImportMappingPreview({ storageKey, labels }: ImportMappingPreviewProps) {
  const [parsedImport, setParsedImport] = useState<ParsedResultImportFile | null>(null);
  const [mapping, setMapping] = useState<ResultImportFieldMapping>(
    createEmptyResultImportFieldMapping(),
  );
  const [savedTemplates, setSavedTemplates] = useState<ResultImportMappingTemplate[]>(() =>
    toStoredTemplates(storageKey),
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);

  const matchingTemplates = useMemo(() => {
    if (!parsedImport) return [];
    return savedTemplates.filter(
      (template) => template.headerSignature === parsedImport.headerSignature,
    );
  }, [parsedImport, savedTemplates]);

  const deterministicMapping = useMemo(() => buildDeterministicMapping(mapping), [mapping]);

  const validationResult = useMemo(() => {
    if (!parsedImport) return null;
    return validateResultImportRows({
      headers: parsedImport.headers,
      rows: parsedImport.rows,
      mapping,
    });
  }, [parsedImport, mapping]);

  const onFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsParsing(true);
    setFeedbackMessage(null);
    setErrorMessage(null);
    setSelectedTemplateId('');

    try {
      const parsed = await parseResultImportFile(file);
      setParsedImport(parsed);
      setMapping(inferResultImportFieldMapping(parsed.headers));

      const defaultTemplateName = file.name.replace(/\.[^.]+$/, '').trim();
      setTemplateName(defaultTemplateName ? `${defaultTemplateName} template` : '');
    } catch (error) {
      setParsedImport(null);
      setMapping(createEmptyResultImportFieldMapping());
      setErrorMessage(getParseErrorMessage(error, labels));
    } finally {
      setIsParsing(false);
      event.target.value = '';
    }
  };

  const onTemplateSelected = (templateId: string) => {
    setSelectedTemplateId(templateId);
    setFeedbackMessage(null);

    if (!parsedImport || !templateId) return;

    const template = matchingTemplates.find((item) => item.id === templateId);
    if (!template) return;

    setMapping(
      applyResultImportTemplateMapping({
        templateMapping: template.mapping,
        availableHeaders: parsedImport.headers,
      }),
    );
    setFeedbackMessage(`${labels.templateAppliedMessage}: ${template.name}`);
  };

  const onSaveTemplate = () => {
    if (!parsedImport) return;

    if (!isResultImportMappingComplete(mapping)) {
      setFeedbackMessage(labels.requiredMappingMessage);
      return;
    }

    const normalizedName = templateName.trim() || `${parsedImport.fileName} template`;
    const now = new Date().toISOString();

    const existingTemplate = savedTemplates.find(
      (template) =>
        template.headerSignature === parsedImport.headerSignature &&
        template.name.toLowerCase() === normalizedName.toLowerCase(),
    );

    const template: ResultImportMappingTemplate = existingTemplate
      ? {
          ...existingTemplate,
          name: normalizedName,
          mapping,
          updatedAt: now,
        }
      : {
          id: createTemplateId(),
          name: normalizedName,
          headerSignature: parsedImport.headerSignature,
          mapping,
          createdAt: now,
          updatedAt: now,
        };

    const nextTemplates = existingTemplate
      ? savedTemplates.map((item) => (item.id === template.id ? template : item))
      : [template, ...savedTemplates].slice(0, MAX_STORED_TEMPLATES);

    setSavedTemplates(nextTemplates);
    setSelectedTemplateId(template.id);
    setTemplateName(template.name);
    setFeedbackMessage(labels.templateSavedMessage);
    persistTemplates(storageKey, nextTemplates);
  };

  return (
    <Surface className="space-y-4 p-4 sm:p-5">
      <header className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground sm:text-base">{labels.title}</h3>
        <p className="text-xs text-muted-foreground sm:text-sm">{labels.description}</p>
      </header>

      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {labels.uploadLabel}
        </label>
        <input
          type="file"
          accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={onFileSelected}
          className="block w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground"
          aria-label={labels.uploadLabel}
        />
        <p className="text-xs text-muted-foreground">{labels.uploadHint}</p>
      </div>

      {isParsing ? (
        <p className="rounded-md border border-border/80 bg-muted/40 px-3 py-2 text-sm text-foreground">
          {labels.parsingMessage}
        </p>
      ) : null}

      {errorMessage ? (
        <p
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {errorMessage}
        </p>
      ) : null}

      {feedbackMessage ? (
        <p className="rounded-md border border-emerald-300/60 bg-emerald-50/60 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100">
          {feedbackMessage}
        </p>
      ) : null}

      {parsedImport ? (
        <div className="space-y-5">
          <InsetSurface as="section" className="space-y-2 bg-muted/25 p-3">
            <h4 className="text-sm font-semibold text-foreground">{labels.parseSummary}</h4>
            <dl className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
              <div>
                <dt className="text-xs uppercase tracking-wide">{labels.columnsLabel}</dt>
                <dd className="font-medium text-foreground">{parsedImport.headers.length}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide">{labels.sampleRowsLabel}</dt>
                <dd className="font-medium text-foreground">{parsedImport.sampleRows.length}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide">{labels.totalRowsLabel}</dt>
                <dd className="font-medium text-foreground">{parsedImport.totalRows}</dd>
              </div>
            </dl>
          </InsetSurface>

          <InsetSurface className="space-y-3 bg-muted/25 p-3">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {labels.savedTemplatesLabel}
              </label>
              <select
                value={selectedTemplateId}
                onChange={(event) => onTemplateSelected(event.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground"
                aria-label={labels.savedTemplatesLabel}
              >
                <option value="">{labels.savedTemplatesEmpty}</option>
                {matchingTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <label className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {labels.saveTemplateNameLabel}
                </span>
                <input
                  value={templateName}
                  onChange={(event) => setTemplateName(event.target.value)}
                  placeholder={labels.saveTemplateNamePlaceholder}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground"
                />
              </label>
              <Button
                type="button"
                variant="outline"
                onClick={onSaveTemplate}
                className="sm:self-end"
              >
                {labels.saveTemplateAction}
              </Button>
            </div>
          </InsetSurface>

          <InsetSurface className="space-y-3 bg-muted/25 p-3">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/20 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-2 py-2 font-semibold">{labels.mappingTableFieldLabel}</th>
                    <th className="px-2 py-2 font-semibold">{labels.mappingTableSourceLabel}</th>
                  </tr>
                </thead>
                <tbody>
                  {RESULT_IMPORT_CANONICAL_FIELDS.map((field) => (
                    <tr key={field.key} className="border-b last:border-b-0">
                      <td className="px-2 py-2 text-foreground">
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{labels.canonicalFieldLabels[field.key]}</span>
                          <span className="rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                            {field.required ? labels.requiredTag : labels.optionalTag}
                          </span>
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <select
                          value={mapping[field.key] ?? ''}
                          onChange={(event) =>
                            setMapping((current) => ({
                              ...current,
                              [field.key]: event.target.value || null,
                            }))
                          }
                          className="w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground"
                          aria-label={`${labels.mapFieldLabel} ${labels.canonicalFieldLabels[field.key]}`}
                        >
                          <option value="">{labels.unmappedOption}</option>
                          {parsedImport.headers.map((header) => (
                            <option key={`${field.key}-${header}`} value={header}>
                              {header}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </InsetSurface>

          <InsetSurface as="section" className="space-y-2 bg-muted/25 p-3">
            <h4 className="text-sm font-semibold text-foreground">{labels.mappingPreviewTitle}</h4>
            <p className="text-xs text-muted-foreground">{labels.mappingPreviewDescription}</p>
            <pre
              data-testid="results-import-mapping-preview-json"
              className="overflow-x-auto rounded-md border bg-muted/40 p-3 text-xs text-foreground"
            >
              {JSON.stringify(deterministicMapping, null, 2)}
            </pre>
          </InsetSurface>

          {validationResult ? (
            <InsetSurface className="space-y-3 bg-muted/25 p-3">
              <h4 className="text-sm font-semibold text-foreground">{labels.validationTitle}</h4>
              <p className="text-xs text-muted-foreground">{labels.validationDescription}</p>

              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2">
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                    {labels.blockersLabel}
                  </dt>
                  <dd className="text-sm font-semibold text-foreground">
                    {validationResult.blockers.length}
                  </dd>
                </div>
                <div className="rounded-md border border-amber-300/40 bg-amber-50/40 p-2 dark:border-amber-900/40 dark:bg-amber-950/20">
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                    {labels.warningsLabel}
                  </dt>
                  <dd className="text-sm font-semibold text-foreground">
                    {validationResult.warnings.length}
                  </dd>
                </div>
              </dl>

              {[...validationResult.blockers, ...validationResult.warnings].length > 0 ? (
                <div className="space-y-2">
                  {[...validationResult.blockers, ...validationResult.warnings].map((issue) => (
                    <article
                      key={`${issue.severity}-${issue.rowNumber}-${issue.fieldKey}-${issue.message}`}
                      className={`space-y-2 rounded-md border p-3 ${getIssueToneClass(issue)}`}
                    >
                      <dl className="grid gap-2 text-xs sm:grid-cols-4">
                        <div>
                          <dt className="font-semibold uppercase tracking-wide text-muted-foreground">
                            {labels.issuesTableSeverityLabel}
                          </dt>
                          <dd className="text-foreground">
                            {issue.severity === 'blocker'
                              ? labels.blockersLabel
                              : labels.warningsLabel}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-semibold uppercase tracking-wide text-muted-foreground">
                            {labels.issuesTableRowLabel}
                          </dt>
                          <dd className="text-foreground">{issue.rowNumber}</dd>
                        </div>
                        <div>
                          <dt className="font-semibold uppercase tracking-wide text-muted-foreground">
                            {labels.issuesTableFieldLabel}
                          </dt>
                          <dd className="text-foreground">
                            {labels.canonicalFieldLabels[issue.fieldKey]}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-semibold uppercase tracking-wide text-muted-foreground">
                            {labels.issuesTableSourceLabel}
                          </dt>
                          <dd className="text-foreground">
                            {issue.sourceColumn ?? labels.unmappedOption}
                          </dd>
                        </div>
                      </dl>
                      <p className="text-sm text-foreground">
                        <span className="font-semibold">{labels.issuesTableIssueLabel}: </span>
                        {issue.message}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        <span className="font-semibold">{labels.issuesTableGuidanceLabel}: </span>
                        {issue.fixGuidance}
                      </p>
                    </article>
                  ))}
                </div>
              ) : null}
            </InsetSurface>
          ) : null}

          <InsetSurface as="section" className="space-y-2 bg-muted/25 p-3">
            <h4 className="text-sm font-semibold text-foreground">{labels.derivedPreviewTitle}</h4>
            <p className="text-xs text-muted-foreground">{labels.derivedPreviewDescription}</p>

            {validationResult && !validationResult.canPreview ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {labels.derivedPreviewBlocked}
              </p>
            ) : validationResult && validationResult.previewRows.length === 0 ? (
              <p className="rounded-md border border-border/70 bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                {labels.derivedPreviewEmpty}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/20 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-2 py-2 font-semibold">#</th>
                      <th className="px-2 py-2 font-semibold">
                        {labels.derivedPreviewHeaders.runner}
                      </th>
                      <th className="px-2 py-2 font-semibold">
                        {labels.derivedPreviewHeaders.bib}
                      </th>
                      <th className="px-2 py-2 font-semibold">
                        {labels.derivedPreviewHeaders.status}
                      </th>
                      <th className="px-2 py-2 font-semibold">
                        {labels.derivedPreviewHeaders.finishTime}
                      </th>
                      <th className="px-2 py-2 font-semibold">
                        {labels.derivedPreviewHeaders.derivedOverall}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {validationResult?.previewRows.map((previewRow) => (
                      <tr
                        key={`preview-${previewRow.rowNumber}`}
                        className="border-b last:border-b-0"
                      >
                        <td className="px-2 py-2 text-muted-foreground">{previewRow.rowNumber}</td>
                        <td className="px-2 py-2 text-foreground">
                          {previewRow.runnerName || '-'}
                        </td>
                        <td className="px-2 py-2 text-foreground">{previewRow.bibNumber || '-'}</td>
                        <td className="px-2 py-2 text-foreground">
                          {previewRow.status.toUpperCase()}
                        </td>
                        <td className="px-2 py-2 text-foreground">
                          {previewRow.finishTimeText || '-'}
                        </td>
                        <td className="px-2 py-2 text-foreground">
                          {previewRow.derivedOverallPlace ?? '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </InsetSurface>

          <InsetSurface as="section" className="space-y-2 bg-muted/25 p-3">
            <h4 className="text-sm font-semibold text-foreground">{labels.samplePreviewTitle}</h4>
            <p className="text-xs text-muted-foreground">{labels.samplePreviewDescription}</p>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/20 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-2 py-2 font-semibold">#</th>
                    {parsedImport.headers.map((header) => (
                      <th key={header} className="px-2 py-2 font-semibold">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsedImport.sampleRows.map((sampleRow) => (
                    <tr key={sampleRow.rowNumber} className="border-b last:border-b-0">
                      <td className="px-2 py-2 text-muted-foreground">{sampleRow.rowNumber}</td>
                      {parsedImport.headers.map((header) => (
                        <td
                          key={`${sampleRow.rowNumber}-${header}`}
                          className="px-2 py-2 text-foreground"
                        >
                          {sampleRow.values[header] || '-'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </InsetSurface>
        </div>
      ) : null}
    </Surface>
  );
}
