import type {
  ResultImportCanonicalFieldKey,
  ResultImportFieldMapping,
} from './mapping-templates';
import { deriveResultPlacements } from '@/lib/events/results/derivation/placement';

type ParsedResultStatus = 'finish' | 'dnf' | 'dns' | 'dq';

export type ResultImportValidationSeverity = 'blocker' | 'warning';

export type ResultImportValidationIssue = {
  severity: ResultImportValidationSeverity;
  rowNumber: number;
  fieldKey: ResultImportCanonicalFieldKey;
  sourceColumn: string | null;
  message: string;
  fixGuidance: string;
};

export type ResultImportDerivedPreviewRow = {
  rowNumber: number;
  runnerName: string;
  bibNumber: string | null;
  status: ParsedResultStatus;
  finishTimeText: string | null;
  finishTimeMillis: number | null;
  derivedOverallPlace: number | null;
};

export type ResultImportValidationResult = {
  blockers: ResultImportValidationIssue[];
  warnings: ResultImportValidationIssue[];
  previewRows: ResultImportDerivedPreviewRow[];
  canPreview: boolean;
};

export function normalizeResultStatus(value: string): ParsedResultStatus | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === '' || normalized === 'finish' || normalized === 'finished') {
    return 'finish';
  }

  if (normalized === 'dnf') return 'dnf';
  if (normalized === 'dns') return 'dns';
  if (normalized === 'dq' || normalized === 'disqualified') return 'dq';

  return null;
}

export function parseResultFinishTimeToMillis(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parts = trimmed.split(':');
  if (parts.length === 2 || parts.length === 3) {
    const secondsPart = parts[parts.length - 1] ?? '';
    const minutesPart = parts[parts.length - 2] ?? '';
    const hoursPart = parts.length === 3 ? parts[0] ?? '' : '0';

    if (
      /^\d+$/.test(hoursPart) &&
      /^\d+$/.test(minutesPart) &&
      /^\d+(?:\.\d+)?$/.test(secondsPart)
    ) {
      const hours = Number.parseInt(hoursPart, 10);
      const minutes = Number.parseInt(minutesPart, 10);
      const seconds = Number.parseFloat(secondsPart);

      if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
        return null;
      }

      if (minutes >= 60 || seconds >= 60) return null;
      return Math.round((hours * 3600 + minutes * 60 + seconds) * 1000);
    }
  }

  if (/^\d+$/.test(trimmed)) {
    const raw = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(raw) || raw <= 0) return null;
    return raw;
  }

  return null;
}

function getColumnIndex(headers: readonly string[], columnName: string | null): number {
  if (!columnName) return -1;
  return headers.indexOf(columnName);
}

function getCellValue(row: readonly string[], index: number): string {
  if (index < 0) return '';
  return (row[index] ?? '').trim();
}

function addIssue(
  issues: ResultImportValidationIssue[],
  issue: ResultImportValidationIssue,
) {
  issues.push(issue);
}

export function validateResultImportRows(params: {
  headers: readonly string[];
  rows: readonly string[][];
  mapping: ResultImportFieldMapping;
}): ResultImportValidationResult {
  const blockers: ResultImportValidationIssue[] = [];
  const warnings: ResultImportValidationIssue[] = [];
  const previewRows: ResultImportDerivedPreviewRow[] = [];

  const runnerNameIndex = getColumnIndex(params.headers, params.mapping.runnerFullName);
  const bibIndex = getColumnIndex(params.headers, params.mapping.bibNumber);
  const finishTimeIndex = getColumnIndex(params.headers, params.mapping.finishTimeMillis);
  const statusIndex = getColumnIndex(params.headers, params.mapping.status);

  const seenBibs = new Map<string, number>();

  params.rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const runnerName = getCellValue(row, runnerNameIndex);
    const bibNumber = getCellValue(row, bibIndex);
    const finishTimeText = getCellValue(row, finishTimeIndex);
    const statusText = getCellValue(row, statusIndex);

    if (!runnerName) {
      addIssue(blockers, {
        severity: 'blocker',
        rowNumber,
        fieldKey: 'runnerFullName',
        sourceColumn: params.mapping.runnerFullName,
        message: 'Runner name is missing.',
        fixGuidance: 'Fill in a runner name before previewing this row.',
      });
    }

    const parsedStatus = normalizeResultStatus(statusText);
    if (parsedStatus === null) {
      addIssue(warnings, {
        severity: 'warning',
        rowNumber,
        fieldKey: 'status',
        sourceColumn: params.mapping.status,
        message: `Unknown status "${statusText || '(empty)'}".`,
        fixGuidance: 'Use finish, DNF, DNS, or DQ for deterministic status handling.',
      });
    }

    const effectiveStatus = parsedStatus ?? 'finish';
    const parsedFinishTime =
      finishTimeText.length > 0 ? parseResultFinishTimeToMillis(finishTimeText) : null;

    if (effectiveStatus === 'finish' && parsedFinishTime === null) {
      addIssue(blockers, {
        severity: 'blocker',
        rowNumber,
        fieldKey: 'finishTimeMillis',
        sourceColumn: params.mapping.finishTimeMillis,
        message: `Finish time "${finishTimeText || '(empty)'}" is invalid for a finish status row.`,
        fixGuidance: 'Provide HH:MM:SS, MM:SS, or positive milliseconds for finish rows.',
      });
    }

    if (bibNumber) {
      if (seenBibs.has(bibNumber)) {
        const originalRowNumber = seenBibs.get(bibNumber) ?? rowNumber;
        addIssue(warnings, {
          severity: 'warning',
          rowNumber,
          fieldKey: 'bibNumber',
          sourceColumn: params.mapping.bibNumber,
          message: `Duplicate bib "${bibNumber}" also appears on row ${originalRowNumber}.`,
          fixGuidance:
            'Confirm the duplicate is intentional or fix bib values before finalization.',
        });
      } else {
        seenBibs.set(bibNumber, rowNumber);
      }
    }

    previewRows.push({
      rowNumber,
      runnerName,
      bibNumber: bibNumber || null,
      status: effectiveStatus,
      finishTimeText: finishTimeText || null,
      finishTimeMillis: parsedFinishTime,
      derivedOverallPlace: null,
    });
  });

  const placementDerivation = deriveResultPlacements(
    previewRows.map((row) => ({
      id: `import-preview-${row.rowNumber}`,
      runnerFullName: row.runnerName,
      bibNumber: row.bibNumber,
      status: row.status,
      finishTimeMillis: row.finishTimeMillis,
      gender: null,
      age: null,
    })),
  );

  for (const row of previewRows) {
    row.derivedOverallPlace =
      placementDerivation.byEntryId[`import-preview-${row.rowNumber}`]?.overallPlace ?? null;
  }

  return {
    blockers,
    warnings,
    previewRows,
    canPreview: blockers.length === 0,
  };
}
