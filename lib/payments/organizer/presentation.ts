export type OrganizerPayoutReasonFamily =
  | 'activePayout'
  | 'manualReview'
  | 'bankRejected'
  | 'processing'
  | 'paused'
  | 'failed'
  | 'genericReview';

const technicalAcronyms = new Map([
  ['api', 'API'],
  ['fx', 'FX'],
  ['id', 'ID'],
  ['ids', 'IDs'],
  ['mxn', 'MXN'],
  ['ui', 'UI'],
  ['url', 'URL'],
  ['uuid', 'UUID'],
]);

export function shortIdentifier(value: string, size = 8): string {
  const normalized = value.trim();
  if (normalized.length <= size) return normalized;
  return normalized.slice(0, size);
}

export function humanizeTechnicalCode(value: string): string {
  const normalized = value.trim();
  if (!normalized) return '';

  return normalized
    .replace(/[._-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((segment) => {
      const lower = segment.toLowerCase();
      const acronym = technicalAcronyms.get(lower);
      if (acronym) return acronym;
      return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
    })
    .join(' ');
}

export function getOrganizerPayoutReasonFamily(
  reasonCode: string | null | undefined,
): OrganizerPayoutReasonFamily {
  const normalized = reasonCode?.trim().toLowerCase() ?? '';

  if (!normalized) return 'genericReview';
  if (normalized.startsWith('active_') || normalized.includes('lifecycle_conflict')) {
    return 'activePayout';
  }
  if (normalized.includes('manual_review')) {
    return 'manualReview';
  }
  if (normalized.includes('bank') && (normalized.includes('reject') || normalized.includes('failed'))) {
    return 'bankRejected';
  }
  if (normalized.includes('processing')) {
    return 'processing';
  }
  if (normalized.includes('pause')) {
    return 'paused';
  }
  if (normalized.includes('fail') || normalized.includes('reject')) {
    return 'failed';
  }

  return 'genericReview';
}
