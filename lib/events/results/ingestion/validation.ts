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

// Accepts English and Spanish result-status vocabulary (RES-16). An empty cell defaults
// to `finish`; genuinely unrecognized values return null and are treated as a blocker.
const FINISH_STATUS_TOKENS = new Set([
  '',
  'finish',
  'finished',
  'finisher',
  'ok',
  'fin',
  'finalizado',
  'terminado',
  'completado',
  'meta',
]);
const DNF_STATUS_TOKENS = new Set([
  'dnf',
  'did not finish',
  'no termino',
  'no terminó',
  'abandono',
  'abandonó',
  'ret',
  'retirado',
]);
const DNS_STATUS_TOKENS = new Set([
  'dns',
  'did not start',
  'no inicio',
  'no inició',
  'no salio',
  'no salió',
  'ausente',
]);
const DQ_STATUS_TOKENS = new Set([
  'dq',
  'dsq',
  'disqualified',
  'descalificado',
  'descalificada',
]);

export function normalizeResultStatus(value: string): ParsedResultStatus | null {
  const normalized = value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');

  if (FINISH_STATUS_TOKENS.has(value.trim().toLowerCase()) || FINISH_STATUS_TOKENS.has(normalized)) {
    return 'finish';
  }
  if (DNF_STATUS_TOKENS.has(value.trim().toLowerCase()) || DNF_STATUS_TOKENS.has(normalized)) {
    return 'dnf';
  }
  if (DNS_STATUS_TOKENS.has(value.trim().toLowerCase()) || DNS_STATUS_TOKENS.has(normalized)) {
    return 'dns';
  }
  if (DQ_STATUS_TOKENS.has(value.trim().toLowerCase()) || DQ_STATUS_TOKENS.has(normalized)) {
    return 'dq';
  }

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

  // A bare number is human-entered seconds (e.g. "5400" = 1h30m), not milliseconds.
  // Timing exports mapped to the "finish time" column are seconds or clock strings; a raw
  // millisecond column is not a realistic human input here (RES-16).
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    const seconds = Number.parseFloat(trimmed);
    if (!Number.isFinite(seconds) || seconds <= 0) return null;
    return Math.round(seconds * 1000);
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

export type BuiltResultImportRow = {
  runnerFullName: string;
  bibNumber: string | null;
  gender: string | null;
  age: number | null;
  status: ParsedResultStatus;
  finishTimeMillis: number | null;
};

// Build canonical import rows (all mapped fields, not just the preview columns) from a
// parsed file + mapping, so the import action receives fully-formed rows. Rows without a
// runner name are skipped. Unknown statuses fall back to `finish` here; the server-side
// import validation still blocks them, and the preview surfaces them as blockers.
export function buildResultImportRows(params: {
  headers: readonly string[];
  rows: readonly string[][];
  mapping: ResultImportFieldMapping;
}): BuiltResultImportRow[] {
  const runnerNameIndex = getColumnIndex(params.headers, params.mapping.runnerFullName);
  const bibIndex = getColumnIndex(params.headers, params.mapping.bibNumber);
  const finishTimeIndex = getColumnIndex(params.headers, params.mapping.finishTimeMillis);
  const statusIndex = getColumnIndex(params.headers, params.mapping.status);
  const genderIndex = getColumnIndex(params.headers, params.mapping.gender);
  const ageIndex = getColumnIndex(params.headers, params.mapping.age);

  const built: BuiltResultImportRow[] = [];

  for (const row of params.rows) {
    const runnerFullName = getCellValue(row, runnerNameIndex);
    if (!runnerFullName) continue;

    const bibNumber = getCellValue(row, bibIndex) || null;
    const genderValue = getCellValue(row, genderIndex) || null;
    const ageText = getCellValue(row, ageIndex);
    const parsedAge = ageText ? Number.parseInt(ageText, 10) : NaN;
    const age = Number.isFinite(parsedAge) && parsedAge >= 0 && parsedAge <= 120 ? parsedAge : null;

    const status = normalizeResultStatus(getCellValue(row, statusIndex)) ?? 'finish';
    const finishTimeText = getCellValue(row, finishTimeIndex);
    const finishTimeMillis =
      finishTimeText.length > 0 ? parseResultFinishTimeToMillis(finishTimeText) : null;

    built.push({
      runnerFullName,
      bibNumber,
      gender: genderValue,
      age,
      status,
      finishTimeMillis: status === 'finish' ? finishTimeMillis : null,
    });
  }

  return built;
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
      addIssue(blockers, {
        severity: 'blocker',
        rowNumber,
        fieldKey: 'status',
        sourceColumn: params.mapping.status,
        message: `Unknown status "${statusText || '(empty)'}".`,
        fixGuidance:
          'Map this row to finish, DNF, DNS, or DQ (Spanish equivalents are accepted) before importing.',
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
        // Duplicate bibs collide with the DB unique index, so treat them as blockers
        // rather than warnings (RES-15/16).
        addIssue(blockers, {
          severity: 'blocker',
          rowNumber,
          fieldKey: 'bibNumber',
          sourceColumn: params.mapping.bibNumber,
          message: `Duplicate bib "${bibNumber}" also appears on row ${originalRowNumber}.`,
          fixGuidance: 'Give each runner in this distance a unique bib before importing.',
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
