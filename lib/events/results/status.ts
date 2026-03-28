export const RESULT_ENTRY_STATUSES = ['finish', 'dq', 'dnf', 'dns'] as const;

export type ResultEntryStatus = (typeof RESULT_ENTRY_STATUSES)[number];
