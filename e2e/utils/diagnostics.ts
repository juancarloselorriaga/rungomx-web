export type DiagnosticLevel = 'info' | 'warn' | 'error';

type DiagnosticDetails = Record<string, unknown> | null | undefined;

function normalizeValue(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (Array.isArray(value)) {
    return value.map(normalizeValue);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, normalizeValue(item)]),
    );
  }

  return value;
}

function toDiagnosticLine(payload: Record<string, unknown>) {
  try {
    return `[e2e:diag] ${JSON.stringify(payload)}`;
  } catch {
    return `[e2e:diag] {"level":"error","event":"diagnostics.serialization_failed"}`;
  }
}

function normalizeDetails(details: DiagnosticDetails): Record<string, unknown> {
  if (!details) return {};

  const normalized = normalizeValue(details);
  if (normalized && typeof normalized === 'object' && !Array.isArray(normalized)) {
    return normalized as Record<string, unknown>;
  }

  return { details: normalized };
}

export function emitDiagnostic(
  event: string,
  details: DiagnosticDetails = undefined,
  level: DiagnosticLevel = 'info',
) {
  const payload: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    scope: 'e2e',
    event,
    ...normalizeDetails(details),
  };

  const line = toDiagnosticLine(payload);
  if (level === 'error') {
    console.error(line);
    return;
  }
  if (level === 'warn') {
    console.warn(line);
    return;
  }
  console.log(line);
}
