import { parseCsv } from '@/lib/events/group-registrations/csv';

import { buildResultImportHeaderSignature, normalizeImportHeader } from './mapping-templates';

export type ParsedResultImportSampleRow = {
  rowNumber: number;
  values: Record<string, string>;
};

export type ParsedResultImportFile = {
  fileName: string;
  headers: string[];
  rows: string[][];
  sampleRows: ParsedResultImportSampleRow[];
  totalRows: number;
  headerSignature: string;
};

export type ResultImportParseErrorCode =
  | 'unsupported_format'
  | 'file_too_large'
  | 'empty_file'
  | 'missing_headers'
  | 'duplicate_headers'
  | 'malformed_file';

export class ResultImportParseError extends Error {
  constructor(
    public readonly code: ResultImportParseErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ResultImportParseError';
  }
}

export const RESULT_IMPORT_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
export const RESULT_IMPORT_SAMPLE_ROW_LIMIT = 5;

const SUPPORTED_EXTENSIONS = new Set(['csv', 'xls', 'xlsx']);

function toCellString(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function getFileExtension(fileName: string): string | null {
  const trimmed = fileName.trim();
  const lastDot = trimmed.lastIndexOf('.');
  if (lastDot < 0 || lastDot === trimmed.length - 1) return null;
  return trimmed.slice(lastDot + 1).toLowerCase();
}

function validateFile(file: File): string {
  const extension = getFileExtension(file.name);
  if (!extension || !SUPPORTED_EXTENSIONS.has(extension)) {
    throw new ResultImportParseError(
      'unsupported_format',
      'Unsupported file type. Upload a .csv, .xls, or .xlsx file.',
    );
  }

  if (file.size <= 0) {
    throw new ResultImportParseError(
      'empty_file',
      'The uploaded file is empty. Add data rows and upload again.',
    );
  }

  if (file.size > RESULT_IMPORT_MAX_FILE_SIZE_BYTES) {
    throw new ResultImportParseError(
      'file_too_large',
      'The file exceeds the 5MB upload limit. Split the file and try again.',
    );
  }

  return extension;
}

function validateHeaders(headers: string[]): void {
  if (headers.length === 0 || headers.every((header) => header.length === 0)) {
    throw new ResultImportParseError(
      'missing_headers',
      'No headers were found. Add a header row before uploading.',
    );
  }

  const duplicateHeaders: string[] = [];
  const seen = new Set<string>();
  for (const header of headers) {
    const normalized = normalizeImportHeader(header);
    if (!normalized) continue;
    if (seen.has(normalized) && !duplicateHeaders.includes(header)) {
      duplicateHeaders.push(header);
      continue;
    }
    seen.add(normalized);
  }

  if (duplicateHeaders.length > 0) {
    throw new ResultImportParseError(
      'duplicate_headers',
      `Duplicate headers found (${duplicateHeaders.join(', ')}). Rename duplicate columns and retry.`,
    );
  }
}

function toSampleRows(params: {
  headers: string[];
  rows: string[][];
  sampleRowLimit: number;
}): ParsedResultImportSampleRow[] {
  return params.rows.slice(0, params.sampleRowLimit).map((row, index) => {
    const values: Record<string, string> = {};
    params.headers.forEach((header, headerIndex) => {
      values[header] = row[headerIndex] ?? '';
    });
    return {
      rowNumber: index + 2,
      values,
    };
  });
}

function parseCsvRows(text: string): { headers: string[]; rows: string[][] } {
  const parsed = parseCsv(text);
  const headers = parsed.headers.map((header) => header.trim());
  const rows = parsed.rows.map((row) => row.map((value) => value.trim()));
  return { headers, rows };
}

async function parseSpreadsheetRows(
  file: File,
): Promise<{ headers: string[]; rows: string[][] }> {
  const xlsx = await import('xlsx');
  const data = await file.arrayBuffer();
  const workbook = xlsx.read(data, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new ResultImportParseError(
      'missing_headers',
      'No worksheet was found. Add a worksheet with headers and try again.',
    );
  }

  const firstSheet = workbook.Sheets[firstSheetName];
  const rawRows = xlsx.utils.sheet_to_json(firstSheet, {
    header: 1,
    defval: '',
    raw: false,
  }) as unknown[][];

  const normalizedRows = rawRows
    .map((row: unknown[]) => row.map((cell: unknown) => toCellString(cell)))
    .filter((row: string[]) => row.some((value: string) => value.length > 0));

  const [headerRow, ...dataRows] = normalizedRows;
  return {
    headers: (headerRow ?? []).map((header: string) => header.trim()),
    rows: dataRows.map((row: string[]) => row.map((value: string) => value.trim())),
  };
}

async function readFileText(file: File): Promise<string> {
  if (typeof file.text === 'function') {
    return file.text();
  }

  if (typeof file.arrayBuffer === 'function' && typeof TextDecoder !== 'undefined') {
    const buffer = await file.arrayBuffer();
    return new TextDecoder().decode(buffer);
  }

  if (typeof FileReader !== 'undefined') {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Unable to read file'));
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.readAsText(file);
    });
  }

  throw new Error('Unable to read file');
}

export async function parseResultImportFile(
  file: File,
  sampleRowLimit = RESULT_IMPORT_SAMPLE_ROW_LIMIT,
): Promise<ParsedResultImportFile> {
  const extension = validateFile(file);

  try {
    const parsed =
      extension === 'csv'
        ? parseCsvRows(await readFileText(file))
        : await parseSpreadsheetRows(file);

    validateHeaders(parsed.headers);

    return {
      fileName: file.name,
      headers: parsed.headers,
      rows: parsed.rows,
      sampleRows: toSampleRows({
        headers: parsed.headers,
        rows: parsed.rows,
        sampleRowLimit: Math.max(sampleRowLimit, 1),
      }),
      totalRows: parsed.rows.length,
      headerSignature: buildResultImportHeaderSignature(parsed.headers),
    };
  } catch (error) {
    if (error instanceof ResultImportParseError) {
      throw error;
    }

    const errorSuffix =
      error instanceof Error && error.message
        ? ` (${error.message})`
        : '';

    throw new ResultImportParseError(
      'malformed_file',
      `The file could not be parsed. Verify delimiter/header formatting and try again.${errorSuffix}`,
    );
  }
}
