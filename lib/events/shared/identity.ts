export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function parseIsoDate(value: string): string | null {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const date = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return trimmed;
}

export function toIsoDateString(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const parsed = parseIsoDate(value);
    return parsed ?? null;
  }
  return value.toISOString().split('T')[0] ?? null;
}
