export type ParsedCsv = {
  headers: string[];
  rows: string[][];
};

function stripBom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

export function parseCsv(text: string): ParsedCsv {
  const input = stripBom(text);
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        const next = input[i + 1];
        if (next === '"') {
          currentField += '"';
          i += 1;
          continue;
        }
        inQuotes = false;
        continue;
      }

      currentField += char;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ',') {
      currentRow.push(currentField);
      currentField = '';
      continue;
    }

    if (char === '\r') continue;

    if (char === '\n') {
      currentRow.push(currentField);
      currentField = '';

      // Skip completely empty trailing lines
      if (currentRow.some((v) => v.trim() !== '')) {
        rows.push(currentRow);
      }
      currentRow = [];
      continue;
    }

    currentField += char;
  }

  if (inQuotes) {
    throw new Error('CSV_PARSE_ERROR_UNCLOSED_QUOTE');
  }

  currentRow.push(currentField);
  if (currentRow.some((v) => v.trim() !== '')) {
    rows.push(currentRow);
  }

  const [headerRow, ...dataRows] = rows;
  const headers = (headerRow ?? []).map((h) => h.trim());

  return { headers, rows: dataRows };
}

export const GROUP_REGISTRATION_TEMPLATE_HEADERS = [
  'firstName',
  'lastName',
  'email',
  'dateOfBirth',
  'phone',
  'gender',
  'genderIdentity',
  'city',
  'state',
  'country',
  'emergencyContactName',
  'emergencyContactPhone',
  'distanceId',
  'distanceLabel',
  'addOnSelections',
] as const;

export type GroupRegistrationTemplateHeader = (typeof GROUP_REGISTRATION_TEMPLATE_HEADERS)[number];

export const GROUP_REGISTRATION_TEMPLATE_EXAMPLE_ROW = [
  'Ana',
  'Perez',
  'ana.perez@example.com',
  '1990-01-15',
  '',
  '',
  '',
  '',
  '',
  'MX',
  '',
  '',
  '',
  '',
  '',
  '',
] as const;

export function generateGroupRegistrationTemplateCsv(): string {
  const headerLine = GROUP_REGISTRATION_TEMPLATE_HEADERS.join(',');
  const exampleLine = GROUP_REGISTRATION_TEMPLATE_EXAMPLE_ROW.join(',');

  return `${headerLine}\n${exampleLine}\n`;
}
