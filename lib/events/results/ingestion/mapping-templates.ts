export type ResultImportCanonicalFieldKey =
  | 'runnerFullName'
  | 'bibNumber'
  | 'finishTimeMillis'
  | 'status'
  | 'gender'
  | 'age'
  | 'overallPlace'
  | 'genderPlace'
  | 'ageGroupPlace'
  | 'distanceLabel';

export type ResultImportCanonicalField = {
  key: ResultImportCanonicalFieldKey;
  required: boolean;
};

export type ResultImportFieldMapping = Record<ResultImportCanonicalFieldKey, string | null>;

export type ResultImportMappingTemplate = {
  id: string;
  name: string;
  headerSignature: string;
  mapping: ResultImportFieldMapping;
  createdAt: string;
  updatedAt: string;
};

type CanonicalFieldDefinition = ResultImportCanonicalField & {
  aliases: readonly string[];
};

const CANONICAL_FIELD_DEFINITIONS: readonly CanonicalFieldDefinition[] = [
  {
    key: 'runnerFullName',
    required: true,
    aliases: ['runner', 'runner name', 'name', 'full name', 'athlete', 'athlete name'],
  },
  {
    key: 'bibNumber',
    required: false,
    aliases: ['bib', 'bib number', 'bibno', 'dorsal', 'dorsal number'],
  },
  {
    key: 'finishTimeMillis',
    required: true,
    aliases: ['finish time', 'time', 'chip time', 'net time', 'elapsed time'],
  },
  {
    key: 'status',
    required: false,
    aliases: ['status', 'result status', 'outcome'],
  },
  {
    key: 'gender',
    required: false,
    aliases: ['gender', 'sex'],
  },
  {
    key: 'age',
    required: false,
    aliases: ['age'],
  },
  {
    key: 'overallPlace',
    required: false,
    aliases: ['overall place', 'overall rank', 'overall', 'place', 'rank'],
  },
  {
    key: 'genderPlace',
    required: false,
    aliases: ['gender place', 'gender rank', 'rank gender', 'gender position'],
  },
  {
    key: 'ageGroupPlace',
    required: false,
    aliases: ['age group place', 'age group rank', 'ag rank', 'category rank'],
  },
  {
    key: 'distanceLabel',
    required: false,
    aliases: ['distance', 'distance label', 'distance name', 'course'],
  },
] as const;

export const RESULT_IMPORT_CANONICAL_FIELDS: readonly ResultImportCanonicalField[] =
  CANONICAL_FIELD_DEFINITIONS.map((definition) => ({
    key: definition.key,
    required: definition.required,
  }));

const EMPTY_RESULT_IMPORT_FIELD_MAPPING: ResultImportFieldMapping = {
  runnerFullName: null,
  bibNumber: null,
  finishTimeMillis: null,
  status: null,
  gender: null,
  age: null,
  overallPlace: null,
  genderPlace: null,
  ageGroupPlace: null,
  distanceLabel: null,
};

export function createEmptyResultImportFieldMapping(): ResultImportFieldMapping {
  return { ...EMPTY_RESULT_IMPORT_FIELD_MAPPING };
}

export function normalizeImportHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ');
}

export function buildResultImportHeaderSignature(headers: readonly string[]): string {
  const normalized = headers
    .map((header) => normalizeImportHeader(header))
    .filter((header) => header.length > 0)
    .sort();

  return normalized.join('|');
}

export function inferResultImportFieldMapping(
  headers: readonly string[],
): ResultImportFieldMapping {
  const mapping = createEmptyResultImportFieldMapping();
  const normalizedHeaders = headers.map((header) => normalizeImportHeader(header));
  const consumedIndexes = new Set<number>();

  const findBestHeaderIndex = (aliases: readonly string[]): number => {
    const normalizedAliases = aliases.map((alias) => normalizeImportHeader(alias));

    for (let i = 0; i < normalizedHeaders.length; i += 1) {
      if (consumedIndexes.has(i)) continue;
      if (normalizedAliases.includes(normalizedHeaders[i])) return i;
    }

    for (let i = 0; i < normalizedHeaders.length; i += 1) {
      if (consumedIndexes.has(i)) continue;
      const normalizedHeader = normalizedHeaders[i];
      if (
        normalizedAliases.some(
          (alias) => normalizedHeader.includes(alias) || alias.includes(normalizedHeader),
        )
      ) {
        return i;
      }
    }

    return -1;
  };

  for (const definition of CANONICAL_FIELD_DEFINITIONS) {
    const matchIndex = findBestHeaderIndex(definition.aliases);
    if (matchIndex === -1) continue;
    consumedIndexes.add(matchIndex);
    mapping[definition.key] = headers[matchIndex] ?? null;
  }

  return mapping;
}

export function applyResultImportTemplateMapping(params: {
  templateMapping: ResultImportFieldMapping;
  availableHeaders: readonly string[];
}): ResultImportFieldMapping {
  const available = new Set(params.availableHeaders);
  const nextMapping = createEmptyResultImportFieldMapping();

  for (const field of RESULT_IMPORT_CANONICAL_FIELDS) {
    const templateValue = params.templateMapping[field.key];
    nextMapping[field.key] = templateValue && available.has(templateValue) ? templateValue : null;
  }

  return nextMapping;
}

export function isResultImportMappingComplete(mapping: ResultImportFieldMapping): boolean {
  return RESULT_IMPORT_CANONICAL_FIELDS.every(
    (field) => !field.required || Boolean(mapping[field.key]),
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isCanonicalFieldKey(value: string): value is ResultImportCanonicalFieldKey {
  return RESULT_IMPORT_CANONICAL_FIELDS.some((field) => field.key === value);
}

function coerceMapping(value: unknown): ResultImportFieldMapping | null {
  if (!isObject(value)) return null;

  const nextMapping = createEmptyResultImportFieldMapping();
  for (const [key, rawValue] of Object.entries(value)) {
    if (!isCanonicalFieldKey(key)) continue;
    nextMapping[key] = typeof rawValue === 'string' && rawValue.trim().length > 0 ? rawValue : null;
  }

  return nextMapping;
}

export function coerceResultImportMappingTemplates(
  value: unknown,
): ResultImportMappingTemplate[] {
  if (!Array.isArray(value)) return [];

  const templates: ResultImportMappingTemplate[] = [];
  for (const item of value) {
    if (!isObject(item)) continue;

    const mapping = coerceMapping(item.mapping);
    if (!mapping) continue;

    const id = typeof item.id === 'string' ? item.id : '';
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    const headerSignature =
      typeof item.headerSignature === 'string' ? item.headerSignature : '';
    const createdAt = typeof item.createdAt === 'string' ? item.createdAt : '';
    const updatedAt = typeof item.updatedAt === 'string' ? item.updatedAt : createdAt;

    if (!id || !name || !headerSignature || !createdAt) continue;

    templates.push({
      id,
      name,
      headerSignature,
      mapping,
      createdAt,
      updatedAt,
    });
  }

  return templates;
}
